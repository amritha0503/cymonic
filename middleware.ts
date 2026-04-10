import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const PUBLIC_PATHS = ["/login", "/unauthorized"]; 

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

async function getProfileRole(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data?.role) {
    return '';
  }

  return String(data.role).toLowerCase();
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  if (pathname === '/' || isPublicPath(pathname) || pathname.startsWith('/api')) {
    return response;
  }

  if (!pathname.startsWith('/employee') && !pathname.startsWith('/finance')) {
    return response;
  }

  const supabase = createSupabaseServerClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = await getProfileRole(supabase, user.id);

  if (pathname.startsWith('/employee') && role !== 'employee') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  if (pathname.startsWith('/finance') && role !== 'auditor') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/employee/:path*', '/finance/:path*'],
};
