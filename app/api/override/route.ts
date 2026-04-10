import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  try {
    const { claimId, newStatus, comment } = await req.json();

    if (!claimId || !newStatus || !comment) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return NextResponse.json({ error: 'Missing server configuration' }, { status: 500 });
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

    if (data?.id) {
      await supabase
        .from('audit_events')
        .insert({
          claim_id: data.id,
          actor_type: 'auditor',
          actor_id: user.id,
          action: 'manual_override',
          notes: comment,
          policy_version_id: data.policy_version_id || null,
          metadata: {
            status: newStatus,
          },
        });
    }

    return NextResponse.json({ success: true, claim: data });
  } catch (error) {
    console.error('Override Error:', error);
    return NextResponse.json({ error: 'Override failed' }, { status: 500 });
  }
}
