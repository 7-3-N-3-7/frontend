import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // 1. Run the i18n middleware first to ensure the locale is handled
  const response = intlMiddleware(request);

  // If the i18n middleware is redirecting (e.g. adding the /en/ prefix), return it immediately
  if (response.headers.get('location')) {
    return response;
  }

  // 2. Perform authentication logic
  if (hostname.startsWith('platform.')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // We need to account for the locale in the pathname.
    // next-intl might have rewritten the request internally, but `request.nextUrl.pathname` 
    // is what we look at. Let's extract the locale prefix if it exists.
    const pathWithoutLocale = url.pathname.replace(/^\/(en|da|fr|es|de)/, '') || '/';

    // Root path routing
    if (pathWithoutLocale === '/') {
      if (token) {
        const roles = (token.roles as string[]) || [];
        const locale = url.pathname.match(/^\/(en|da|fr|es|de)/)?.[1] || 'en';
        let rewriteResp;
        if (roles.includes('therapist')) {
          rewriteResp = NextResponse.rewrite(new URL(`/${locale}/dashboard/therapist`, request.url));
        } else {
          rewriteResp = NextResponse.rewrite(new URL(`/${locale}/dashboard/personal`, request.url));
        }
        
        // Preserve next-intl headers so the rewritten route knows its locale!
        response.headers.forEach((value, key) => {
          rewriteResp.headers.set(key, value);
        });
        
        return rewriteResp;
      }
    }

    if (!token && !pathWithoutLocale.startsWith('/auth') && !pathWithoutLocale.startsWith('/api') && pathWithoutLocale !== '/') {
      const locale = url.pathname.match(/^\/(en|da|fr|es|de)/)?.[1] || 'en';
      return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/', 
    '/(en|da|fr|es|de)/:path*', 
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'
  ]
};
