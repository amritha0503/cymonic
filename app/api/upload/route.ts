import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const purpose = formData.get('purpose') as string;

    const merchant = formData.get('merchant') as string;
    const amount = formData.get('amount') as string;
    const date = formData.get('date') as string;

    if (!file || !purpose) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
    const { data: claimData, error: insertError } = await supabaseAdmin
      .from('claims')
      .insert({
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

    // Trigger Edge Function directly to ensure analysis runs even if webhook fails
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment');
      return NextResponse.json({ error: 'Server misconfigured: missing service role key' }, { status: 500 });
    }
    const { error: invokeError } = await supabaseAdmin.functions.invoke('audit-claim', {
      body: { record: claimData },
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey ?? ''
      }
    });
    if (invokeError) {
      console.error('Edge Function invocation error:', invokeError);
    }
    
    return NextResponse.json({ success: true, path: storageData.path, claim: claimData });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Upload process failed' }, { status: 500 });
  }
}
