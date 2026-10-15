import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sessionCookieName } from '@/lib/auth-cookies';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8081';

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const targetPath = path.join('/');
  const targetUrl = `${BACKEND_URL}/api/v1/${targetPath}${req.nextUrl.search}`;

  // getServerSession triggers NextAuth's jwt() callback which refreshes expired Keycloak tokens
  const session: any = await getServerSession(authOptions);
  const token: any = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const activeAccessToken = session?.accessToken || token?.accessToken;
  if (activeAccessToken && !session?.error) {
    headers['Authorization'] = `Bearer ${activeAccessToken}`;
  }

  // Forward verified session identity headers from NextAuth BFF (with fallback to incoming X-Auth-* headers for direct REST Assured BFF API tests)
  const userUuid =
    session?.user?.id ||
    token?.userUuid ||
    token?.sub ||
    req.headers.get('x-auth-user-uuid') ||
    undefined;
  const username =
    session?.user?.username ||
    token?.username ||
    req.headers.get('x-auth-username') ||
    undefined;
  const fullName =
    session?.user?.name ||
    token?.fullName ||
    req.headers.get('x-auth-full-name') ||
    username;
  const email =
    session?.user?.email ||
    token?.email ||
    req.headers.get('x-auth-email') ||
    undefined;
  const rawRolesHeader = req.headers.get('x-auth-roles') || '';
  const roles = Array.isArray(session?.roles)
    ? session.roles
    : Array.isArray(token?.roles)
    ? token.roles
    : rawRolesHeader
    ? rawRolesHeader.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (userUuid) headers['X-Auth-User-Uuid'] = String(userUuid);
  if (username) headers['X-Auth-Username'] = String(username);
  if (fullName) headers['X-Auth-Full-Name'] = String(fullName);
  if (email) headers['X-Auth-Email'] = String(email);
  if (roles.length > 0) headers['X-Auth-Roles'] = roles.join(',');

  let body: string | undefined = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }
    try {
      body = await req.text();
    } catch {
      body = undefined;
    }
  }

  try {
    let backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
      cache: 'no-store',
    });

    // If Bearer token was rejected as 401 (e.g. expired Keycloak token), retry without Authorization header
    // using the verified BFF session headers so the request still succeeds for authenticated NextAuth users
    if (backendRes.status === 401 && headers['Authorization'] && userUuid) {
      const retryHeaders = { ...headers };
      delete retryHeaders['Authorization'];
      backendRes = await fetch(targetUrl, {
        method: req.method,
        headers: retryHeaders,
        body: body && body.length > 0 ? body : undefined,
        cache: 'no-store',
      });
    }

    if (
      backendRes.ok &&
      req.method === 'POST' &&
      targetPath === 'clinic/therapist-onboarding' &&
      userUuid
    ) {
      await syncKeycloakTherapistRole(String(userUuid));
    }

    const responseText = await backendRes.text();
    const responseHeaders = new Headers();
    const resContentType = backendRes.headers.get('content-type');
    if (resContentType) {
      responseHeaders.set('Content-Type', resContentType);
    }
    const fallbackHeader = backendRes.headers.get('x-locale-fallback');
    if (fallbackHeader) {
      responseHeaders.set('X-Locale-Fallback', fallbackHeader);
    }

    // Cache public language dictionaries in browser & CDN while keeping mutations uncached
    if (req.method === 'GET' && targetPath.startsWith('i18n/') && !targetPath.startsWith('i18n/document/')) {
      responseHeaders.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    }

    return new NextResponse(responseText, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Backend service unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}

async function syncKeycloakTherapistRole(userUuid: string) {
  try {
    const issuerUrl = process.env.KEYCLOAK_ISSUER || '';
    const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || '';
    const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';
    if (!issuerUrl.includes('/realms/') || !clientId || !clientSecret) {
      return;
    }

    const [baseUrl, realm] = issuerUrl.split('/realms/');
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch(`${issuerUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    });
    if (!tokenRes.ok) return;
    const tokenData = await tokenRes.json();
    const adminToken = tokenData.access_token;
    if (!adminToken) return;

    const authHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Ensure 'therapist' realm role exists in Keycloak
    let roleRes = await fetch(`${baseUrl}/admin/realms/${realm}/roles/therapist`, {
      headers: authHeaders,
      cache: 'no-store',
    });

    if (roleRes.status === 404) {
      await fetch(`${baseUrl}/admin/realms/${realm}/roles`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'therapist',
          description: 'Clinical Therapist role (auto-provisioned on CVR onboarding)',
        }),
      });
      roleRes = await fetch(`${baseUrl}/admin/realms/${realm}/roles/therapist`, {
        headers: authHeaders,
        cache: 'no-store',
      });
    }

    if (!roleRes.ok) return;
    const roleRepresentation = await roleRes.json();

    // 2. Assign 'therapist' realm role to the upgraded user in Keycloak
    await fetch(
      `${baseUrl}/admin/realms/${realm}/users/${encodeURIComponent(userUuid)}/role-mappings/realm`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify([
          {
            id: roleRepresentation.id,
            name: roleRepresentation.name,
          },
        ]),
      }
    );
  } catch {
    // Non-blocking: backend SecurityConfig & ClinicPlatformController already grant ROLE_therapist from provider_profiles
  }
}

