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

function sendJson(res: http.ServerResponse, status: number, body: any) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(payload, "utf8")),
  });
  res.end(payload);
}

export async function startSelfContainedMockStack(
  backendPort = 18081,
  keycloakPort = 18082
): Promise<MockStackServers> {
  // -------------------------------------------------------------------------
  // In-memory state for Keycloak & Backend
  // -------------------------------------------------------------------------
  const userRoles = new Map<string, Set<string>>([
    ["4c421f46-836c-4897-8dae-ba9587473273", new Set(["client", "therapist", "admin"])],
    ["5e357ca1-4913-414f-91a6-81a7de9042ab", new Set(["client"])],
    ["f951db57-01ab-4693-bed4-17d03f0870f1", new Set(["client"])],
    ["3229b65b-0e95-4dc6-8336-ac7a5a56edc1", new Set(["client"])],
  ]);

  const usersByUsername = new Map<
    string,
    { id: string; username: string; name: string; email: string }
  >([
    [
      "bijens",
      {
        id: "4c421f46-836c-4897-8dae-ba9587473273",
        username: "bijens",
        name: "Bo Jensen",
        email: "bjens@mail.com",
      },
    ],
    [
      "client",
      {
        id: "5e357ca1-4913-414f-91a6-81a7de9042ab",
        username: "client",
        name: "Anders Sand",
        email: "client@mail.com",
      },
    ],
    [
      "anders_sand",
      {
        id: "5e357ca1-4913-414f-91a6-81a7de9042ab",
        username: "anders_sand",
        name: "Anders Sand",
        email: "client@mail.com",
      },
    ],
    [
      "client2",
      {
        id: "f951db57-01ab-4693-bed4-17d03f0870f1",
        username: "client2",
        name: "Sofie Holm",
        email: "client2@mail.com",
      },
    ],
    [
      "test",
      {
        id: "3229b65b-0e95-4dc6-8336-ac7a5a56edc1",
        username: "test",
        name: "Test Bruger",
        email: "test@mail.com",
      },
    ],
  ]);

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
        name: username,
        email: `${username}@klinik.dk`,
      };
      const roles = Array.from(userRoles.get(user.id) || ["client"]);
      const accessToken = makeFakeJwt({
        sub: user.id,
        preferred_username: user.username,
        name: user.name,
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

  // -------------------------------------------------------------------------
  // 2. Mock Backend Server (/api/v1/*)
  // -------------------------------------------------------------------------
  const providerProfiles = new Map<string, any>();
  const services = new Map<string, any>();
  const handshakes = new Map<string, any>();
  const appointments = new Map<string, any>();
  const pcl5Tests: any[] = [];
  const journalEntries: any[] = [];
  const jgitCommits: any[] = [];
  const savingsAccounts = new Map<string, { balance: number; remainingClips: number; clipUnitPrice: number; currency: string }>();
  const glBalances: Record<string, number> = {
    "1100": 0,
    "1200": 0,
    "2100": 0,
    "4100": 0,
    "4200": 0,
  };

  const i18nStore: Record<string, Record<string, any>> = {
    da: {
      portal: {
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
        tabCalendar: "Monatskalender & Tagesplan",
        appointmentsCountBadge: "{count} Termine",
        singleAppointmentBadge: "1 Termin",
      },
      HomePage: {
        heroTitle: "Reflektieren, Lernen und Wachsen",
      },
    },
  };

  function buildUnifiedSnapshot(): string {
    return journalEntries
      .map(
        (e) =>
          `## ${e.title} (${String(e.createdAt || "2026-10-14T10:30:00").slice(0, 19)})\nMood: ${e.moodRating ?? 7}/10 | Shared: ${e.sharedWithTherapists ?? true}\n${e.content}`
      )
      .join("\n\n");
  }

  function addJGitCommit(opts: {
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

  // Initial seed commits so 2026-10-14 always has both shared and confidential commits
  const seedCommit1 = addJGitCommit({
    author: "Anders Sand",
    message: "Uge 41 Refleksion",
    isConfidential: false,
    addedLine: "Jeg har sovet bedre i denne uge.",
    dateStr: "2026-10-14",
    mood: 7,
  });
  journalEntries.push({
    id: "seed-journal-1",
    clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
    title: "Uge 41 Refleksion",
    content: "Jeg har sovet bedre i denne uge.",
    moodRating: 7,
    sharedWithTherapists: true,
    createdAt: "2026-10-14T09:00:00Z",
    timestamp: "2026-10-14T09:00:00Z",
    commitHash: seedCommit1.commitHash,
    gitCommitHash: seedCommit1.commitHash,
  });
  addJGitCommit({
    author: "Bo Jensen",
    message: "Klinisk notat (INTERNAL_MEDICAL_NOTES)",
    isConfidential: true,
    addedLine: "Patient responderer positivt på kognitiv omstrukturering.",
    dateStr: "2026-10-14",
  });

  function extractAuth(req: http.IncomingMessage) {
    const userUuid = String(req.headers["x-auth-user-uuid"] || "").trim();
    const username = String(req.headers["x-auth-username"] || "client").trim();
    const rolesRaw = String(req.headers["x-auth-roles"] || "").trim();
    const roles = rolesRaw
      ? rolesRaw
          .split(",")
          .map((r) => r.trim().replace(/^ROLE_/i, "").toLowerCase())
          .filter(Boolean)
      : ["client"];
    const isTherapist = roles.includes("therapist");
    return { userUuid, username, roles, isTherapist };
  }

  const backendServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${backendPort}`);
    // Support both /api/v1/* and /api/backend/* BFF proxy paths directly when Next.js isn't running
    const pathname = url.pathname.replace(/^\/api\/backend(\/|$)/, "/api/v1$1");
    const method = req.method || "GET";
    const rawBody = await readRequestBody(req);
    let jsonBody: any = {};
    try {
      jsonBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      jsonBody = {};
    }

    const auth = extractAuth(req);

    // 1. Public & i18n endpoints
    if (pathname.startsWith("/api/v1/i18n/")) {
      const rest = pathname.slice("/api/v1/i18n/".length);
      const parts = rest.split("/");
      const locale = parts[0] || "da";
      if (!i18nStore[locale]) {
        i18nStore[locale] = JSON.parse(JSON.stringify(i18nStore.da));
      }
      if (method === "GET") {
        return sendJson(res, 200, i18nStore[locale]);
      }
      if (method === "PUT" && parts.length >= 2) {
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

    if (pathname === "/api/v1/public/client-profile" && method === "POST") {
      return sendJson(res, 200, { ...jsonBody, id: crypto.randomUUID() });
    }

    if ((pathname === "/api/users" || pathname === "/api/v1/users") && method === "POST") {
      const id = crypto.randomUUID();
      const username = String(jsonBody.username || `user_${id.slice(0, 6)}`);
      const role = String(jsonBody.role || "CLIENT").toUpperCase();
      usersByUsername.set(username, {
        id,
        username,
        name: username,
        email: `${username}@klinik.dk`,
      });
      userRoles.set(id, new Set([role.toLowerCase()]));
      return sendJson(res, 201, { id, username, role });
    }

    // Require auth for non-public endpoints
    if (!auth.userUuid) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    // 2. /api/v1/clinic/therapist-onboarding
    if (pathname === "/api/v1/clinic/therapist-onboarding" && method === "POST") {
      const targetUuid = jsonBody.userUuid || auth.userUuid;
      const existing = providerProfiles.get(targetUuid) || {};
      const iban =
        jsonBody.iban !== undefined
          ? String(jsonBody.iban).trim()
          : existing.iban || "";
      const currency =
        jsonBody.currency !== undefined && String(jsonBody.currency).trim() !== ""
          ? String(jsonBody.currency).trim().toUpperCase()
          : existing.currency || "DKK";
      const profile = {
        id: existing.id || crypto.randomUUID(),
        userUuid: targetUuid,
        displayName: jsonBody.displayName || existing.displayName || "Bo Jensen",
        biography: jsonBody.biography || existing.biography || "",
        iban,
        currency,
        workingHoursJson:
          jsonBody.workingHoursJson !== undefined
            ? jsonBody.workingHoursJson
            : existing.workingHoursJson || "Mandag-Fredag 09:00-16:00",
        organisation: {
          id: existing.organisation?.id || crypto.randomUUID(),
          name: jsonBody.organisationName || existing.organisation?.name || "Nordic Mind Clinic ApS",
          cvrNumber: jsonBody.cvrNumber || existing.organisation?.cvrNumber || "39485712",
          address: jsonBody.address || existing.organisation?.address || "Vestergade 12",
          postalCode: jsonBody.postalCode || existing.organisation?.postalCode || "1456",
          phoneNumber: jsonBody.phoneNumber || existing.organisation?.phoneNumber || "+45 33 11 22 33",
          iban,
          currency,
        },
      };
      providerProfiles.set(targetUuid, profile);
      const existingRoles = userRoles.get(targetUuid) || new Set(["client"]);
      existingRoles.add("therapist");
      userRoles.set(targetUuid, existingRoles);
      return sendJson(res, 200, profile);
    }

    // 3. /api/v1/clinic/me
    if (pathname === "/api/v1/clinic/me" && method === "GET") {
      const profile = providerProfiles.get(auth.userUuid) || null;
      return sendJson(res, 200, {
        userUuid: auth.userUuid,
        username: auth.username,
        roles: auth.roles,
        isTherapist: auth.isTherapist,
        providerProfile: profile,
      });
    }

    // 4. /api/v1/clinic/services
    if (pathname === "/api/v1/clinic/services" && method === "POST") {
      const targetUuid = jsonBody.therapistUuid || jsonBody.userUuid || auth.userUuid;
      const profile = providerProfiles.get(targetUuid);
      if (!profile || !profile.iban || String(profile.iban).trim() === "") {
        return sendJson(res, 400, {
          error:
            "Du kan ikke oprette en service/ydelse før du har udfyldt: IBAN",
          message:
            "Du kan ikke oprette en service/ydelse før du har udfyldt: IBAN",
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
        name: jsonBody.name,
        description: jsonBody.description,
        durationMinutes: jsonBody.durationMinutes,
        price: jsonBody.price,
        currency: jsonBody.currency || profile.currency || "DKK",
        location: jsonBody.location,
        isActive: true,
        organisationName: "Nordic Mind Clinic ApS",
      };
      services.set(id, srv);
      return sendJson(res, 201, srv);
    }

    const serviceToggleMatch = pathname.match(/^\/api\/v1\/clinic\/services\/([^/]+)\/toggle$/);
    if (serviceToggleMatch && method === "PATCH") {
      const srv = services.get(serviceToggleMatch[1]);
      if (!srv) return sendJson(res, 404, { error: "Not found" });
      srv.isActive = !srv.isActive;
      return sendJson(res, 200, srv);
    }

    // 5. /api/v1/clinic/directory
    if (pathname === "/api/v1/clinic/directory" && method === "GET") {
      return sendJson(res, 200, {
        therapists: Array.from(providerProfiles.values()),
        services: Array.from(services.values()),
        organisations: [{ name: "Nordic Mind Clinic ApS", cvrNumber: "39485712" }],
      });
    }

    // 6. /api/v1/clinic/handshakes
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
          therapistName: jsonBody.therapistName || existing?.therapistName || "Bo Jensen",
          organisationName:
            jsonBody.organisationName || existing?.organisationName || "Nordic Mind Clinic ApS",
          status: jsonBody.status || existing?.status || "ACTIVE",
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

    // 7. Appointments (/api/v1/appointments)
    if (pathname === "/api/v1/appointments") {
      if (method === "GET") {
        return sendJson(res, 200, Array.from(appointments.values()));
      }
      if (method === "POST") {
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
          therapistName: jsonBody.therapistName || "Bo Jensen",
          title: jsonBody.title || "Terapisamtale",
          startTime: jsonBody.startTime,
          endTime: jsonBody.endTime,
          status: jsonBody.status || "SCHEDULED",
        };
        appointments.set(id, apt);
        return sendJson(res, 201, apt);
      }
    }

    const aptIdMatch = pathname.match(/^\/api\/v1\/appointments\/([^/]+)$/);
    if (aptIdMatch) {
      const aptId = aptIdMatch[1];
      const existing = appointments.get(aptId);
      if (!existing) return sendJson(res, 404, { error: "Not found" });
      if (method === "DELETE") {
        existing.status = "CANCELLED";
        appointments.delete(aptId);
        return sendJson(res, 200, existing);
      }
      if (method === "PUT") {
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

    // 8a. Client Overview (/api/v1/clinic/client/:uuid/overview)
    const clientOverviewMatch = pathname.match(/^\/api\/v1\/clinic\/client\/([^/]+)\/overview$/);
    if (clientOverviewMatch && method === "GET") {
      const clientUuid = clientOverviewMatch[1];
      const clientJournals = journalEntries.filter((e) => e.clientUuid === clientUuid);
      const clientApts = Array.from(appointments.values()).filter(
        (a) => a.clientUuid === clientUuid && a.status !== "CANCELLED"
      );
      const clientHs = Array.from(handshakes.values()).filter(
        (h) => h.clientUuid === clientUuid
      );
      const ownProviderProfile = providerProfiles.get(clientUuid) || null;
      const marketplaceServices = Array.from(services.values()).filter(
        (s: any) =>
          s.therapistUuid !== clientUuid &&
          s.provider?.userUuid !== clientUuid
      );
      return sendJson(res, 200, {
        clientProfile: {
          userUuid: clientUuid,
          fullName: "Anders Sand",
          email: "client@mail.com",
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

    // 8b. Therapist Overview (/api/v1/clinic/therapist/:uuid/overview)
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
      // Also populate the current month's 14th so the monthly calendar shows "2 aftaler" regardless of current date
      const now = new Date();
      const currentMonth14 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-14`;
      if (dailyCounts["2026-10-14"] && !dailyCounts[currentMonth14]) {
        dailyCounts[currentMonth14] = dailyCounts["2026-10-14"];
      }
      return sendJson(res, 200, {
        therapistUuid,
        providerProfile: providerProfiles.get(therapistUuid) || null,
        appointments: activeApts,
        dailyCounts,
        handshakes: Array.from(handshakes.values()),
        services: Array.from(services.values()),
        clients: [
          {
            uuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
            name: "Anders Sand",
            clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
            clientName: "Anders Sand",
            email: "client@mail.com",
            handshakeStatus: "ACTIVE",
            latestPcl5Score: pcl5Tests.length > 0 ? pcl5Tests[pcl5Tests.length - 1].score : 41,
          },
        ],
        recentTests: pcl5Tests,
      });
    }

    // 9. Psychotraumatology PCL-5 tests
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

    // 10. Journals & JGit History
    if (pathname === "/api/v1/journals" && method === "POST") {
      const branch = jsonBody.gitBranch || "main";
      const commit = addJGitCommit({
        author: auth.isTherapist ? "Bo Jensen" : "Anders Sand",
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
        author: jsonBody.therapistName || "Bo Jensen",
        message: "Fortroligt klinisk notat (INTERNAL_MEDICAL_NOTES)",
        isConfidential: true,
        addedLine: jsonBody.therapistNote,
      });
      return sendJson(res, 200, {
        id: crypto.randomUUID(),
        clientUuid: jsonBody.clientUuid,
        therapistNote: jsonBody.therapistNote,
        commitHash: commit.commitHash,
        gitCommitHash: commit.commitHash,
      });
    }

    const clientJournalMatch = pathname.match(/^\/api\/v1\/journals\/client\/([^/]+)$/);
    if (clientJournalMatch && method === "GET") {
      const clientUuid = clientJournalMatch[1];
      const therapistUuidParam = url.searchParams.get("therapistUuid");
      let entries = journalEntries.filter((e) => e.clientUuid === clientUuid);
      if (therapistUuidParam) {
        const hs = Array.from(handshakes.values()).find(
          (h) =>
            h.clientUuid === clientUuid &&
            h.therapistUuid === therapistUuidParam &&
            h.status === "ACTIVE"
        );
        if (hs) {
          const branchRestrictionsMap: Record<string, string[]> = {};
          if (hs.branchRestrictions && String(hs.branchRestrictions).trim() !== "") {
            for (const row of String(hs.branchRestrictions).split(";")) {
              const idx = row.indexOf(":");
              if (idx > 0) {
                const b = row.slice(0, idx).trim();
                const codes = row
                  .slice(idx + 1)
                  .split(",")
                  .map((c: string) => c.trim())
                  .filter(Boolean);
                if (b) branchRestrictionsMap[b] = codes;
              } else if (row.trim()) {
                branchRestrictionsMap[row.trim()] = [];
              }
            }
          }
          const allowedSet = new Set<string>();
          if (hs.allowedBranches && String(hs.allowedBranches).trim() !== "") {
            for (const b of String(hs.allowedBranches).split(",")) {
              if (b.trim()) allowedSet.add(b.trim());
            }
          }
          for (const b of Object.keys(branchRestrictionsMap)) {
            allowedSet.add(b);
          }
          const globalRestrictions = new Set<string>(
            hs.customRestrictions
              ? String(hs.customRestrictions)
                  .split(",")
                  .map((c: string) => c.trim())
                  .filter(Boolean)
              : []
          );
          if (allowedSet.size > 0) {
            entries = entries.filter((e) => allowedSet.has(e.gitBranch || "main"));
          }
          const maskedEntries = entries.map((e) => {
            const branch = e.gitBranch || "main";
            const branchSpecific = branchRestrictionsMap[branch] || [];
            const hideMood =
              branchSpecific.includes("NO_MOOD_SCORES") ||
              (Object.keys(branchRestrictionsMap).length === 0 &&
                globalRestrictions.has("NO_MOOD_SCORES"));
            return {
              ...e,
              moodRating: hideMood ? null : e.moodRating,
            };
          });
          return sendJson(res, 200, {
            entries: maskedEntries,
            allowedBranches: Array.from(allowedSet),
            branchRestrictions: branchRestrictionsMap,
          });
        }
      }
      return sendJson(res, 200, entries);
    }

    const historyMatch = pathname.match(/^\/api\/v1\/journals\/history\/([^/]+)$/);
    if (historyMatch && method === "GET") {
      const clientUuid = historyMatch[1];
      const therapistUuidParam = url.searchParams.get("therapistUuid");
      if (auth.isTherapist) {
        if (!therapistUuidParam) {
          return sendJson(res, 200, jgitCommits);
        }
        const hs = Array.from(handshakes.values()).find(
          (h) =>
            h.clientUuid === clientUuid &&
            h.therapistUuid === therapistUuidParam &&
            h.status === "ACTIVE"
        );
        if (hs) {
          const allowedSet = new Set<string>();
          if (hs.allowedBranches && String(hs.allowedBranches).trim() !== "") {
            for (const b of String(hs.allowedBranches).split(",")) {
              if (b.trim()) allowedSet.add(b.trim());
            }
          }
          if (hs.branchRestrictions && String(hs.branchRestrictions).trim() !== "") {
            for (const row of String(hs.branchRestrictions).split(";")) {
              const idx = row.indexOf(":");
              const b = (idx > 0 ? row.slice(0, idx) : row).trim();
              if (b) allowedSet.add(b);
            }
          }
          if (allowedSet.size > 0) {
            const allowed = Array.from(allowedSet);
            const filteredByBranch = jgitCommits
              .filter((c) => allowed.includes(c.branch || "main"))
              .map((c) => ({
                ...c,
                snapshot: c.delta || c.snapshot,
              }));
            return sendJson(res, 200, filteredByBranch);
          }
        }
        return sendJson(res, 200, jgitCommits);
      }
      // Privacy filter for clients: strip confidential commits & INTERNAL_MEDICAL_NOTES
      const filtered = jgitCommits
        .filter((c) => !c.isConfidential && !String(c.delta || "").includes("INTERNAL_MEDICAL_NOTES"))
        .map((c) => ({
          ...c,
          parentSnapshot: String(c.parentSnapshot || "")
            .split("\n\n")
            .filter((block) => !block.includes("INTERNAL_MEDICAL_NOTES"))
            .join("\n\n"),
          snapshot: String(c.snapshot)
            .split("\n\n")
            .filter((block) => !block.includes("INTERNAL_MEDICAL_NOTES"))
            .join("\n\n"),
        }));
      return sendJson(res, 200, filtered);
    }

    // 11. Finance Endpoints (/api/v1/finance/*)
    if (pathname === "/api/v1/finance/subscriptions" && method === "POST") {
      const amount = Number(jsonBody.monthlyAmount || 250);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      glBalances["1100"] = (glBalances["1100"] || 0) + amount;
      glBalances["4200"] = (glBalances["4200"] || 0) + amount;
      const clientUuid = String(jsonBody.clientUuid || auth.userUuid);
      const rolesSet = userRoles.get(clientUuid) || new Set(["client"]);
      rolesSet.add("therapist");
      userRoles.set(clientUuid, rolesSet);
      return sendJson(res, 201, {
        subscriptionId: `KB-SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        initialInvoiceId: `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        clientUuid,
        planName: jsonBody.planName || "therapist-clinic-license",
        monthlyAmount: amount,
        currency,
        status: "ACTIVE",
        gitCommitHash: crypto.randomBytes(4).toString("hex"),
      });
    }

    if (pathname === "/api/v1/finance/invoices/session" && method === "POST") {
      const amount = Number(jsonBody.amount || 50);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      glBalances["1100"] = (glBalances["1100"] || 0) + amount;
      glBalances["4100"] = (glBalances["4100"] || 0) + amount;
      return sendJson(res, 201, {
        invoiceId: `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        clientUuid: jsonBody.clientUuid || auth.userUuid,
        amount,
        currency,
        status: "PAID",
        gitCommitHash: crypto.randomBytes(4).toString("hex"),
      });
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
      existing.clipUnitPrice = existing.remainingClips > 0 ? existing.balance / existing.remainingClips : 0;
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

    if (pathname === "/api/v1/finance/ledger/summary" && method === "GET") {
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
