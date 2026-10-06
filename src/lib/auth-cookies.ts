const useSecureCookies =
  process.env.NODE_ENV === 'production' ||
  process.env.NEXTAUTH_URL?.startsWith('https://') === true;

export const sessionCookieName = `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: useSecureCookies,
  ...(process.env.NEXTAUTH_COOKIE_DOMAIN
    ? { domain: process.env.NEXTAUTH_COOKIE_DOMAIN }
    : {}),
};
