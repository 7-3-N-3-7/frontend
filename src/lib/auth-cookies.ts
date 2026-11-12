const useSecureCookies =
  process.env.NODE_ENV === 'production' ||
  process.env.NEXTAUTH_URL?.startsWith('https://') === true;

export const sessionCookieName = `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`;

function resolveCookieDomain(): string | undefined {
  if (process.env.NEXTAUTH_COOKIE_DOMAIN) {
    return process.env.NEXTAUTH_COOKIE_DOMAIN;
  }
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!nextAuthUrl) {
    return undefined;
  }
  try {
    const { hostname } = new URL(nextAuthUrl);
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]'
    ) {
      return undefined;
    }
    const bareDomain = hostname.replace(/^platform\./i, '');
    return bareDomain.includes('.') ? `.${bareDomain}` : undefined;
  } catch {
    return undefined;
  }
}

const resolvedCookieDomain = resolveCookieDomain();

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: useSecureCookies,
  ...(resolvedCookieDomain ? { domain: resolvedCookieDomain } : {}),
};

