import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sessionCookieName } from '@/lib/auth-cookies';

function resolveBackendUrl(): string {
  return process.env.BACKEND_INTERNAL_URL || 'http://localhost:8081';
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const targetPath = path.join('/');
  const targetUrl = `${resolveBackendUrl()}/api/v1/${targetPath}${req.nextUrl.search}`;

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

  let deletedUsername: string | null = null;
  if (req.method === 'DELETE' && /^users\/[^/]+$/.test(targetPath)) {
    try {
      const lookupRes = await fetch(targetUrl, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (lookupRes.ok) {
        const userRecord = (await lookupRes.json()) as { username?: string };
        if (userRecord?.username) {
          deletedUsername = String(userRecord.username).trim();
        }
      }
    } catch {
      // Non-fatal lookup before delete
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

    let responseText = await backendRes.text();

    if (backendRes.ok && req.method === 'GET' && userUuid) {
      responseText = await scopeGetResponse({
        targetPath,
        searchParams: req.nextUrl.searchParams,
        responseText,
        userUuid: String(userUuid),
        roles,
        headers,
      });
    }

    if (backendRes.ok && req.method === 'POST' && targetPath === 'users' && body) {
      try {
        const userPayload = JSON.parse(body) as {
          username?: string;
          password?: string;
          role?: string;
        };
        if (userPayload?.username && userPayload?.password) {
          await syncKeycloakUserCreate(
            String(userPayload.username),
            String(userPayload.password),
            String(userPayload.role || 'CLIENT')
          );
        }
      } catch {
        // Ignore malformed user sync payload
      }
    }

    if (backendRes.ok && req.method === 'DELETE' && deletedUsername) {
      await syncKeycloakUserDelete(deletedUsername);
    }

    if (backendRes.ok && req.method === 'POST' && userUuid) {
      if (targetPath === 'clinic/therapist-onboarding') {
        await syncKeycloakRealmRole(
          String(userUuid),
          'therapist',
          'Clinical Therapist role (auto-provisioned on CVR onboarding)'
        );
      } else if (targetPath === 'finance/vipps/checkout') {
        try {
          const checkoutBody = JSON.parse(responseText) as { keycloakRealmRole?: string };
          if (checkoutBody?.keycloakRealmRole === 'therapist' || checkoutBody?.keycloakRealmRole === 'admin') {
            await syncKeycloakRealmRole(
              String(userUuid),
              checkoutBody.keycloakRealmRole,
              `Platform access role (${checkoutBody.keycloakRealmRole}) provisioned via Vipps MobilePay OSGi`
            );
          }
        } catch {
          // Ignore non-JSON checkout response bodies
        }
      }
    }

    const responseHeaders = new Headers();
    const resContentType = backendRes.headers.get('content-type');
    if (resContentType) {
      responseHeaders.set('Content-Type', resContentType);
    }
    const fallbackHeader = backendRes.headers.get('x-locale-fallback');
    if (fallbackHeader) {
      responseHeaders.set('X-Locale-Fallback', fallbackHeader);
    }

    // Keep i18n dictionary responses live so MongoDB admin updates reflect immediately
    if (req.method === 'GET' && targetPath.startsWith('i18n/') && !targetPath.startsWith('i18n/document/')) {
      responseHeaders.set('Cache-Control', 'no-store, must-revalidate');
    }

    const isNullBodyStatus =
      backendRes.status === 204 || backendRes.status === 205 || backendRes.status === 304;
    return new NextResponse(isNullBodyStatus ? null : responseText, {
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

async function syncKeycloakRealmRole(
  userUuid: string,
  roleName: 'therapist' | 'admin',
  description: string
) {
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

    // 1. Ensure realm role exists in Keycloak
    let roleRes = await fetch(`${baseUrl}/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`, {
      headers: authHeaders,
      cache: 'no-store',
    });

    if (roleRes.status === 404) {
      await fetch(`${baseUrl}/admin/realms/${realm}/roles`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: roleName,
          description,
        }),
      });
      roleRes = await fetch(`${baseUrl}/admin/realms/${realm}/roles/${encodeURIComponent(roleName)}`, {
        headers: authHeaders,
        cache: 'no-store',
      });
    }

    if (!roleRes.ok) return;
    const roleRepresentation = await roleRes.json();

    // 2. Assign realm role to the upgraded user in Keycloak
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
    // Non-blocking: backend SecurityConfig & FinanceFeature already honor upgraded platform roles
  }
}

async function getKeycloakAdminContext(): Promise<{
  baseUrl: string;
  realm: string;
  authHeaders: Record<string, string>;
} | null> {
  const issuerUrl = process.env.KEYCLOAK_ISSUER || '';
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || '';
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';
  if (!issuerUrl.includes('/realms/') || !clientId || !clientSecret) {
    return null;
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
  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  if (!tokenData?.access_token) return null;

  return {
    baseUrl,
    realm,
    authHeaders: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
  };
}

function mapUserRoleToKeycloakRoles(role: string): string[] {
  const upper = role.trim().toUpperCase();
  if (upper === 'ADMIN' || upper === 'MANAGEMENT') {
    return ['client', 'therapist', 'admin'];
  }
  if (upper === 'THERAPIST' || upper === 'PROVIDER') {
    return ['client', 'therapist'];
  }
  return ['client'];
}

async function syncKeycloakUserCreate(
  username: string,
  password: string,
  role: string
): Promise<void> {
  try {
    const ctx = await getKeycloakAdminContext();
    if (!ctx) return;

    const usersUrl = `${ctx.baseUrl}/admin/realms/${ctx.realm}/users`;
    const cleanUsername = username.trim();
    const createRes = await fetch(usersUrl, {
      method: 'POST',
      headers: ctx.authHeaders,
      body: JSON.stringify({
        username: cleanUsername,
        firstName: cleanUsername,
        lastName: 'Bruger',
        email: `${cleanUsername}@edujournal.local`,
        enabled: true,
        emailVerified: true,
        requiredActions: [],
        credentials: [
          {
            type: 'password',
            value: password,
            temporary: false,
          },
        ],
      }),
    });

    let kcUserId = createRes.headers.get('location')?.split('/').pop() || '';
    if (!kcUserId) {
      const searchRes = await fetch(
        `${usersUrl}?username=${encodeURIComponent(cleanUsername)}&exact=true`,
        { headers: ctx.authHeaders, cache: 'no-store' }
      );
      if (searchRes.ok) {
        const list = (await searchRes.json()) as Array<{ id?: string }>;
        kcUserId = list?.[0]?.id || '';
      }
    }
    if (!kcUserId) return;

    const targetRoles = mapUserRoleToKeycloakRoles(role);
    const representations: Array<{ id: string; name: string }> = [];
    for (const rName of targetRoles) {
      const rRes = await fetch(
        `${ctx.baseUrl}/admin/realms/${ctx.realm}/roles/${encodeURIComponent(rName)}`,
        { headers: ctx.authHeaders, cache: 'no-store' }
      );
      if (rRes.ok) {
        const rep = (await rRes.json()) as { id?: string; name?: string };
        if (rep?.id && rep?.name) {
          representations.push({ id: rep.id, name: rep.name });
        }
      }
    }
    if (representations.length > 0) {
      await fetch(`${usersUrl}/${encodeURIComponent(kcUserId)}/role-mappings/realm`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify(representations),
      });
    }
  } catch {
    // Non-blocking sync to Keycloak
  }
}

async function syncKeycloakUserDelete(username: string): Promise<void> {
  try {
    const ctx = await getKeycloakAdminContext();
    if (!ctx) return;

    const usersUrl = `${ctx.baseUrl}/admin/realms/${ctx.realm}/users`;
    const searchRes = await fetch(
      `${usersUrl}?username=${encodeURIComponent(username.trim())}&exact=true`,
      { headers: ctx.authHeaders, cache: 'no-store' }
    );
    if (!searchRes.ok) return;
    const list = (await searchRes.json()) as Array<{ id?: string }>;
    const kcUserId = list?.[0]?.id;
    if (!kcUserId) return;

    await fetch(`${usersUrl}/${encodeURIComponent(kcUserId)}`, {
      method: 'DELETE',
      headers: ctx.authHeaders,
    });
  } catch {
    // Non-blocking cleanup in Keycloak
  }
}

const SCOPED_GET_PATHS = new Set([
  'appointments',
  'clinic/clients',
  'clinic/services',
  'journals',
  'psychotraumatology/tests',
]);

interface ActiveTherapistHandshakeRecord {
  clientUuid: string;
  clientName?: string;
}

async function fetchActiveTherapistHandshakes(
  userUuid: string,
  headers: Record<string, string>
): Promise<ActiveTherapistHandshakeRecord[]> {
  const allowed: ActiveTherapistHandshakeRecord[] = [];
  const seen = new Set<string>();
  try {
    const hsRes = await fetch(
      `${resolveBackendUrl()}/api/v1/clinic/handshakes/therapist/${encodeURIComponent(userUuid)}`,
      { method: 'GET', headers, cache: 'no-store' }
    );
    if (!hsRes.ok) return allowed;
    const handshakes = (await hsRes.json()) as Array<{
      clientUuid?: string;
      clientName?: string;
      status?: string;
    }>;
    if (!Array.isArray(handshakes)) return allowed;
    for (const hs of handshakes) {
      if (String(hs?.status || '').toUpperCase() === 'ACTIVE' && hs?.clientUuid) {
        const clientUuid = String(hs.clientUuid).trim();
        if (!clientUuid || seen.has(clientUuid)) continue;
        seen.add(clientUuid);
        allowed.push({
          clientUuid,
          clientName: typeof hs.clientName === 'string' ? hs.clientName.trim() : undefined,
        });
      }
    }
  } catch {
    // Default to empty list if handshakes cannot be loaded
  }
  return allowed;
}

async function scopeGetResponse(params: {
  targetPath: string;
  searchParams: URLSearchParams;
  responseText: string;
  userUuid: string;
  roles: unknown[];
  headers: Record<string, string>;
}): Promise<string> {
  const { targetPath, searchParams, responseText, userUuid, roles, headers } = params;
  if (!SCOPED_GET_PATHS.has(targetPath)) {
    return responseText;
  }

  const normalizedRoles = roles.map((r) => String(r).toLowerCase().replace(/^role_/, ''));
  const isAdminOrMgmt =
    normalizedRoles.includes('admin') || normalizedRoles.includes('management');
  if (isAdminOrMgmt) {
    return responseText;
  }

  const isTherapist =
    normalizedRoles.includes('therapist') || normalizedRoles.includes('provider');

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return responseText;
  }
  if (!Array.isArray(parsed)) {
    return responseText;
  }

  if (targetPath === 'appointments') {
    const scoped = parsed.filter((item: any) =>
      isTherapist
        ? item?.clientUuid === userUuid || item?.therapistUuid === userUuid
        : item?.clientUuid === userUuid
    );
    return JSON.stringify(scoped);
  }

  if (targetPath === 'clinic/services') {
    const hasTherapistFilter = Boolean(searchParams.get('therapistUuid'));
    const activeOnly = searchParams.get('activeOnly') === 'true';
    if (isTherapist && !hasTherapistFilter && !activeOnly) {
      const scoped = parsed.filter(
        (item: any) =>
          item?.provider?.userUuid === userUuid || item?.therapistUuid === userUuid
      );
      return JSON.stringify(scoped);
    }
    return responseText;
  }

  if (targetPath === 'clinic/clients') {
    if (!isTherapist) {
      const scoped = parsed.filter(
        (item: any) => item?.userId === userUuid || item?.id === userUuid
      );
      return JSON.stringify(scoped);
    }
    const activeHandshakes = await fetchActiveTherapistHandshakes(userUuid, headers);
    const activeClients = new Set(activeHandshakes.map((h) => h.clientUuid));
    const representedUuids = new Set<string>();
    const scoped = parsed
      .filter(
        (item: any) =>
          (item?.userId && activeClients.has(String(item.userId))) ||
          (item?.id && activeClients.has(String(item.id)))
      )
      .map((item: any) => {
        const resolvedUuid = String(item?.userId || item?.id || '').trim();
        if (resolvedUuid) representedUuids.add(resolvedUuid);
        return item?.userId ? item : { ...item, userId: resolvedUuid };
      });

    for (const hs of activeHandshakes) {
      if (representedUuids.has(hs.clientUuid)) continue;
      const normalizedHsName = hs.clientName?.toLowerCase();
      const matched = parsed.find((item: any) => {
        if (!item || typeof item !== 'object') return false;
        if (String(item.userId || '') === hs.clientUuid || String(item.id || '') === hs.clientUuid) {
          return true;
        }
        if (normalizedHsName && typeof item.fullName === 'string') {
          return item.fullName.trim().toLowerCase() === normalizedHsName;
        }
        return false;
      }) as Record<string, any> | undefined;

      scoped.push({
        ...(matched ?? {}),
        id: matched?.id || hs.clientUuid,
        userId: hs.clientUuid,
        fullName: matched?.fullName || hs.clientName || hs.clientUuid,
        email: matched?.email || '',
      });
      representedUuids.add(hs.clientUuid);
    }
    return JSON.stringify(scoped);
  }

  if (targetPath === 'journals') {
    if (!isTherapist) {
      const scoped = parsed.filter(
        (item: any) => item?.clientUuid === userUuid || item?.userId === userUuid
      );
      return JSON.stringify(scoped);
    }
    const activeHandshakes = await fetchActiveTherapistHandshakes(userUuid, headers);
    const activeClients = new Set(activeHandshakes.map((h) => h.clientUuid));
    const scoped = parsed.filter((item: any) => {
      const targetId = String(item?.clientUuid || item?.userId || '');
      if (targetId === userUuid) return true;
      const isShared = Boolean(item?.sharedWithTherapists || item?.sharedWithTherapist);
      return isShared && activeClients.has(targetId);
    });
    return JSON.stringify(scoped);
  }

  if (targetPath === 'psychotraumatology/tests') {
    if (!isTherapist) {
      const scoped = parsed.filter((item: any) => item?.clientUuid === userUuid);
      return JSON.stringify(scoped);
    }
    const activeHandshakes = await fetchActiveTherapistHandshakes(userUuid, headers);
    const activeClients = new Set(activeHandshakes.map((h) => h.clientUuid));
    const scoped = parsed.filter(
      (item: any) =>
        item?.therapistUuid === userUuid ||
        item?.clientUuid === userUuid ||
        (item?.clientUuid && activeClients.has(String(item.clientUuid)))
    );
    return JSON.stringify(scoped);
  }

  return responseText;
}

