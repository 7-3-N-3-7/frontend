import http from "node:http";
import crypto from "node:crypto";

export interface MockStackServers {
  keycloakServer: http.Server;
  backendServer: http.Server;
  keycloakPort: number;
  backendPort: number;
  close: () => Promise<void>;
}

function makeFakeJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      ...payload,
    })
  ).toString("base64url");
  return `${header}.${body}.sig`;
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: any,
  extraHeaders: Record<string, string> = {}
) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(payload, "utf8")),
    ...extraHeaders,
  });
  res.end(payload);
}

function buildBaselineI18n(): Record<string, Record<string, any>> {
  return {
    da: {
      portal: {
        brandTitle: "EduJournal Klinik",
        welcome: "Velkommen til EduJournal",
        tabCalendar: "Månedskalender & Dagsprogram",
        appointmentsCountBadge: "{count} aftaler",
        singleAppointmentBadge: "1 aftale",
      },
      HomePage: {
        heroTitle: "Reflekter, Lær, og Voks",
      },
    },
    en: {
      portal: {
        brandTitle: "EduJournal Clinic",
        welcome: "Welcome to EduJournal",
        tabCalendar: "Monthly Calendar & Daily Schedule",
        appointmentsCountBadge: "{count} appointments",
        singleAppointmentBadge: "1 appointment",
      },
      HomePage: {
        heroTitle: "Reflect, Learn, and Grow",
      },
    },
    fr: {
      portal: {
        brandTitle: "EduJournal Clinique",
        welcome: "Bienvenue sur EduJournal",
        tabCalendar: "Calendrier Mensuel & Programme",
        appointmentsCountBadge: "{count} rdv",
        singleAppointmentBadge: "1 rdv",
      },
      HomePage: {
        heroTitle: "Réfléchissez, Apprenez et Grandissez",
      },
    },
    es: {
      portal: {
        brandTitle: "EduJournal Clínica",
        welcome: "Bienvenido a EduJournal",
        tabCalendar: "Calendario Mensual y Agenda",
        appointmentsCountBadge: "{count} citas",
        singleAppointmentBadge: "1 cita",
      },
      HomePage: {
        heroTitle: "Reflexiona, Aprende y Crece",
      },
    },
    de: {
      portal: {
        brandTitle: "EduJournal Klinik",
        welcome: "Willkommen bei EduJournal",
        tabCalendar: "Monatskalender & Tagesplan",
        appointmentsCountBadge: "{count} Termine",
        singleAppointmentBadge: "1 Termin",
      },
      HomePage: {
        heroTitle: "Reflektieren, Lernen und Wachsen",
      },
    },
  };
}

