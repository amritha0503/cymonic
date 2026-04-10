import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

type CookieCallbacks = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: Record<string, unknown>) => void;
  remove: (name: string, options: Record<string, unknown>) => void;
};

export function createSupabaseServerClient(
  request: NextRequest,
  response: NextResponse
) {
  const cookieCallbacks: CookieCallbacks = {
    get: (name) => request.cookies.get(name)?.value,
    set: (name, value, options) => {
      response.cookies.set({ name, value, ...options });
    },
    remove: (name, options) => {
      response.cookies.set({ name, value: '', ...options, maxAge: 0 });
    },
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { cookies: cookieCallbacks }
  );
}
