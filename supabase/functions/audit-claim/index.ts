// Setup: supabase functions new audit-claim
// Run: supabase functions deploy audit-claim

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Declare Deno global to suppress TS errors if the Deno VSCode extension is not active
declare const Deno: any;

console.log("Audit Claim Edge Function up and running!");

serve(async (req: Request) => {
  try {
    // This function can be triggered via Postgres Webhook when a NEW row is inserted into 'claims'
    // Or called directly via Supabase Edge Function invoke.
    const body = await req.json();
    
    // Webhook shape usually contains the new database record inside 'record'
    const claim = body.record || body;
    const { id: claimId, receipt_image_path, business_purpose } = claim;

    if (!receipt_image_path) {
      return new Response(JSON.stringify({ error: "No receipt attached." }), { status: 400 });
    }

    // 1. Initialize Clients via Deno Environment Variables
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // Service role bypasses RLS
    );
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

    // 2. Fetch the actual Receipt Image from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("receipts")
      .download(receipt_image_path);

    if (downloadError) throw downloadError;

    // Convert blobs to Base64 for Claude Vision
    const buffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Image = btoa(binary);

    // 3. Extract OCR using Gemini Vision
    const ocrRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Extract: merchant, date, total, currency, line_items as JSON only." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    const ocrData = await ocrRes.json();
    const extractionResult = ocrData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // 4. Perform Vector Search for Policy via match_policy RPC
    // Generate an embedding for the business purpose and extracted receipt details
    const textToEmbed = `Purpose: ${business_purpose}\nReceipt Details: ${extractionResult}`;
    
    // Call Gemini Embeddings endpoint
    const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: { parts: [{ text: textToEmbed }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: 768
      })
    });
    const embedData = await embedRes.json();
    if (embedData.error) {
      throw new Error(`Embedding API error: ${embedData.error.message || JSON.stringify(embedData.error)}`);
    }

    const queryEmbedding = embedData.embedding?.values;
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new Error(`Failed to generate embedding. Response: ${JSON.stringify(embedData)}`);
    }

    // Normalize for cosine similarity when using reduced dimensionality
    const norm = Math.sqrt(queryEmbedding.reduce((sum: number, v: number) => sum + v * v, 0));
    const normalizedEmbedding = norm > 0 ? queryEmbedding.map((v: number) => v / norm) : queryEmbedding;

    // Pass the real embedding into the `query_embedding` arg of match_policy
     const { data: policyChunks, error: rpcError } = await supabase.rpc('match_policy', {
       query_embedding: normalizedEmbedding,
       match_count: 5 // Retrieve the top 5 most relevant policy chunks
    });
    
    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw rpcError;
    }

    // 5. Final Audit Verdict using Gemini
    const verdictRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `You are an expert Corporate Expense Auditor.
Your job is to strictly evaluate the Receipt Data and Business Purpose against the provided Corporate Policy Chunks.
1. Constraint Validation: Check the math for the actual specific expense type (e.g., Breakfast vs Lunch limit) using line items or total. If any limit is exceeded, or if prohibited items like alcohol exist, "reject" or "flag".
2. Contextual Audit: Compare "Business Purpose" against receipt items. For example, if it says "Team Building" but has 1 meal, flag it.
3. If no policy violations exist, status is "approved".
Output strict JSON: { "status": "approved"|"flagged"|"rejected", "reason": "Generate a 1-sentence explanation citing the specific policy rule", "policy_excerpt": "string", "confidence": number_0_to_100 }` }]
        },
        contents: [{
          parts: [{ text: `Receipt Data: ${extractionResult}\nPurpose: ${business_purpose}\nPolicy: ${JSON.stringify(policyChunks)}` }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });
    const verdictData = await verdictRes.json();
    const verdictText = verdictData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJsonText = verdictText.replace(/```json/g, '').replace(/```/g, '').trim();
    const auditData = JSON.parse(cleanJsonText || '{}');

    // 6. Update the Claim table with the AI recommendation only
    await supabase
      .from('claims')
      .update({
        ai_status: auditData.status,
        ai_reason: auditData.reason,
        policy_excerpt: auditData.policy_excerpt,
        ai_confidence: auditData.confidence,
      })
      .eq('id', claimId);

    // 7. Could also trigger Resend Email directly via fetch() to resend API here

    return new Response(JSON.stringify({ success: true, verdict: auditData }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
