import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import pdf from 'pdf-parse';

type PolicyChunkInsert = {
  policy_version_id: string;
  section_title: string;
  content: string;
  embedding: number[];
};

function chunkText(text: string, maxChars: number = 1000): string[] {
  const paragraphs = text.split('\n\n');
  let currentChunk = '';
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if ((currentChunk.length + paragraph.length) > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += `${paragraph}\n\n`;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function getEmbedding(text: string, geminiKey: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      }),
    }
  );

  const data = await response.json();
  if (!data.embedding?.values) {
    throw new Error('Failed to generate embedding');
  }

  const values = data.embedding.values as number[];
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? values.map((v) => v / norm) : values;
}

async function extractPdfTextWithGemini(buffer: Buffer, geminiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'Extract the full policy text from this PDF. Return plain text only.' },
              { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'text/plain',
        },
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'Failed to extract PDF text');
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const geminiKey = process.env.GEMINI_API_KEY ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    if (!supabaseUrl || !serviceRoleKey || !geminiKey || !anonKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const authSupabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    });

    const { data: authData } = await authSupabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'auditor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const name = String(formData.get('name') || '').trim();
    const effectiveDate = String(formData.get('effective_date') || '').trim();
    const makeActive = String(formData.get('make_active') || 'true') === 'true';

    if (!file || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let rawText = '';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parsed = await pdf(buffer);
      rawText = parsed.text || '';

      if (!rawText.trim()) {
        rawText = await extractPdfTextWithGemini(buffer, geminiKey);
      }
    } else {
      rawText = await file.text();
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Failed to extract text from policy file' }, { status: 400 });
    }
    const chunks = chunkText(rawText);

    const { data: policyVersion, error: policyError } = await supabase
      .from('policy_versions')
      .insert({
        name,
        effective_date: effectiveDate || null,
        source_filename: file.name,
        is_active: makeActive,
      })
      .select()
      .single();

    if (policyError || !policyVersion) {
      return NextResponse.json({ error: 'Failed to create policy version' }, { status: 500 });
    }

    if (makeActive) {
      await supabase
        .from('policy_versions')
        .update({ is_active: false })
        .neq('id', policyVersion.id);
    }

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const embedding = await getEmbedding(chunk, geminiKey);

      const payload: PolicyChunkInsert = {
        policy_version_id: policyVersion.id,
        section_title: `Section part ${index + 1}`,
        content: chunk,
        embedding,
      };

      const { error: insertError } = await supabase
        .from('policy_chunks')
        .insert(payload);

      if (insertError) {
        console.error('Policy chunk insert error:', insertError);
        return NextResponse.json({ error: insertError.message || 'Failed to store policy chunk' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, policyVersion });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload policy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
