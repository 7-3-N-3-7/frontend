import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Only apply logic if on the platform domain
  if (hostname.startsWith('platform.')) {
    // We can fetch the JWT token
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Root path routing
    if (url.pathname === '/') {
      if (token) {
        // If logged in, route them to their dashboard!
        const roles = (token.roles as string[]) || [];
        if (roles.includes('therapist')) {
          return NextResponse.rewrite(new URL('/dashboard/therapist', request.url));
        } else {
          return NextResponse.rewrite(new URL('/dashboard/personal', request.url));
        }
      } else {
        // If NOT logged in, let them see the landing page (do nothing)
        return NextResponse.next();
      }
    }

    // Protect all other routes (like /dashboard which shouldn't be accessed directly anyway, but just in case)
    if (!token && !url.pathname.startsWith('/auth') && !url.pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
