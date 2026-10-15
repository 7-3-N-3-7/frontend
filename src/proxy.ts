import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { sessionCookieName } from './lib/auth-cookies';

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

  const localeRegex = /^\/(en|da|fr|es|de|sv|no|nl|it|pl|fi|pt|is)(?=\/|$)/;
  const pathWithoutLocale = url.pathname.replace(localeRegex, '') || '/';
  const isPlatformHost = hostname.startsWith('platform.');
  const isPublicPath =
    pathWithoutLocale.startsWith('/auth') || pathWithoutLocale.startsWith('/api');
  const isDashboardPath = pathWithoutLocale.startsWith('/dashboard');
  const requiresAuthentication =
    isDashboardPath || (isPlatformHost && !isPublicPath && pathWithoutLocale !== '/');
  const shouldReadToken =
    requiresAuthentication || pathWithoutLocale === '/';

  const token = shouldReadToken
    ? await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
        cookieName: sessionCookieName,
      })
    : null;

  const urlLocale = url.pathname.match(localeRegex)?.[1];
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  const preferredLocale =
    cookieLocale && (routing.locales as readonly string[]).includes(cookieLocale)
      ? cookieLocale
      : urlLocale || 'en';
  const locale = urlLocale || preferredLocale;

  if (!token && requiresAuthentication) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  const roles = Array.isArray(token?.roles) ? (token.roles as string[]) : [];

  // Redirect authenticated users on root /{locale} directly to their dashboard
  // (Avoids intlMiddleware x-middleware-rewrite header collision on platform.localhost)
  if (token && pathWithoutLocale === '/') {
    const dashboard = roles.includes('therapist')
      ? 'therapist'
      : 'personal';
    return NextResponse.redirect(
      new URL(`/${preferredLocale}/dashboard/${dashboard}`, request.url),
    );
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/(en|da|fr|es|de|sv|no|nl|it|pl|fi|pt|is)/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)',
  ],
};

