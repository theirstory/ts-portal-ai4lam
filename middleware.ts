import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip if on gatekeeper page, API routes, or static files
  if (
    pathname.startsWith('/gatekeeper') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.') || // matches images, fonts, etc.
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next();
  }

  // 2. Check for site password requirement in env
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return NextResponse.next();
  }

  // 3. Check for auth cookie
  const authCookie = request.cookies.get('ts_site_access');
  if (authCookie?.value === sitePassword) {
    return NextResponse.next();
  }

  // 4. Redirect to gatekeeper if not authenticated
  const url = request.nextUrl.clone();
  // The query string is part of where they were going: a shared link to a
  // moment carries ?start=&end=, and sending them back to the bare path would
  // drop them at the top of an hour-long recording instead.
  const callbackUrl = `${pathname}${request.nextUrl.search}`;
  url.pathname = '/gatekeeper';
  url.search = '';
  url.searchParams.set('callbackUrl', callbackUrl);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
