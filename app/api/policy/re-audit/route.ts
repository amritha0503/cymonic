import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { runLocalAudit } from '@/lib/local-audit';

type ReAuditRequest = {
  startDate: string;
  endDate: string;
  policyVersionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
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

    const body = (await req.json()) as ReAuditRequest;
    const startDate = body.startDate?.trim();
    const endDate = body.endDate?.trim();

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing date range' }, { status: 400 });
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

    const { data: claims, error } = await supabase
      .from('claims')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) {
      return NextResponse.json({ error: 'Failed to load claims' }, { status: 500 });
    }

    const groqKey = process.env.GROQ_API_KEY ?? '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!groqKey) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 });
    }

    let processed = 0;

    for (const claim of claims || []) {
      const receiptPath = claim.receipt_image_path as string | null;
      if (!receiptPath) {
        continue;
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('receipts')
        .download(receiptPath);

      if (downloadError || !fileData) {
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      await runLocalAudit({
        supabase,
        claimId: claim.id,
        businessPurpose: claim.business_purpose || '',
        imageBuffer: buffer,
        policyVersionId: body.policyVersionId || null,
        groqKey,
        model,
      });

      processed += 1;
    }

    return NextResponse.json({ success: true, processed, total: claims?.length || 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to re-audit claims';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
