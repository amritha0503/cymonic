import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { claimId, newStatus, comment } = await req.json();

    if (!claimId || !newStatus || !comment) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing server configuration' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from('claims')
      .update({ 
        status: newStatus, 
        override_comment: comment,
        overridden_at: new Date().toISOString()
      })
      .eq('id', claimId)
      .select('*')
      .single();

    if (error) {
       console.error('Update failed', error);
       return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    if (data?.employee_id) {
      const message = `Manual override: claim ${String(data.id).slice(0, 8)} is ${String(newStatus).toUpperCase()}. Comment: ${comment}`;
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          employee_id: data.employee_id,
          claim_id: data.id,
          message,
        });

      if (notificationError) {
        console.error('Notification insert failed', notificationError);
      }
    }

    return NextResponse.json({ success: true, claim: data });
  } catch (error) {
    console.error('Override Error:', error);
    return NextResponse.json({ error: 'Override failed' }, { status: 500 });
  }
}
