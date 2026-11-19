import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { sessionCookieName } from './lib/auth-cookies';

const intlMiddleware = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const rawHost =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    url.host ||
    '';
  const hostWithPort = rawHost.split(',')[0].trim();
  const hostname = hostWithPort.split(':')[0].toLowerCase();
  const isReportsHost = hostname.startsWith('reports.');
  const isPlatformHost = hostname.startsWith('platform.');
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]';
  const isBareDomain = !isPlatformHost && !isReportsHost && !isLocalHost && Boolean(hostname);
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    .trim();
  const protocol = forwardedProto ? `${forwardedProto}:` : url.protocol;
  const platformOrigin = isBareDomain
    ? `${protocol}//platform.${hostWithPort}`
    : `${protocol}//${hostWithPort}`;
  const landingOrigin = isPlatformHost
    ? `${protocol}//${hostWithPort.replace(/^platform\./i, '')}`
    : `${protocol}//${hostWithPort}`;

  // Serve static HTML reports and the reports landing dashboard directly without locale or auth redirects
  if (
    url.pathname === '/frontend-cucumber' ||
    url.pathname === '/frontend-cucumber/'
  ) {
    return NextResponse.rewrite(new URL('/frontend-cucumber/index.html', request.url));
  }
  if (
    url.pathname === '/frontend-coverage' ||
    url.pathname === '/frontend-coverage/'
  ) {
    return NextResponse.rewrite(new URL('/frontend-coverage/index.html', request.url));
  }
  if (
    url.pathname.startsWith('/frontend-cucumber/') ||
    url.pathname.startsWith('/frontend-coverage/') ||
    url.pathname.startsWith('/reports-dashboard/')
  ) {
    return NextResponse.next();
  }
  if (isReportsHost && (url.pathname === '/' || url.pathname === '')) {
    return NextResponse.rewrite(new URL('/reports-dashboard/index.html', request.url));
  }

  // 1. Run the i18n middleware first to ensure the locale is handled
  const response = intlMiddleware(request);

  // If the i18n middleware is redirecting (e.g. adding the /en/ prefix), return it immediately
  if (response.headers.get('location')) {
    return response;
  }

  const localeRegex = /^\/(en|da|fr|es|de|sv|no|nl|it|pl|fi|pt|is)(?=\/|$)/;
  const pathWithoutLocale = url.pathname.replace(localeRegex, '') || '/';
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
    const loginRedirect = new URL(`/${locale}`, landingOrigin);
    loginRedirect.searchParams.set('authRequired', '1');
    if (url.searchParams.get('emailVerified') === '1') {
      loginRedirect.searchParams.set('emailVerified', '1');
    }
    return NextResponse.redirect(loginRedirect);
  }

  // If an authenticated user accesses a dashboard route on the bare domain (e.g. 157.180.43.151.nip.io),
  // switch them to the platform.<domain> subdomain
  if (token && isDashboardPath && isBareDomain) {
    return NextResponse.redirect(
      new URL(`${url.pathname}${url.search}`, platformOrigin),
    );
  }

  const normalizedRoles = Array.isArray(token?.roles)
    ? (token.roles as unknown[]).map((r) =>
        String(r).toLowerCase().replace(/^role_/, '')
      )
    : [];
  const hasAdminRole =
    normalizedRoles.includes('admin') || normalizedRoles.includes('management');
  const hasTherapistRole =
    normalizedRoles.includes('therapist') ||
    normalizedRoles.includes('provider') ||
    hasAdminRole;

  if (token) {
    if (
      (pathWithoutLocale === '/dashboard/admin' ||
        pathWithoutLocale.startsWith('/dashboard/admin/')) &&
      !hasAdminRole
    ) {
      return NextResponse.redirect(
        new URL(
          `/${locale}/dashboard/${hasTherapistRole ? 'therapist' : 'personal'}`,
          platformOrigin,
        ),
      );
    }

    if (
      (pathWithoutLocale === '/dashboard/therapist' ||
        pathWithoutLocale.startsWith('/dashboard/therapist/')) &&
      !hasTherapistRole
    ) {
      return NextResponse.redirect(
        new URL(`/${locale}/dashboard/personal`, platformOrigin),
      );
    }

    if (pathWithoutLocale === '/dashboard') {
      return NextResponse.redirect(
        new URL(
          `/${locale}/dashboard/${hasTherapistRole ? 'therapist' : 'personal'}`,
          platformOrigin,
        ),
      );
    }
  }

  // Redirect authenticated users on root /{locale} directly to their dashboard on platform.<domain>
  if (token && pathWithoutLocale === '/') {
    const dashboard = hasTherapistRole ? 'therapist' : 'personal';
    const dashboardUrl = new URL(`/${locale}/dashboard/${dashboard}`, platformOrigin);
    if (url.searchParams.get('emailVerified') === '1') {
      dashboardUrl.searchParams.set('emailVerified', '1');
    }
    return NextResponse.redirect(dashboardUrl);
  }

  // If an unauthenticated user visits the root landing page via platform.<domain>, redirect to the bare domain
  if (!token && pathWithoutLocale === '/' && isPlatformHost) {
    return NextResponse.redirect(
      new URL(`${url.pathname}${url.search}`, landingOrigin),
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

