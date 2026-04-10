import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

async function getEmbedding(text: string) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small"
    })
  });

  const data = await response.json();
  if (!data.data || !data.data[0]) {
    throw new Error('Failed to generate embedding');
  }
  return data.data[0].embedding;
}

export async function POST(req: Request) {
  try {
    const { claimId, imageBase64, businessPurpose, employeeEmail } = await req.json();

    // 1. OpenAI reads the receipt image directly via Vision
    const ocrRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract: merchant, date, total, currency, line_items as JSON only." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }],
        max_tokens: 1024,
        response_format: { type: "json_object" }
      })
    });
    const ocrData = await ocrRes.json();
    const extractionResult = ocrData.choices?.[0]?.message?.content || '{}';

    // 2. Find relevant policy chunks from Supabase pgvector
    const embedding = await getEmbedding(businessPurpose + " " + extractionResult);
    const { data: policyChunks, error: rpcError } = await supabase.rpc('match_policy', { query_embedding: embedding, match_count: 5 });
    
    if (rpcError) throw rpcError;
    const policyExcerpts = policyChunks ? policyChunks.map((c: any) => c.content).join('\n---\n') : "No specific policy matched.";

    // 3. OpenAI audits against policy
    const verdictRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a corporate expense auditor. Return JSON only: { \"status\": \"approved\" | \"flagged\" | \"rejected\", \"reason\": \"string\", \"policy_excerpt\": \"string\", \"confidence\": 99 }" },
          { role: "user", content: `Receipt: ${extractionResult}\nBusiness purpose: ${businessPurpose}\nPolicy excerpts: ${policyExcerpts}` }
        ],
        max_tokens: 1024,
        response_format: { type: "json_object" }
      })
    });
    const verdictData = await verdictRes.json();
    const verdictText = verdictData.choices?.[0]?.message?.content || '{}';
    // Clean up markdown block if OpenAI adds it
    const cleanJsonText = verdictText.replace(/```json/g, '').replace(/```/g, '').trim();
    const auditData = JSON.parse(cleanJsonText);

    // 4. Save AI recommendation (do not change manual status)
    await supabase.from('claims').update({ 
      ai_status: auditData.status,
      ai_reason: auditData.reason,
      policy_excerpt: auditData.policy_excerpt,
      ai_confidence: auditData.confidence
    }).eq('id', claimId);
    
    if (employeeEmail) {
      await sendEmail(employeeEmail, `Your Claim ${claimId} has been audited`, `The status of your claim is: ${auditData.status}`);
    }

    return NextResponse.json({ success: true, audit: auditData });
  } catch (error) {
    console.error('Audit Error:', error);
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 });
  }
}
