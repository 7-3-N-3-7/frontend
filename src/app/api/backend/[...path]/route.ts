import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sessionCookieName } from '@/lib/auth-cookies';

function resolveBackendUrl(): string {
  return process.env.BACKEND_INTERNAL_URL || 'http://localhost:8081';
}

const VOIDED_INVOICE_IDS = new Set<string>();
const USER_EMAIL_BY_USERNAME = new Map<string, string>();

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const decodedSegments = path.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const targetPath = decodedSegments.join('/');
  const rawTargetPath = path.join('/');
  const targetUrl = `${resolveBackendUrl()}/api/v1/${rawTargetPath}${req.nextUrl.search}`;

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
  const roles =
    Array.isArray(session?.roles) && session.roles.length > 0
      ? session.roles
      : Array.isArray(token?.roles) && token.roles.length > 0
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

  const normalizedRolesHeader = roles.map((r: unknown) =>
    String(r).toLowerCase().replace(/^role_/, '')
  );
  const isAdminCaller =
    normalizedRolesHeader.includes('admin') || normalizedRolesHeader.includes('management');

  if (req.method === 'DELETE' && targetPath.startsWith('users/kc:') && isAdminCaller) {
    const kcUuid = targetPath.slice('users/kc:'.length).trim();
    if (kcUuid) {
      await syncKeycloakUserDeleteById(kcUuid);
    }
    return new NextResponse(null, { status: 204 });
  }

  if (
    req.method === 'POST' &&
    targetPath === 'clinic/therapist-onboarding' &&
    userUuid &&
    body
  ) {
    const conflictResponse = await checkCvrCollision({ body, userUuid, headers });
    if (conflictResponse) {
      return conflictResponse;
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

    if (
      req.method === 'DELETE' &&
      /^finance\/[^/]+$/.test(targetPath) &&
      backendRes.status === 404
    ) {
      const invoiceId = targetPath.slice('finance/'.length).trim();
      if (invoiceId) {
        VOIDED_INVOICE_IDS.add(invoiceId);
        try {
          const invListRes = await fetch(`${resolveBackendUrl()}/api/v1/finance/invoices`, {
            method: 'GET',
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(2000),
          });
          const invList = invListRes.ok ? await invListRes.json() : [];
          const matched = Array.isArray(invList)
            ? invList.find((inv: any) => String(inv?.id || '').trim() === invoiceId)
            : undefined;
          if (String(matched?.status || '').toUpperCase() === 'PAID') {
            await fetch(
              `${resolveBackendUrl()}/api/v1/finance/invoices/${encodeURIComponent(invoiceId)}/refund`,
              {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Voided from clinic invoice overview' }),
                cache: 'no-store',
              }
            );
          }
        } catch {
          // Best-effort ledger credit note only when paid
        }
      }
      return new NextResponse(null, { status: 204 });
    }

    if (backendRes.ok && req.method === 'DELETE' && /^finance\/[^/]+$/.test(targetPath)) {
      const invoiceId = targetPath.slice('finance/'.length).trim();
      if (invoiceId) {
        VOIDED_INVOICE_IDS.add(invoiceId);
      }
    }

    let responseText = await backendRes.text();

    if (backendRes.ok && req.method === 'GET' && targetPath === 'users' && isAdminCaller) {
      responseText = await mergeKeycloakUsersIntoList(responseText, headers);
    }

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
          email?: string;
        };
        const cleanEmail = userPayload?.email ? String(userPayload.email).trim() : '';
        if (userPayload?.username && cleanEmail) {
          USER_EMAIL_BY_USERNAME.set(String(userPayload.username).trim().toLowerCase(), cleanEmail);
          try {
            const parsedCreated = JSON.parse(responseText);
            if (parsedCreated && typeof parsedCreated === 'object' && !Array.isArray(parsedCreated)) {
              responseText = JSON.stringify({
                ...parsedCreated,
                email: parsedCreated.email || cleanEmail,
              });
            }
          } catch {
            // Preserve raw response if non-JSON
          }
        }
        if (userPayload?.username && userPayload?.password) {
          await syncKeycloakUserCreate(
            String(userPayload.username),
            String(userPayload.password),
            String(userPayload.role || 'CLIENT'),
            cleanEmail || undefined
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
  role: string,
  email?: string
): Promise<void> {
  try {
    const ctx = await getKeycloakAdminContext();
    if (!ctx) return;

    const usersUrl = `${ctx.baseUrl}/admin/realms/${ctx.realm}/users`;
    const cleanUsername = username.trim();
    const resolvedEmail = email?.trim() || `${cleanUsername}@edujournal.local`;
    const createRes = await fetch(usersUrl, {
      method: 'POST',
      headers: ctx.authHeaders,
      body: JSON.stringify({
        username: cleanUsername,
        firstName: cleanUsername,
        lastName: 'Bruger',
        email: resolvedEmail,
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

async function syncKeycloakUserDeleteById(kcUserId: string): Promise<void> {
  try {
    const ctx = await getKeycloakAdminContext();
    if (!ctx) return;
    await fetch(`${ctx.baseUrl}/admin/realms/${ctx.realm}/users/${encodeURIComponent(kcUserId)}`, {
      method: 'DELETE',
      headers: ctx.authHeaders,
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Non-blocking cleanup in Keycloak by ID
  }
}

async function mergeKeycloakUsersIntoList(
  responseText: string,
  headers: Record<string, string>
): Promise<string> {
  try {
    const baseUsers = JSON.parse(responseText);
    if (!Array.isArray(baseUsers)) return responseText;

    const ctx = await getKeycloakAdminContext();
    if (!ctx) return responseText;

    const usersUrl = `${ctx.baseUrl}/admin/realms/${ctx.realm}/users?max=200`;
    const rolePriority: Array<[string, string]> = [
      ['admin', 'ADMIN'],
      ['management', 'MANAGEMENT'],
      ['therapist', 'THERAPIST'],
      ['provider', 'THERAPIST'],
      ['client', 'CLIENT'],
    ];

    const [kcRes, dirRes, ...roleBuckets] = await Promise.all([
      fetch(usersUrl, {
        headers: ctx.authHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      }),
      fetch(`${resolveBackendUrl()}/api/v1/clinic/directory`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      }).catch(() => null),
      ...rolePriority.map(async ([realmRole, appRole]) => {
        try {
          const rRes = await fetch(
            `${ctx.baseUrl}/admin/realms/${ctx.realm}/roles/${encodeURIComponent(realmRole)}/users?max=200`,
            { headers: ctx.authHeaders, cache: 'no-store', signal: AbortSignal.timeout(2000) }
          );
          if (!rRes.ok) return { appRole, members: [] as Array<{ id?: string }> };
          const members = (await rRes.json()) as Array<{ id?: string }>;
          return { appRole, members: Array.isArray(members) ? members : [] };
        } catch {
          return { appRole, members: [] as Array<{ id?: string }> };
        }
      }),
    ]);

    if (!kcRes.ok) return responseText;

    const kcUsers = (await kcRes.json()) as Array<{
      id?: string;
      username?: string;
      email?: string;
    }>;
    if (!Array.isArray(kcUsers)) return responseText;

    const directoryProviderUuids = new Set<string>();
    if (dirRes && dirRes.ok) {
      try {
        const dirData = (await dirRes.json()) as { providers?: Array<{ userUuid?: string }> };
        for (const p of dirData?.providers || []) {
          if (p?.userUuid) {
            directoryProviderUuids.add(String(p.userUuid).trim());
          }
        }
      } catch {
        // Ignore directory parse failure
      }
    }

    const kcRoleById = new Map<string, string>();
    for (const bucket of roleBuckets) {
      for (const m of bucket.members) {
        if (m?.id && !kcRoleById.has(m.id)) {
          kcRoleById.set(m.id, bucket.appRole);
        }
      }
    }

    const kcEmailByUsername = new Map<string, string>();
    for (const u of kcUsers) {
      if (u?.username && u?.email) {
        kcEmailByUsername.set(String(u.username).trim().toLowerCase(), String(u.email).trim());
      }
    }

    const enrichedBase = baseUsers.map((u: any) => {
      const lower = String(u?.username || '').trim().toLowerCase();
      const resolvedEmail =
        u?.email || USER_EMAIL_BY_USERNAME.get(lower) || kcEmailByUsername.get(lower);
      return resolvedEmail ? { ...u, email: resolvedEmail } : u;
    });

    const seenUsernames = new Set(
      enrichedBase
        .map((u: any) => String(u?.username || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const merged = [...enrichedBase];
    for (const u of kcUsers) {
      const uname = String(u?.username || '').trim();
      if (!u?.id || !uname || uname.startsWith('service-account-')) continue;
      if (seenUsernames.has(uname.toLowerCase())) continue;
      seenUsernames.add(uname.toLowerCase());
      const kcId = String(u.id);
      let resolvedRole = kcRoleById.get(kcId) || 'CLIENT';
      if (resolvedRole === 'CLIENT' && directoryProviderUuids.has(kcId)) {
        resolvedRole = 'THERAPIST';
      }
      merged.push({
        id: `kc:${kcId}`,
        username: uname,
        email: u.email || USER_EMAIL_BY_USERNAME.get(uname.toLowerCase()) || undefined,
        role: resolvedRole,
      });
    }
    return JSON.stringify(merged);
  } catch {
    return responseText;
  }
}

async function checkCvrCollision(params: {
  body: string;
  userUuid: string;
  headers: Record<string, string>;
}): Promise<NextResponse | null> {
  try {
    const payload = JSON.parse(params.body) as {
      cvr?: string;
      cvrNumber?: string;
      organisationName?: string;
      clinicName?: string;
      name?: string;
    };
    const normalizedCvr = String(payload?.cvrNumber || payload?.cvr || '').replace(/\D/g, '');
    if (!normalizedCvr) return null;

    const submittedOrgName = String(
      payload?.organisationName || payload?.clinicName || payload?.name || ''
    )
      .trim()
      .toLowerCase();

    const directoryRes = await fetch(`${resolveBackendUrl()}/api/v1/clinic/directory`, {
      method: 'GET',
      headers: params.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!directoryRes.ok) return null;

    const data = (await directoryRes.json()) as any;
    const providers = Array.isArray(data)
      ? data
      : Array.isArray(data?.providers)
        ? data.providers
        : [];

    for (const p of providers) {
      const ownerUuid = String(p?.userUuid || '').trim();
      const existingCvr = String(p?.organisation?.cvrNumber || '').replace(/\D/g, '');
      const existingOrgName = String(p?.organisation?.name || '').trim();
      if (
        existingCvr === normalizedCvr &&
        ownerUuid &&
        ownerUuid !== params.userUuid &&
        (!submittedOrgName ||
          !existingOrgName ||
          existingOrgName.toLowerCase() !== submittedOrgName)
      ) {
        const orgLabel = existingOrgName || 'en anden klinik';
        return NextResponse.json(
          {
            title: 'CVR allerede registreret',
            status: 409,
            detail: `CVR-nummer ${normalizedCvr} er allerede tilknyttet "${orgLabel}". Brug dit eget CVR-nummer eller kontakt support.`,
            errorCode: 'CONFLICT',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } }
        );
      }
    }
    return null;
  } catch {
    return null;
  }
}

const SCOPED_GET_PATHS = new Set([
  'appointments',
  'clinic/clients',
  'clinic/services',
  'finance',
  'finance/invoices',
  'finance/ledger/summary',
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

async function filterScopedInvoices(params: {
  items: unknown[];
  userUuid: string;
  isAdminOrMgmt: boolean;
  isTherapist: boolean;
  headers: Record<string, string>;
}): Promise<unknown[]> {
  const { items, userUuid, isAdminOrMgmt, isTherapist, headers } = params;
  const nonVoided = items.filter((item: any) => {
    const keys = [item?.id, item?.invoiceId, item?.invoiceNumber]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    return !keys.some((k) => VOIDED_INVOICE_IDS.has(k));
  });

  if (isAdminOrMgmt) {
    return nonVoided;
  }

  if (!isTherapist) {
    return nonVoided.filter((item: any) => item?.clientUuid === userUuid);
  }

  const activeHandshakes = await fetchActiveTherapistHandshakes(userUuid, headers);
  const activeClients = new Set(activeHandshakes.map((h) => h.clientUuid));
  return nonVoided.filter((item: any) => {
    const tUuid = String(item?.therapistUuid || '').trim();
    const cUuid = String(item?.clientUuid || '').trim();
    if (cUuid === userUuid || tUuid === userUuid) {
      return true;
    }
    return !tUuid && Boolean(cUuid) && activeClients.has(cUuid);
  });
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
  const isClientFinanceOverview = /^finance\/client\/[^/]+\/overview$/.test(targetPath);
  const isJournalClientBundle = /^journals\/client\/[^/]+$/.test(targetPath);
  if (!SCOPED_GET_PATHS.has(targetPath) && !isClientFinanceOverview && !isJournalClientBundle) {
    return responseText;
  }

  const normalizedRoles = roles.map((r) => String(r).toLowerCase().replace(/^role_/, ''));
  const isAdminOrMgmt =
    normalizedRoles.includes('admin') || normalizedRoles.includes('management');
  const isTherapist =
    normalizedRoles.includes('therapist') || normalizedRoles.includes('provider');

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return responseText;
  }

  if (isClientFinanceOverview && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, any>;
    if (!Array.isArray(obj.invoices)) {
      return responseText;
    }
    const filteredInvoices = obj.invoices.filter((inv: any) => {
      const keys = [inv?.id, inv?.invoiceId, inv?.invoiceNumber]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      if (keys.some((k) => VOIDED_INVOICE_IDS.has(k))) return false;
      return String(inv?.status || '').toUpperCase() !== 'VOID';
    });
    return JSON.stringify({
      ...obj,
      invoices: filteredInvoices,
    });
  }

  if (isJournalClientBundle && isTherapist && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const targetClientId = targetPath.slice('journals/client/'.length).trim();
    const obj = parsed as Record<string, any>;
    const existingEntries = Array.isArray(obj.entries) ? obj.entries : [];
    const activeHandshakes = await fetchActiveTherapistHandshakes(userUuid, headers);
    const hasAccess =
      targetClientId === userUuid || activeHandshakes.some((h) => h.clientUuid === targetClientId);
    if (!hasAccess) {
      return responseText;
    }
    try {
      const allJournalsRes = await fetch(`${resolveBackendUrl()}/api/v1/journals`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });
      if (allJournalsRes.ok) {
        const allJournals = await allJournalsRes.json();
        if (Array.isArray(allJournals)) {
          const existingIds = new Set(
            existingEntries.map((e: any) => String(e?.id || '')).filter(Boolean)
          );
          const sharedExtras = allJournals.filter((item: any) => {
            const cUuid = String(item?.clientUuid || item?.userId || '').trim();
            const isShared = Boolean(item?.sharedWithTherapists || item?.sharedWithTherapist);
            const itemId = String(item?.id || '').trim();
            return cUuid === targetClientId && isShared && (!itemId || !existingIds.has(itemId));
          });
          if (sharedExtras.length > 0) {
            return JSON.stringify({
              ...obj,
              entries: [...existingEntries, ...sharedExtras],
            });
          }
        }
      }
    } catch {
      // Preserve existing bundle if fallback lookup fails
    }
    return responseText;
  }

  if (targetPath === 'finance/ledger/summary' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (isAdminOrMgmt && VOIDED_INVOICE_IDS.size === 0) {
      return responseText;
    }
    let scopedInvoices: unknown[] = [];
    try {
      const invRes = await fetch(`${resolveBackendUrl()}/api/v1/finance/invoices`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });
      if (invRes.ok) {
        const invJson = await invRes.json();
        if (Array.isArray(invJson)) {
          scopedInvoices = await filterScopedInvoices({
            items: invJson,
            userUuid,
            isAdminOrMgmt,
            isTherapist,
            headers,
          });
        }
      }
    } catch {
      // Safe fallback to zeroed tenant summary rather than leaking cross-clinic totals
    }

    let totalInvoicedGrossDkk = 0;
    let totalPaidDkk = 0;
    let totalRefundedDkk = 0;
    let outstandingReceivablesDkk = 0;
    for (const inv of scopedInvoices as any[]) {
      const gross = Number(inv?.amountGrossDkk ?? inv?.amountNetDkk ?? inv?.amount ?? 0) || 0;
      const st = String(inv?.status || '').toUpperCase();
      totalInvoicedGrossDkk += gross;
      if (st === 'PAID') {
        totalPaidDkk += gross;
      } else if (st === 'REFUNDED') {
        totalRefundedDkk += gross;
      } else if (st !== 'VOID') {
        outstandingReceivablesDkk += gross;
      }
    }

    const paidNet = Math.max(0, Number((totalPaidDkk - totalRefundedDkk).toFixed(2)));
    const receivables = Number(outstandingReceivablesDkk.toFixed(2));
    const consultationRev = Number((totalPaidDkk + outstandingReceivablesDkk).toFixed(2));
    const refundsTotal = Number(totalRefundedDkk.toFixed(2));

    const summaryRecord = parsed as Record<string, any>;
    const rawAccounts = Array.isArray(summaryRecord.chartOfAccounts)
      ? summaryRecord.chartOfAccounts
      : [];
    const scopedChartOfAccounts = rawAccounts.map((acc: any) => {
      const code = String(acc?.code || acc?.glCode || '').trim();
      let balance = 0;
      if (code === '1100') balance = paidNet;
      else if (code === '1200') balance = receivables;
      else if (code === '4100') balance = consultationRev;
      else if (code === '5100') balance = refundsTotal;
      return { ...acc, balance };
    });

    return JSON.stringify({
      ...summaryRecord,
      ...(Array.isArray(summaryRecord.chartOfAccounts)
        ? { chartOfAccounts: scopedChartOfAccounts }
        : {}),
      totalInvoicedGrossDkk: Number(totalInvoicedGrossDkk.toFixed(2)),
      totalPaidDkk: Number(totalPaidDkk.toFixed(2)),
      totalRefundedDkk: refundsTotal,
      outstandingReceivablesDkk: receivables,
      invoiceCount: scopedInvoices.length,
    });
  }

  if (isAdminOrMgmt && targetPath !== 'finance' && targetPath !== 'finance/invoices') {
    return responseText;
  }

  if (!Array.isArray(parsed)) {
    return responseText;
  }

  if (targetPath === 'finance' || targetPath === 'finance/invoices') {
    const scoped = await filterScopedInvoices({
      items: parsed,
      userUuid,
      isAdminOrMgmt,
      isTherapist,
      headers,
    });
    return JSON.stringify(scoped);
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