export async function startSelfContainedMockStack(
  backendPort = 18081,
  keycloakPort = 18082
): Promise<MockStackServers> {
  const userRoles = new Map<string, Set<string>>();
  const usersByUsername = new Map<
    string,
    { id: string; username: string; fullName: string; email: string; role: string }
  >();
  const organisations = new Map<string, any>();
  const providerProfiles = new Map<string, any>();
  const clientProfiles = new Map<string, any>();
  const services = new Map<string, any>();
  const handshakes = new Map<string, any>();
  const appointments = new Map<string, any>();
  const pcl5Tests: any[] = [];
  const journalEntries: any[] = [];
  const clinicalNotes: any[] = [];
  const jgitCommits: any[] = [];
  const savingsAccounts = new Map<
    string,
    { balance: number; remainingClips: number; clipUnitPrice: number; currency: string }
  >();
  const subscriptionsByClient = new Map<string, any[]>();
  const invoicesById = new Map<string, any>();
  const installmentLoans = new Map<string, any>();
  const ledgerCommits = new Map<string, any>();
  const glBalances: Record<string, number> = {
    "1100": 0,
    "1200": 0,
    "2100": 0,
    "4100": 0,
    "4200": 0,
  };
  let i18nStore = buildBaselineI18n();

  function addJGitCommit(opts: {
    clientUuid?: string;
    author: string;
    message: string;
    isConfidential: boolean;
    addedLine: string;
    dateStr?: string;
    mood?: number;
    branch?: string;
  }) {
    const fullHash = crypto.randomBytes(8).toString("hex");
    const shortHash = fullHash.slice(0, 7);
    const dateStr = opts.dateStr || "2026-10-14";
    const timestamp = `${dateStr}T10:30:00Z`;
    const branch = opts.branch || "main";
    const parentSnapshot = jgitCommits[0]?.snapshot || "";
    const newBlock = opts.isConfidential
      ? `## Fortroligt klinisk notat (${dateStr}T10:30:00)\nINTERNAL_MEDICAL_NOTES: ${opts.addedLine}`
      : `## ${opts.message} (${dateStr}T10:30:00)\nMood: ${opts.mood ?? 7}/10 | Shared: true\n${opts.addedLine}`;
    const fullSnapshot = parentSnapshot ? `${parentSnapshot}\n\n${newBlock}` : newBlock;
    const commit = {
      clientUuid: opts.clientUuid || "",
      commitId: shortHash,
      commitHash: shortHash,
      fullHash,
      shortHash,
      branch,
      author: opts.author,
      timestamp,
      date: dateStr,
      message: opts.message,
      isConfidential: opts.isConfidential,
      diff: `@@ -1,2 +1,3 @@\n+ ${opts.addedLine}`,
      delta: newBlock,
      parentSnapshot,
      snapshot: fullSnapshot,
    };
    jgitCommits.unshift(commit);
    return commit;
  }

  function resetAllState() {
    userRoles.clear();
    usersByUsername.clear();
    organisations.clear();
    providerProfiles.clear();
    clientProfiles.clear();
    services.clear();
    handshakes.clear();
    appointments.clear();
    pcl5Tests.length = 0;
    journalEntries.length = 0;
    clinicalNotes.length = 0;
    jgitCommits.length = 0;
    savingsAccounts.clear();
    subscriptionsByClient.clear();
    invoicesById.clear();
    installmentLoans.clear();
    ledgerCommits.clear();
    glBalances["1100"] = 0;
    glBalances["1200"] = 0;
    glBalances["2100"] = 0;
    glBalances["4100"] = 0;
    glBalances["4200"] = 0;
    i18nStore = buildBaselineI18n();

    const seedUsers = [
      {
        id: "4c421f46-836c-4897-8dae-ba9587473273",
        username: "bijens",
        fullName: "Bo Jensen",
        email: "bjens@mail.com",
        role: "THERAPIST",
        roles: ["client", "therapist", "admin"],
      },
      {
        id: "5e357ca1-4913-414f-91a6-81a7de9042ab",
        username: "client",
        fullName: "Anders Sand",
        email: "client@mail.com",
        role: "CLIENT",
        roles: ["client"],
      },
      {
        id: "f951db57-01ab-4693-bed4-17d03f0870f1",
        username: "client2",
        fullName: "Sofie Holm",
        email: "client2@mail.com",
        role: "CLIENT",
        roles: ["client"],
      },
      {
        id: "3229b65b-0e95-4dc6-8336-ac7a5a56edc1",
        username: "test",
        fullName: "Test Bruger",
        email: "test@mail.com",
        role: "CLIENT",
        roles: ["client"],
      },
    ];
    for (const u of seedUsers) {
      usersByUsername.set(u.username, {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
      });
      userRoles.set(u.id, new Set(u.roles));
    }
  }

  resetAllState();

  // -------------------------------------------------------------------------
  // 1. Mock Keycloak Server
  // -------------------------------------------------------------------------
  const keycloakServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${keycloakPort}`);
    const body = await readRequestBody(req);

    if (url.pathname.endsWith("/protocol/openid-connect/token") && req.method === "POST") {
      const params = new URLSearchParams(body);
      const grantType = params.get("grant_type");
      if (grantType === "client_credentials") {
        return sendJson(res, 200, {
          access_token: makeFakeJwt({ sub: "admin-cli", realm_access: { roles: ["admin"] } }),
          expires_in: 3600,
        });
      }
      const username = params.get("username") || "client";
      const user = usersByUsername.get(username) || {
        id: crypto.randomUUID(),
        username,
        fullName: username,
        email: `${username}@klinik.dk`,
        role: "CLIENT",
      };
      const roles = Array.from(userRoles.get(user.id) || ["client"]);
      const accessToken = makeFakeJwt({
        sub: user.id,
        preferred_username: user.username,
        name: user.fullName,
        email: user.email,
        realm_access: { roles },
      });
      return sendJson(res, 200, {
        access_token: accessToken,
        refresh_token: accessToken,
        expires_in: 3600,
      });
    }

    if (url.pathname.includes("/roles/therapist")) {
      return sendJson(res, 200, { id: "role-therapist-id", name: "therapist" });
    }

    const roleMappingMatch = url.pathname.match(/\/users\/([^/]+)\/role-mappings\/realm$/);
    if (roleMappingMatch) {
      const userId = decodeURIComponent(roleMappingMatch[1]);
      if (!userRoles.has(userId)) {
        userRoles.set(userId, new Set(["client"]));
      }
      const set = userRoles.get(userId)!;
      if (req.method === "GET") {
        return sendJson(
          res,
          200,
          Array.from(set).map((name) => ({ id: `role-${name}`, name }))
        );
      }
      if (req.method === "POST") {
        set.add("therapist");
        return sendJson(res, 204, {});
      }
      if (req.method === "DELETE") {
        set.delete("therapist");
        return sendJson(res, 204, {});
      }
    }

    return sendJson(res, 200, { ok: true });
  });

  function extractAuth(req: http.IncomingMessage) {
    const userUuid = String(req.headers["x-auth-user-uuid"] || "").trim();
    const username = String(req.headers["x-auth-username"] || "").trim();
    const fullName = String(req.headers["x-auth-full-name"] || "").trim();
    const email = String(req.headers["x-auth-email"] || "").trim();
    const rolesRaw = String(req.headers["x-auth-roles"] || "").trim();
    if (!userUuid) {
      return {
        userUuid: "",
        username: "",
        fullName: "",
        email: "",
        roles: [] as string[],
        isTherapist: false,
        isAdmin: false,
      };
    }
    const roles = rolesRaw
      ? rolesRaw
          .split(",")
          .map((r) => r.trim().replace(/^ROLE_/i, "").toLowerCase())
          .filter(Boolean)
      : ["client"];
    return {
      userUuid,
      username: username || "client",
      fullName: fullName || username || "Client",
      email: email || `${username || "client"}@example.dk`,
      roles,
      isTherapist: roles.includes("therapist"),
      isAdmin: roles.includes("admin"),
    };
  }

  // -------------------------------------------------------------------------
  // 2. Mock Backend Server (/api/v1/* & /api/backend/*)
  // -------------------------------------------------------------------------
  const backendServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${backendPort}`);
    const pathname = url.pathname.replace(/^\/api\/backend(\/|$)/, "/api/v1$1");
    const method = req.method || "GET";
    const rawBody = await readRequestBody(req);
    let jsonBody: any = {};
    try {
      jsonBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      jsonBody = {};
    }

    if (pathname === "/__test__/reset" && method === "POST") {
      resetAllState();
      return sendJson(res, 200, { reset: true });
    }

    const auth = extractAuth(req);

    // 1. Public Health & i18n endpoints
    if (pathname === "/api/v1/public/health" && method === "GET") {
      return sendJson(res, 200, { status: "UP", service: "integrate-backend" });
    }

    if (pathname === "/api/v1/public/client-profile" && method === "POST") {
      const uid = String(jsonBody.userId || jsonBody.userUuid || crypto.randomUUID());
      const saved = { id: crypto.randomUUID(), userId: uid, ...jsonBody };
      clientProfiles.set(uid, saved);
      return sendJson(res, 200, saved);
    }

    if (pathname.startsWith("/api/v1/i18n/")) {
      const rest = pathname.slice("/api/v1/i18n/".length);
      const parts = rest.split("/");
      const locale = parts[0] || "da";
      if (method === "GET") {
        if (!i18nStore[locale]) {
          return sendJson(res, 200, i18nStore.en, { "X-Locale-Fallback": "en" });
        }
        return sendJson(res, 200, i18nStore[locale]);
      }
      if (method === "PUT" && parts.length >= 2) {
        if (!auth.userUuid) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }
        if (!auth.isAdmin) {
          return sendJson(res, 403, { error: "Forbidden: admin required" });
        }
        if (!i18nStore[locale]) {
          i18nStore[locale] = {};
        }
        const key = decodeURIComponent(parts.slice(1).join("/"));
        const val = jsonBody.value;
        i18nStore[locale][key] = val;
        if (key.includes(".")) {
          const [ns, prop] = key.split(".");
          i18nStore[locale][ns] = i18nStore[locale][ns] || {};
          i18nStore[locale][ns][prop] = val;
        }
        return sendJson(res, 200, { key, value: val });
      }
    }

    // Require auth for all protected routes below
    if (!auth.userUuid) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    // 2. User Account & Profile endpoints
    if (pathname === "/api/v1/user/profile" && method === "GET") {
      return sendJson(res, 200, {
        userUuid: auth.userUuid,
        email: auth.email,
        name: auth.fullName || auth.username,
        primaryRole: (auth.roles[0] || "CLIENT").toUpperCase(),
      });
    }

    if (pathname === "/api/users" || pathname === "/api/v1/users") {
      if (method === "GET") {
        return sendJson(
          res,
          200,
          Array.from(usersByUsername.values()).map((u) => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            email: u.email,
            role: u.role,
          }))
        );
      }
      if (method === "POST") {
        const username = String(jsonBody.username || "").trim();
        const role = String(jsonBody.role || "CLIENT").trim().toUpperCase();
        if (!["CLIENT", "THERAPIST", "ADMIN"].includes(role)) {
          return sendJson(res, 400, {
            error: `Validation failed: invalid role '${role}'`,
            message: `Validation failed: invalid role '${role}'`,
          });
        }
        if (usersByUsername.has(username)) {
          return sendJson(res, 400, {
            error: `Username '${username}' already exists`,
            message: `Username '${username}' already exists`,
          });
        }
        const id = crypto.randomUUID();
        const record = {
          id,
          username,
          fullName: String(jsonBody.fullName || username),
          email: String(jsonBody.email || `${username}@example.dk`),
          role,
        };
        usersByUsername.set(username, record);
        userRoles.set(id, new Set([role.toLowerCase()]));
        return sendJson(res, 201, { id, username, role });
      }
    }

    const userIdMatch = pathname.match(/^\/api\/(?:v1\/)?users\/([^/]+)$/);
    if (userIdMatch && method === "DELETE") {
      const targetId = userIdMatch[1];
      for (const [uname, u] of usersByUsername.entries()) {
        if (u.id === targetId) {
          usersByUsername.delete(uname);
          userRoles.delete(targetId);
          return sendJson(res, 204, undefined);
        }
      }
      return sendJson(res, 404, { error: "User not found" });
    }

    // 3. Client profile endpoints
    if (pathname === "/api/v1/clinic/client-profile" && method === "PUT") {
      const uid = String(jsonBody.userId || jsonBody.userUuid || auth.userUuid);
      const saved = {
        ...(clientProfiles.get(uid) || { id: crypto.randomUUID(), userId: uid }),
        ...jsonBody,
        userId: uid,
      };
      clientProfiles.set(uid, saved);
      return sendJson(res, 200, saved);
    }

    const clientProfileMatch = pathname.match(/^\/api\/v1\/clinic\/client-profile\/([^/]+)$/);
    if (clientProfileMatch && method === "GET") {
      const cp = clientProfiles.get(clientProfileMatch[1]);
      if (!cp) return sendJson(res, 404, { error: "Client profile not found" });
      return sendJson(res, 200, cp);
    }

    // 4. Clinic Therapist Onboarding & Readiness (/api/v1/clinic/therapist-onboarding, /me, /services)
    if (pathname === "/api/v1/clinic/therapist-onboarding" && method === "POST") {
      const targetUuid = String(jsonBody.userUuid || auth.userUuid);
      const existing = providerProfiles.get(targetUuid) || {};
      const iban =
        jsonBody.iban !== undefined
          ? String(jsonBody.iban).trim()
          : existing.iban || "";
      const currency =
        jsonBody.currency !== undefined && String(jsonBody.currency).trim() !== ""
          ? String(jsonBody.currency).trim().toUpperCase()
          : existing.currency || "DKK";
      const orgId = existing.organisation?.id || crypto.randomUUID();
      const org = {
        id: orgId,
        name: jsonBody.organisationName || existing.organisation?.name || "Nordic Mind Clinic ApS",
        cvrNumber: jsonBody.cvrNumber || existing.organisation?.cvrNumber || "39485712",
        address: jsonBody.address || existing.organisation?.address || "Vestergade 12",
        postalCode: jsonBody.postalCode || existing.organisation?.postalCode || "1456",
        phoneNumber: jsonBody.phoneNumber || existing.organisation?.phoneNumber || "+45 33 11 22 33",
        iban,
        currency,
      };
      organisations.set(orgId, org);
      const profile = {
        id: existing.id || crypto.randomUUID(),
        userUuid: targetUuid,
        displayName: jsonBody.displayName || existing.displayName || auth.fullName || "Bo Jensen",
        biography: jsonBody.biography || existing.biography || "",
        iban,
        currency,
        workingHoursJson:
          jsonBody.workingHoursJson !== undefined
            ? jsonBody.workingHoursJson
            : existing.workingHoursJson || "09:00-17:00",
        organisation: org,
      };
      providerProfiles.set(targetUuid, profile);
      const existingRoles = userRoles.get(targetUuid) || new Set(["client"]);
      existingRoles.add("therapist");
      userRoles.set(targetUuid, existingRoles);
      return sendJson(res, 200, profile);
    }

    if (pathname === "/api/v1/clinic/me" && method === "GET") {
      const profile = providerProfiles.get(auth.userUuid) || null;
      const missingProfileFields: string[] = [];
      if (auth.isTherapist) {
        if (!profile || !profile.iban || String(profile.iban).trim() === "") {
          missingProfileFields.push("IBAN");
        }
        if (!profile || !profile.currency || String(profile.currency).trim() === "") {
          missingProfileFields.push("Currency");
        }
      }
      return sendJson(res, 200, {
        userUuid: auth.userUuid,
        username: auth.username,
        email: auth.email,
        roles: auth.roles,
        isTherapist: auth.isTherapist,
        providerProfile: profile,
        clientProfile: clientProfiles.get(auth.userUuid) || null,
        canCreateServices: missingProfileFields.length === 0,
        missingProfileFields,
      });
    }

    if (pathname === "/api/v1/clinic/services" && method === "POST") {
      const targetUuid = String(jsonBody.therapistUuid || jsonBody.userUuid || auth.userUuid);
      const profile = providerProfiles.get(targetUuid);
      if (!profile || !profile.iban || String(profile.iban).trim() === "") {
        return sendJson(res, 400, {
          error: "Du kan ikke oprette en service/ydelse før du har udfyldt: IBAN",
          message: "Du kan ikke oprette en service/ydelse før du har udfyldt: IBAN",
        });
      }
      const id = crypto.randomUUID();
      const srv = {
        id,
        therapistUuid: targetUuid,
        provider: {
          id: profile.id,
          userUuid: targetUuid,
          displayName: profile.displayName,
        },
        organisation: profile.organisation,
        name: jsonBody.name,
        description: jsonBody.description,
        durationMinutes: jsonBody.durationMinutes,
        price: jsonBody.price,
        currency: jsonBody.currency || profile.currency || "DKK",
        location: jsonBody.location,
        isActive: true,
        active: true,
        organisationName: profile.organisation?.name || "Nordic Mind Clinic ApS",
      };
      services.set(id, srv);
      return sendJson(res, 201, srv);
    }

    const serviceToggleMatch = pathname.match(/^\/api\/v1\/clinic\/services\/([^/]+)\/toggle$/);
    if (serviceToggleMatch && method === "PATCH") {
      const srv = services.get(serviceToggleMatch[1]);
      if (!srv) return sendJson(res, 404, { error: "Not found" });
      srv.isActive = !srv.isActive;
      srv.active = srv.isActive;
      return sendJson(res, 200, srv);
    }

    if (pathname === "/api/v1/clinic/directory" && method === "GET") {
      return sendJson(res, 200, {
        providers: Array.from(providerProfiles.values()),
        services: Array.from(services.values()),
        organisations: Array.from(organisations.values()),
      });
    }

    // 5. Handshakes (/api/v1/clinic/handshakes)
    if (pathname === "/api/v1/clinic/handshakes") {
      if (method === "GET") {
        return sendJson(res, 200, Array.from(handshakes.values()));
      }
      if (method === "POST") {
        const existing = Array.from(handshakes.values()).find(
          (h) =>
            h.clientUuid === jsonBody.clientUuid &&
            h.therapistUuid === jsonBody.therapistUuid
        );
        const id = existing?.id || crypto.randomUUID();
        const hs = {
          id,
          clientUuid: jsonBody.clientUuid,
          clientName: jsonBody.clientName || existing?.clientName || "Anders Sand",
          therapistUuid: jsonBody.therapistUuid,
          therapistName: jsonBody.therapistName || existing?.therapistName || "Maja Lindholm",
          organisationName:
            jsonBody.organisationName || existing?.organisationName || "Nordic Mind Clinic ApS",
          status: jsonBody.status || existing?.status || "REQUESTED",
          allowedBranches:
            jsonBody.allowedBranches !== undefined
              ? jsonBody.allowedBranches
              : existing?.allowedBranches || null,
          customRestrictions:
            jsonBody.customRestrictions !== undefined
              ? jsonBody.customRestrictions
              : existing?.customRestrictions || null,
          branchRestrictions:
            jsonBody.branchRestrictions !== undefined
              ? jsonBody.branchRestrictions
              : existing?.branchRestrictions || null,
        };
        handshakes.set(id, hs);
        return sendJson(res, 200, hs);
      }
    }

    const hsStatusMatch = pathname.match(/^\/api\/v1\/clinic\/handshakes\/([^/]+)\/status$/);
    if (hsStatusMatch && method === "PATCH") {
      const hs = handshakes.get(hsStatusMatch[1]);
      if (!hs) return sendJson(res, 404, { error: "Not found" });
      if (jsonBody.status !== undefined) hs.status = jsonBody.status;
      if (jsonBody.allowedBranches !== undefined) hs.allowedBranches = jsonBody.allowedBranches;
      if (jsonBody.customRestrictions !== undefined) hs.customRestrictions = jsonBody.customRestrictions;
      if (jsonBody.branchRestrictions !== undefined) hs.branchRestrictions = jsonBody.branchRestrictions;
      return sendJson(res, 200, hs);
    }

    // 6. Appointments (/api/v1/appointments)
    if (pathname === "/api/v1/appointments/timefold-slots" && method === "GET") {
      const therapistUuid = url.searchParams.get("therapistUuid") || "";
      const date = url.searchParams.get("date") || "2026-11-26";
      const durationMinutes = Number(url.searchParams.get("durationMinutes") || 60);
      const existingBookings = Array.from(appointments.values()).filter(
        (a) => a.therapistUuid === therapistUuid && a.status !== "CANCELLED"
      );
      const candidateHours = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
      const slots = candidateHours.map((hhmm) => {
        const startIso = `${date}T${hhmm}:00`;
        const startDate = new Date(startIso);
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
        const endIso = `${date}T${String(endDate.getHours()).padStart(2, "0")}:${String(
          endDate.getMinutes()
        ).padStart(2, "0")}:00`;
        const overlaps = existingBookings.some(
          (a) => a.startTime < endIso && a.endTime > startIso
        );
        return {
          slot: hhmm,
          startTime: startIso,
          endTime: endIso,
          available: !overlaps,
          overlaps,
          withinWorkingHours: true,
        };
      });
      const firstAvailable = slots.find((s) => s.available);
      const recommendedSlot = firstAvailable ? firstAvailable.slot : null;
      return sendJson(res, 200, {
        solver: "Timefold Solver 1.16.0",
        therapistUuid,
        date,
        durationMinutes,
        recommendedSlot,
        feasible: Boolean(recommendedSlot),
        slots,
      });
    }

    const aptClientMatch = pathname.match(/^\/api\/v1\/appointments\/client\/([^/]+)$/);
    if (aptClientMatch && method === "GET") {
      const clientUuid = aptClientMatch[1];
      const fromDate = (url.searchParams.get("from") || "").slice(0, 10);
      const toDate = (url.searchParams.get("to") || "").slice(0, 10);
      const list = Array.from(appointments.values()).filter((a) => {
        if (a.clientUuid !== clientUuid) return false;
        const aptDate = String(a.startTime || "").slice(0, 10);
        if (fromDate && aptDate < fromDate) return false;
        if (toDate && aptDate > toDate) return false;
        return true;
      });
      return sendJson(res, 200, list);
    }

    if (pathname === "/api/v1/appointments") {
      if (method === "GET") {
        return sendJson(res, 200, Array.from(appointments.values()));
      }
      if (method === "POST") {
        if (
          jsonBody.startTime &&
          jsonBody.endTime &&
          new Date(jsonBody.endTime).getTime() <= new Date(jsonBody.startTime).getTime()
        ) {
          return sendJson(res, 400, {
            error: "Invalid time range: End time must be after start time",
            message: "Invalid time range: End time must be after start time",
          });
        }
        const conflict = Array.from(appointments.values()).some(
          (a) =>
            a.status !== "CANCELLED" &&
            a.therapistUuid === jsonBody.therapistUuid &&
            a.startTime < jsonBody.endTime &&
            a.endTime > jsonBody.startTime
        );
        if (conflict) {
          return sendJson(res, 409, { error: "Time slot overlap conflict" });
        }
        const id = crypto.randomUUID();
        const apt = {
          id,
          clientUuid: jsonBody.clientUuid,
          clientName: jsonBody.clientName || "Anders Sand",
          therapistUuid: jsonBody.therapistUuid,
          therapistName: jsonBody.therapistName || "Maja Lindholm",
          serviceId: jsonBody.serviceId || null,
          title: jsonBody.title || "Terapisamtale",
          startTime: jsonBody.startTime,
          endTime: jsonBody.endTime,
          status: "CONFIRMED",
          gitCommitHash: crypto.randomBytes(4).toString("hex"),
        };
        appointments.set(id, apt);
        return sendJson(res, 201, apt);
      }
    }

    const aptHistoryMatch = pathname.match(/^\/api\/v1\/appointments\/([^/]+)\/git-history$/);
    if (aptHistoryMatch && method === "GET") {
      const existing = appointments.get(aptHistoryMatch[1]);
      if (!existing) return sendJson(res, 404, { error: "Not found" });
      return sendJson(res, 200, [
        {
          commitHash: existing.gitCommitHash || "abc1234",
          message: `Appointment ${existing.status}`,
        },
      ]);
    }

    const aptIdMatch = pathname.match(/^\/api\/v1\/appointments\/([^/]+)$/);
    if (aptIdMatch) {
      const aptId = aptIdMatch[1];
      const existing = appointments.get(aptId);
      if (!existing) return sendJson(res, 404, { error: "Not found" });
      if (method === "GET") {
        return sendJson(res, 200, existing);
      }
      if (method === "DELETE") {
        existing.status = "CANCELLED";
        return sendJson(res, 200, existing);
      }
      if (method === "PUT") {
        if (jsonBody.startTime && new Date(jsonBody.startTime).getTime() < Date.now()) {
          return sendJson(res, 400, {
            error: "Cannot reschedule an appointment to a time in the past",
            message: "Cannot reschedule an appointment to a time in the past",
          });
        }
        const conflict = Array.from(appointments.values()).some(
          (a) =>
            a.id !== aptId &&
            a.status !== "CANCELLED" &&
            a.therapistUuid === existing.therapistUuid &&
            a.startTime < jsonBody.endTime &&
            a.endTime > jsonBody.startTime
        );
        if (conflict) {
          return sendJson(res, 409, { error: "Time slot overlap conflict" });
        }
        existing.startTime = jsonBody.startTime;
        existing.endTime = jsonBody.endTime;
        return sendJson(res, 200, existing);
      }
    }

    // 7. Clinic Overviews
    const clientOverviewMatch = pathname.match(/^\/api\/v1\/clinic\/client\/([^/]+)\/overview$/);
    if (clientOverviewMatch && method === "GET") {
      const clientUuid = clientOverviewMatch[1];
      const clientJournals = journalEntries.filter((e) => e.clientUuid === clientUuid);
      const clientApts = Array.from(appointments.values()).filter(
        (a) => a.clientUuid === clientUuid && a.status !== "CANCELLED"
      );
      const clientHs = Array.from(handshakes.values()).filter((h) => h.clientUuid === clientUuid);
      const ownProviderProfile = providerProfiles.get(clientUuid) || null;
      const marketplaceServices = Array.from(services.values()).filter(
        (s: any) => s.therapistUuid !== clientUuid && s.provider?.userUuid !== clientUuid
      );
      return sendJson(res, 200, {
        clientProfile: clientProfiles.get(clientUuid) || {
          userId: clientUuid,
          fullName: auth.fullName,
          email: auth.email,
        },
        providerProfile: ownProviderProfile,
        appointments: clientApts,
        handshakes: clientHs,
        journals: clientJournals,
        pcl5Tests: pcl5Tests.filter((t) => t.clientUuid === clientUuid),
        providers: Array.from(providerProfiles.values()),
        services: marketplaceServices,
      });
    }

    const overviewMatch = pathname.match(/^\/api\/v1\/clinic\/therapist\/([^/]+)\/overview$/);
    if (overviewMatch && method === "GET") {
      const therapistUuid = overviewMatch[1];
      const activeApts = Array.from(appointments.values()).filter(
        (a) => a.therapistUuid === therapistUuid && a.status !== "CANCELLED"
      );
      const dailyCounts: Record<string, number> = {};
      for (const a of activeApts) {
        const d = String(a.startTime || "").slice(0, 10);
        if (d) dailyCounts[d] = (dailyCounts[d] || 0) + 1;
      }
      const therapistHandshakes = Array.from(handshakes.values()).filter(
        (h) => h.therapistUuid === therapistUuid
      );
      const clientsList = therapistHandshakes.map((hs) => {
        const testsForClient = pcl5Tests.filter((t) => t.clientUuid === hs.clientUuid);
        const latestScore =
          testsForClient.length > 0 ? testsForClient[testsForClient.length - 1].score : null;
        return {
          uuid: hs.clientUuid,
          clientUuid: hs.clientUuid,
          name: hs.clientName,
          clientName: hs.clientName,
          handshakeStatus: hs.status,
          latestPcl5Score: latestScore,
        };
      });
      return sendJson(res, 200, {
        therapistUuid,
        providerProfile: providerProfiles.get(therapistUuid) || null,
        appointments: activeApts,
        dailyCounts,
        handshakes: therapistHandshakes,
        services: Array.from(services.values()).filter((s) => s.therapistUuid === therapistUuid),
        clients: clientsList,
        recentTests: pcl5Tests,
      });
    }

    // 8. Psychotraumatology PCL-5 tests
    if (pathname === "/api/v1/psychotraumatology/tests" && method === "POST") {
      const testEntry = {
        id: crypto.randomUUID(),
        ...jsonBody,
        createdAt: new Date().toISOString(),
      };
      pcl5Tests.push(testEntry);
      return sendJson(res, 200, testEntry);
    }

    const pclClientMatch = pathname.match(/^\/api\/v1\/psychotraumatology\/tests\/client\/([^/]+)$/);
    if (pclClientMatch && method === "GET") {
      const targetClientUuid = pclClientMatch[1];
      if (!auth.isTherapist && auth.userUuid !== targetClientUuid) {
        return sendJson(res, 403, { error: "Forbidden: cannot view another client's PCL-5 tests" });
      }
      return sendJson(
        res,
        200,
        pcl5Tests.filter((t) => t.clientUuid === targetClientUuid)
      );
    }

    // 9. Journals & JGit History
    if (pathname === "/api/v1/journals" && method === "POST") {
      const branch = jsonBody.gitBranch || "main";
      const commit = addJGitCommit({
        clientUuid: jsonBody.clientUuid,
        author: auth.fullName || auth.username,
        message: jsonBody.title || "Journalopslag",
        isConfidential: false,
        addedLine: jsonBody.content || jsonBody.title || "Journalopslag",
        mood: jsonBody.moodRating ?? 7,
        branch,
      });
      const entry = {
        id: crypto.randomUUID(),
        clientUuid: jsonBody.clientUuid,
        title: jsonBody.title,
        content: jsonBody.content,
        moodRating: jsonBody.moodRating ?? 7,
        sharedWithTherapists: jsonBody.sharedWithTherapists ?? true,
        gitBranch: branch,
        createdAt: commit.timestamp,
        timestamp: commit.timestamp,
        commitHash: commit.commitHash,
        gitCommitHash: commit.commitHash,
      };
      journalEntries.unshift(entry);
      return sendJson(res, 200, entry);
    }

    if (pathname === "/api/v1/journals/therapist-notes" && method === "POST") {
      if (!auth.isTherapist) {
        return sendJson(res, 403, { error: "Forbidden: requires Keycloak therapist role" });
      }
      const commit = addJGitCommit({
        clientUuid: jsonBody.clientUuid,
        author: jsonBody.therapistName || auth.fullName || "Therapist",
        message: "Fortroligt klinisk notat (INTERNAL_MEDICAL_NOTES)",
        isConfidential: true,
        addedLine: jsonBody.therapistNote,
      });
      const note = {
        id: crypto.randomUUID(),
        clientUuid: jsonBody.clientUuid,
        authorTherapistName: jsonBody.therapistName || auth.fullName,
        confidentialMarkdown: jsonBody.therapistNote,
        commitHash: commit.commitHash,
        gitCommitHash: commit.commitHash,
      };
      clinicalNotes.unshift(note);
      return sendJson(res, 200, note);
    }

    const clientJournalMatch = pathname.match(/^\/api\/v1\/journals\/client\/([^/]+)$/);
    if (clientJournalMatch && method === "GET") {
      const clientUuid = clientJournalMatch[1];
      const therapistUuidParam = url.searchParams.get("therapistUuid");
      const entries = journalEntries.filter((e) => e.clientUuid === clientUuid);
      const notesForClient = clinicalNotes.filter((n) => n.clientUuid === clientUuid);

      if (therapistUuidParam || (auth.isTherapist && auth.userUuid !== clientUuid)) {
        const effectiveTherapist = therapistUuidParam || auth.userUuid;
        const hs = Array.from(handshakes.values()).find(
          (h) =>
            h.clientUuid === clientUuid &&
            h.therapistUuid === effectiveTherapist &&
            h.status === "ACTIVE"
        );
        if (!hs) {
          return sendJson(res, 200, { clientUuid, entries: [], clinicalNotes: [] });
        }
        return sendJson(res, 200, {
          clientUuid,
          entries,
          clinicalNotes: notesForClient,
        });
      }
      return sendJson(res, 200, {
        clientUuid,
        entries,
        clinicalNotes: [],
      });
    }

    const historyMatch = pathname.match(/^\/api\/v1\/journals\/history\/([^/]+)$/);
    if (historyMatch && method === "GET") {
      const clientUuid = historyMatch[1];
      const therapistUuidParam = url.searchParams.get("therapistUuid");
      const clientCommits = jgitCommits.filter((c) => c.clientUuid === clientUuid);
      if (auth.isTherapist) {
        if (therapistUuidParam || auth.userUuid !== clientUuid) {
          const effectiveTherapist = therapistUuidParam || auth.userUuid;
          const hs = Array.from(handshakes.values()).find(
            (h) =>
              h.clientUuid === clientUuid &&
              h.therapistUuid === effectiveTherapist &&
              h.status === "ACTIVE"
          );
          if (!hs) {
            return sendJson(res, 200, []);
          }
        }
        return sendJson(res, 200, clientCommits);
      }
      const filtered = clientCommits
        .filter((c) => !c.isConfidential && !String(c.delta || "").includes("INTERNAL_MEDICAL_NOTES"))
        .map((c) => ({
          ...c,
          parentSnapshot: String(c.parentSnapshot || "")
            .split("\n\n")
            .filter((block) => !block.includes("INTERNAL_MEDICAL_NOTES"))
            .join("\n\n"),
          snapshot: String(c.snapshot || "")
            .split("\n\n")
            .filter((block) => !block.includes("INTERNAL_MEDICAL_NOTES"))
            .join("\n\n"),
        }));
      return sendJson(res, 200, filtered);
    }

    const timelineMatch = pathname.match(/^\/api\/v1\/journals\/timeline\/([^/]+)$/);
    if (timelineMatch && method === "GET") {
      const clientUuid = timelineMatch[1];
      const clientCommits = jgitCommits.filter((c) => c.clientUuid === clientUuid);
      const visible = auth.isTherapist
        ? clientCommits
        : clientCommits.filter(
            (c) => !c.isConfidential && !String(c.delta || "").includes("INTERNAL_MEDICAL_NOTES")
          );
      return sendJson(
        res,
        200,
        visible.map((c) => ({
          timestamp: c.timestamp,
          author: c.author,
          title: c.message,
          content: c.delta,
          confidential: c.isConfidential,
        }))
      );
    }

    // 10. Finance Endpoints (/api/v1/finance/*)
    if (pathname === "/api/v1/finance/invoices/session" && method === "POST") {
      const amount = Number(jsonBody.amount || 50);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      const invoiceId = `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const gitCommitHash = crypto.randomBytes(4).toString("hex");
      const invoice = {
        invoiceId,
        clientUuid: jsonBody.clientUuid || auth.userUuid,
        amount,
        currency,
        status: "PAID",
        gitCommitHash,
      };
      invoicesById.set(invoiceId, invoice);
      ledgerCommits.set(gitCommitHash, {
        commitHash: gitCommitHash,
        invoiceId,
        amount,
        currency,
        voucher: `PAID ${amount} ${currency}`,
      });
      glBalances["1100"] = (glBalances["1100"] || 0) + amount;
      glBalances["4100"] = (glBalances["4100"] || 0) + amount;
      return sendJson(res, 201, invoice);
    }

    const commitMatch = pathname.match(/^\/api\/v1\/finance\/ledger\/commits\/([^/]+)$/);
    if (commitMatch && method === "GET") {
      const snap = ledgerCommits.get(commitMatch[1]);
      if (!snap) return sendJson(res, 404, { error: "Commit not found" });
      return sendJson(res, 200, snap);
    }

    const refundMatch = pathname.match(/^\/api\/v1\/finance\/invoices\/([^/]+)\/refund$/);
    if (refundMatch && method === "POST") {
      if (!auth.isTherapist && !auth.isAdmin) {
        return sendJson(res, 403, { error: "Forbidden" });
      }
      const inv = invoicesById.get(refundMatch[1]);
      if (!inv) return sendJson(res, 404, { error: "Invoice not found" });
      if (inv.status !== "REFUNDED") {
        glBalances["1100"] = (glBalances["1100"] || 0) - inv.amount;
        glBalances["4100"] = (glBalances["4100"] || 0) - inv.amount;
        inv.status = "REFUNDED";
      }
      return sendJson(res, 200, inv);
    }

    if (pathname === "/api/v1/finance/prepaid/topup" && method === "POST") {
      const clientUuid = String(jsonBody.clientUuid || auth.userUuid);
      const amount = Number(jsonBody.amount || 50);
      const clips = Number(jsonBody.clips || 1);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      const existing = savingsAccounts.get(clientUuid) || {
        balance: 0,
        remainingClips: 0,
        clipUnitPrice: 0,
        currency,
      };
      existing.balance += amount;
      existing.remainingClips += clips;
      existing.clipUnitPrice =
        existing.remainingClips > 0 ? existing.balance / existing.remainingClips : 0;
      savingsAccounts.set(clientUuid, existing);
      glBalances["1100"] = (glBalances["1100"] || 0) + amount;
      glBalances["2100"] = (glBalances["2100"] || 0) + amount;
      return sendJson(res, 201, {
        savingsAccountId: `FIN-SAV-${clientUuid.slice(0, 8).toUpperCase()}`,
        clientUuid,
        balance: existing.balance,
        remainingClips: existing.remainingClips,
        clipUnitPrice: existing.clipUnitPrice,
        currency,
        gitCommitHash: crypto.randomBytes(4).toString("hex"),
      });
    }

    if (pathname === "/api/v1/finance/prepaid/consume" && method === "POST") {
      const clientUuid = String(jsonBody.clientUuid || auth.userUuid);
      const clipsToUse = Number(jsonBody.clips || 1);
      const existing = savingsAccounts.get(clientUuid);
      if (!existing || existing.remainingClips < clipsToUse || existing.balance <= 0) {
        return sendJson(res, 400, { error: "Insufficient prepaid clips" });
      }
      const deductedAmount =
        existing.remainingClips === clipsToUse
          ? existing.balance
          : existing.clipUnitPrice * clipsToUse;
      existing.remainingClips -= clipsToUse;
      existing.balance -= deductedAmount;
      savingsAccounts.set(clientUuid, existing);
      glBalances["2100"] = (glBalances["2100"] || 0) - deductedAmount;
      glBalances["4100"] = (glBalances["4100"] || 0) + deductedAmount;
      return sendJson(res, 200, {
        savingsAccountId: `FIN-SAV-${clientUuid.slice(0, 8).toUpperCase()}`,
        clientUuid,
        deductedAmount,
        remainingClips: existing.remainingClips,
        balance: existing.balance,
        currency: existing.currency,
        gitCommitHash: crypto.randomBytes(4).toString("hex"),
      });
    }

    if (pathname === "/api/v1/finance/subscriptions" && method === "POST") {
      const amount = Number(jsonBody.monthlyAmount || 250);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      const clientUuid = String(jsonBody.clientUuid || auth.userUuid);
      glBalances["1100"] = (glBalances["1100"] || 0) + amount;
      glBalances["4200"] = (glBalances["4200"] || 0) + amount;
      const sub = {
        subscriptionId: `KB-SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        initialInvoiceId: `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        clientUuid,
        planName: jsonBody.planName || "Standard Maanedsabonnement",
        monthlyAmount: amount,
        currency,
        status: "ACTIVE",
        gitCommitHash: crypto.randomBytes(4).toString("hex"),
      };
      const existingSubs = subscriptionsByClient.get(clientUuid) || [];
      existingSubs.push(sub);
      subscriptionsByClient.set(clientUuid, existingSubs);
      return sendJson(res, 201, sub);
    }

    if (pathname === "/api/v1/finance/installment-plans" && method === "POST") {
      const loanId = `FIN-LOAN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const principalAmount = Number(jsonBody.principalAmount || 0);
      const installmentsCount = Number(jsonBody.installmentsCount || 3);
      const loan = {
        loanId,
        id: loanId,
        clientUuid: String(jsonBody.clientUuid || auth.userUuid),
        principalAmount,
        remainingPrincipal: principalAmount,
        installmentsCount,
        paidInstallments: 0,
        currency: String(jsonBody.currency || "DKK").toUpperCase(),
        status: "ACTIVE",
      };
      installmentLoans.set(loanId, loan);
      glBalances["1200"] = (glBalances["1200"] || 0) + principalAmount;
      return sendJson(res, 201, loan);
    }

    const repayMatch = pathname.match(/^\/api\/v1\/finance\/installment-plans\/([^/]+)\/repay$/);
    if (repayMatch && method === "POST") {
      const loan = installmentLoans.get(repayMatch[1]);
      if (!loan) return sendJson(res, 404, { error: "Loan not found" });
      const repayAmount = Number(jsonBody.amount || 0);
      loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - repayAmount);
      loan.paidInstallments += 1;
      if (loan.remainingPrincipal === 0 || loan.paidInstallments >= loan.installmentsCount) {
        loan.status = "CLOSED";
      }
      glBalances["1100"] = (glBalances["1100"] || 0) + repayAmount;
      glBalances["1200"] = (glBalances["1200"] || 0) - repayAmount;
      return sendJson(res, 200, loan);
    }

    const financeOverviewMatch = pathname.match(/^\/api\/v1\/finance\/client\/([^/]+)\/overview$/);
    if (financeOverviewMatch && method === "GET") {
      const targetUuid = financeOverviewMatch[1];
      if (!auth.isTherapist && !auth.isAdmin && auth.userUuid !== targetUuid) {
        return sendJson(res, 403, { error: "Forbidden: cannot view another client's overview" });
      }
      const savings = savingsAccounts.get(targetUuid) || {
        balance: 0,
        remainingClips: 0,
        clipUnitPrice: 0,
        currency: "DKK",
      };
      const plans = Array.from(installmentLoans.values()).filter((l) => l.clientUuid === targetUuid);
      return sendJson(res, 200, {
        clientUuid: targetUuid,
        prepaidSavings: savings,
        subscriptions: subscriptionsByClient.get(targetUuid) || [],
        installmentPlans: plans,
      });
    }

    if (pathname === "/api/v1/finance/ledger/summary" && method === "GET") {
      if (!auth.isTherapist && !auth.isAdmin) {
        return sendJson(res, 403, { error: "Forbidden: requires therapist or admin role" });
      }
      return sendJson(res, 200, {
        chartOfAccounts: Object.entries(glBalances).map(([glCode, balance]) => ({
          glCode,
          balance,
        })),
      });
    }

    return sendJson(res, 200, {});
  });

  await new Promise<void>((resolve) => keycloakServer.listen(keycloakPort, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => backendServer.listen(backendPort, "127.0.0.1", resolve));

  return {
    keycloakServer,
    backendServer,
    keycloakPort,
    backendPort,
    close: async () => {
      await new Promise<void>((resolve) => keycloakServer.close(() => resolve()));
      await new Promise<void>((resolve) => backendServer.close(() => resolve()));
    },
  };
}
