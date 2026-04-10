import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runLocalAudit } from '@/lib/local-audit';

export async function POST(req: Request) {
  try {
    const { claimId, imageBase64, businessPurpose, ocrText } = await req.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const groqKey = process.env.GROQ_API_KEY ?? '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!supabaseUrl || !serviceRoleKey || !groqKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const { auditData } = await runLocalAudit({
      supabase,
      claimId,
      businessPurpose,
      imageBuffer,
      groqKey,
      model,
      ocrText,
    });

    return NextResponse.json({ success: true, audit: auditData });
  } catch (error: unknown) {
    console.error('Audit Error:', error);
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 });
  }
}
