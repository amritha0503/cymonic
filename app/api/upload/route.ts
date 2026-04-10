import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { runLocalAudit } from '@/lib/local-audit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const purpose = formData.get('purpose') as string;

    const merchant = formData.get('merchant') as string;
    const amount = formData.get('amount') as string;
    const date = formData.get('date') as string;
    const employeeEmail = formData.get('employee_email') as string;
    const employeeName = formData.get('employee_name') as string;
    const employeeId = formData.get('employee_id') as string;
    const ocrText = formData.get('ocr_text') as string | null;

    if (!file || !purpose) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${crypto.randomUUID()}-${file.name}`;
    
    // Auto-create missing bucket for prototype safety
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find(b => b.name === 'receipts')) {
      await supabaseAdmin.storage.createBucket('receipts', { public: true });
    }

    // Upload receipt to Supabase Storage
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('receipts')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
      });

    if (storageError) {
      console.error('Storage error:', storageError);
      return NextResponse.json({ error: 'Failed to upload receipt' }, { status: 500 });
    }

    // Insert database record
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'employee') {
      return NextResponse.json({ error: 'Only employees can submit claims' }, { status: 403 });
    }

    const { data: claimData, error: insertError } = await supabaseAdmin
      .from('claims')
      .insert({
        employee_id: user.id,
        employee_email: user.email || employeeEmail || null,
        employee_name: profile?.username || employeeName || null,
        business_purpose: purpose,
        date: date || new Date().toISOString().split('T')[0],
        merchant: merchant || 'Unknown',
        amount: amount ? parseFloat(amount) : 0,
        receipt_image_path: storageData.path,
        status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create claim record' }, { status: 500 });
    }

    const groqKey = process.env.GROQ_API_KEY ?? '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    if (groqKey) {
      try {
        await runLocalAudit({
          supabase: supabaseAdmin,
          claimId: claimData.id,
          businessPurpose: purpose,
          imageBuffer: fileBuffer,
          groqKey,
          model,
          ocrText: ocrText || undefined,
        });
      } catch (auditError) {
        console.error('Local audit failed:', auditError);
      }
    }
    
    return NextResponse.json({ success: true, path: storageData.path, claim: claimData });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Upload process failed' }, { status: 500 });
  }
}
