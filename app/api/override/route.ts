import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { claimId, newStatus, comment } = await req.json();

    if (!claimId || !newStatus || !comment) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { error } = await supabase
      .from('claims')
      .update({ 
        status: newStatus, 
        override_comment: comment,
        overridden_at: new Date().toISOString()
      })
      .eq('id', claimId);

    if (error) {
       console.error('Update failed', error);
       return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Override Error:', error);
    return NextResponse.json({ error: 'Override failed' }, { status: 500 });
  }
}
