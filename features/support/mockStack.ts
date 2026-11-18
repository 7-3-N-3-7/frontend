import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

function deterministicUuid(seed: string): string {
  const hex = crypto.createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseHhmmMinute(raw: string, isEnd: boolean): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0 && isEnd) return 1440;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const total = h * 60 + min;
  return isEnd && total === 0 ? 1440 : total;
}

function formatMinuteHhmm(m: number): string {
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function resolveMockWorkingWindows(
  workingHoursJson: string | null | undefined,
  dateStr: string
): Array<{ startMinute: number; endMinute: number }> {
  const defaultWin = [{ startMinute: 8 * 60, endMinute: 17 * 60 }];
  if (!workingHoursJson || !workingHoursJson.trim()) return defaultWin;
  const trimmed = workingHoursJson.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.days)) {
        const weekdayNames = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];
        const parts = dateStr.split("-").map(Number);
        const d =
          parts.length === 3
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(dateStr);
        const dayKey = weekdayNames[d.getDay()];
        const dayCfg = parsed.days.find(
          (x: any) => String(x?.day || "").toLowerCase() === dayKey
        );
        if (!dayCfg || !dayCfg.enabled || !Array.isArray(dayCfg.intervals)) {
          return [];
        }
        const wins: Array<{ startMinute: number; endMinute: number }> = [];
        for (const intv of dayCfg.intervals) {
          const s = parseHhmmMinute(String(intv?.start || ""), false);
          const e = parseHhmmMinute(String(intv?.end || ""), true);
          if (s !== null && e !== null && e > s) {
            wins.push({ startMinute: s, endMinute: e });
          }
        }
        return wins;
      }
    } catch {
      // Fall back to regex interval parsing
    }
  }
  const regex = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g;
  const wins: Array<{ startMinute: number; endMinute: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    const s = parseHhmmMinute(match[1], false);
    const e = parseHhmmMinute(match[2], true);
    if (s !== null && e !== null && e > s) {
      wins.push({ startMinute: s, endMinute: e });
    }
  }
  return wins.length > 0 ? wins : defaultWin;
}

function addMinutesIsoMock(isoLocal: string, minutes: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(isoLocal);
  if (!m) return isoLocal;
  const dt = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]) + minutes,
    0,
    0
  );
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:${String(
    dt.getMinutes()
  ).padStart(2, "0")}:00`;
}

function fitsMockWindows(
  windows: Array<{ startMinute: number; endMinute: number }>,
  startIso: string,
  endIso: string
): boolean {
  const sMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(startIso);
  const eMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(endIso);
  if (!sMatch || !eMatch || sMatch[1] !== eMatch[1]) return false;
  const sMin = Number(sMatch[2]) * 60 + Number(sMatch[3]);
  const eMin = Number(eMatch[2]) * 60 + Number(eMatch[3]);
  return windows.some((w) => sMin >= w.startMinute && eMin <= w.endMinute && eMin > sMin);
}

const cachedSeedI18nBundles: Record<string, Record<string, any>> = (() => {
  const seedPath = path.resolve(process.cwd(), "features", "support", "i18nSeedBundles.json");
  if (fs.existsSync(seedPath)) {
    return JSON.parse(fs.readFileSync(seedPath, "utf8"));
  }
  return {};
})();

function buildBaselineI18n(): Record<string, Record<string, any>> {
  const cloned: Record<string, Record<string, any>> = structuredClone(cachedSeedI18nBundles);
  const heroTitles: Record<string, string> = {
    da: "Reflekter, Lær, og Voks",
    en: "Reflect, Learn, and Grow",
    fr: "Réfléchissez, Apprenez et Grandissez",
    es: "Reflexiona, Aprende y Crece",
    de: "Reflektieren, Lernen und Wachsen",
  };
  const brandTitles: Record<string, string> = {
    da: "EduJournal Klinik",
    en: "EduJournal Clinic",
    fr: "EduJournal Clinique",
    es: "EduJournal Clínica",
    de: "EduJournal Klinik",
  };
  const welcomes: Record<string, string> = {
    da: "Velkommen til EduJournal",
    en: "Welcome to EduJournal",
    fr: "Bienvenue sur EduJournal",
    es: "Bienvenido a EduJournal",
    de: "Willkommen bei EduJournal",
  };
  for (const loc of ["da", "en", "fr", "es", "de"]) {
    cloned[loc] = cloned[loc] || {};
    cloned[loc].portal = {
      ...(cloned[loc].portal || {}),
      brandTitle: brandTitles[loc],
      welcome: welcomes[loc],
    };
    cloned[loc].HomePage = {
      ...(cloned[loc].HomePage || {}),
      heroTitle: heroTitles[loc],
    };
  }
  return cloned;
}

function setNestedI18nKey(dict: Record<string, any>, dottedKey: string, val: any) {
  const parts = dottedKey.split(".").filter(Boolean);
  if (parts.length === 0) return;
  if (parts.length === 1) {
    dict[parts[0]] = val;
    return;
  }
  let cur = dict;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== "object" || Array.isArray(cur[part])) {
      cur[part] = {};
    }
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = val;
}

function deleteNestedI18nKey(dict: Record<string, any>, dottedKey: string) {
  const parts = dottedKey.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur = dict;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== "object") return;
    cur = cur[part];
  }
  delete cur[parts[parts.length - 1]];
}

function buildI18nAdminMap(store: Record<string, Record<string, any>>) {
  const entries = new Map<
    string,
    {
      id: string;
      locale: string;
      namespace: string;
      translationKey: string;
      translationValue: string;
      updatedAt: string;
    }
  >();
  const walk = (loc: string, node: any, prefix: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [k, v] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(loc, v, fullKey);
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        const id = deterministicUuid(`i18n:${loc}:${fullKey}`);
        const ns = fullKey.includes(".") ? fullKey.split(".")[0] : "common";
        entries.set(id, {
          id,
          locale: loc,
          namespace: ns,
          translationKey: fullKey,
          translationValue: String(v),
          updatedAt: "2026-10-01T10:00:00Z",
        });
      }
    }
  };
  for (const [loc, dict] of Object.entries(store)) {
    walk(loc, dict, "");
  }
  return entries;
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
  const managementKpis = new Map<string, any>();
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
  const vippsAgreementsById = new Map<string, any>();
  const grantedAccessByUser = new Map<string, Set<string>>();
  const glBalances: Record<string, number> = {
    "1100": 0,
    "1200": 0,
    "2100": 0,
    "4100": 0,
    "4200": 0,
    "4300": 0,
  };

  const VIPPS_MOCK_CONFIG = {
    bundleSymbolicName: "com.platform.killbill.vipps-mobilepay-plugin",
    bundleVersion: "1.0.0",
    pluginName: "killbill-vipps-mobilepay",
    apiBaseUrl: "https://api.vipps.no",
    merchantName: "73N37",
    merchantCvr: "46688244",
    clinicPayoutIban: "DK5000400440116243",
    clinicVippsMsn: "700000",
    tiers: {
      THERAPIST_ACCESS: {
        productType: "THERAPIST_ACCESS",
        planName: "Therapist Access",
        amountDkk: 4,
        payoutIban: "DK8130000012345678",
        vippsMsn: "700101",
        glAccount: "4300",
        grantedRole: "THERAPIST",
      },
      MANAGEMENT_ACCESS: {
        productType: "MANAGEMENT_ACCESS",
        planName: "Management Access",
        amountDkk: 5,
        payoutIban: "DK9230000087654321",
        vippsMsn: "700202",
        glAccount: "4300",
        grantedRole: "ADMIN",
      },
    },
  };
  let i18nStore = buildBaselineI18n();
  let i18nAdminEntries = buildI18nAdminMap(i18nStore);

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
    managementKpis.clear();
    pcl5Tests.length = 0;
    journalEntries.length = 0;
    clinicalNotes.length = 0;
    jgitCommits.length = 0;
    savingsAccounts.clear();
    subscriptionsByClient.clear();
    invoicesById.clear();
    installmentLoans.clear();
    ledgerCommits.clear();
    vippsAgreementsById.clear();
    grantedAccessByUser.clear();
    glBalances["1100"] = 0;
    glBalances["1200"] = 0;
    glBalances["2100"] = 0;
    glBalances["4100"] = 0;
    glBalances["4200"] = 0;
    glBalances["4300"] = 0;
    i18nStore = buildBaselineI18n();
    i18nAdminEntries = buildI18nAdminMap(i18nStore);

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

    const bijensOrgId = deterministicUuid("org:73N37");
    const bijensOrg = {
      id: bijensOrgId,
      name: "73N37",
      cvrNumber: "46688244",
      address: "Bredgade 42",
      postalCode: "1260",
      phoneNumber: "+45 33 14 25 36",
      iban: "DK5000400440116243",
      currency: "DKK",
    };
    organisations.set(bijensOrgId, bijensOrg);

    const bijensProfileId = deterministicUuid("provider:bijens");
    const bijensUuid = "4c421f46-836c-4897-8dae-ba9587473273";
    providerProfiles.set(bijensUuid, {
      id: bijensProfileId,
      userUuid: bijensUuid,
      displayName: "Bo Jensen",
      fullName: "Bo Jensen",
      biography: "Autoriseret psykolog hos 73N37",
      iban: "DK5000400440116243",
      currency: "DKK",
      workingHoursJson: "09:00-17:00",
      organisationId: bijensOrgId,
      organisation: bijensOrg,
    });

    const bijensServiceId = deterministicUuid("service:bijens:individuel-terapi");
    services.set(bijensServiceId, {
      id: bijensServiceId,
      therapistUuid: bijensUuid,
      providerProfileId: bijensProfileId,
      organisationId: bijensOrgId,
      provider: {
        id: bijensProfileId,
        userUuid: bijensUuid,
        displayName: "Bo Jensen",
        organisation: bijensOrg,
      },
      organisation: bijensOrg,
      organisationName: "73N37",
      name: "Individuel Terapi",
      description: "Individuel Terapi i speciale PSYCHOLOGY",
      durationMinutes: 60,
      price: 2,
      priceDkk: 2,
      currency: "DKK",
      location: "PSYCHOLOGY",
      isActive: true,
      active: true,
    });

    const clientUuid = "5e357ca1-4913-414f-91a6-81a7de9042ab";
    clientProfiles.set(clientUuid, {
      id: deterministicUuid("client-profile:client"),
      userId: clientUuid,
      fullName: "Anders Sand",
      email: "client@mail.com",
      dateOfBirth: "1990-04-12",
      homeAddress: "Vesterbrogade 21",
      postalCode: "1620",
      phoneNumber: "+45 20 11 22 33",
    });

    const defaultKpis = [
      {
        id: deterministicUuid("kpi-session-price"),
        metricName: "Gennemsnitlig sessionspris",
        metricValue: 2,
        unit: "DKK",
        department: "Psykotraumatologi",
      },
      {
        id: deterministicUuid("kpi-capacity"),
        metricName: "Månedlig kapacitetsudnyttelse",
        metricValue: 84,
        unit: "%",
        department: "Klinikdrift",
      },
      {
        id: deterministicUuid("kpi-retention"),
        metricName: "Klientfastholdelse (3 mdr.)",
        metricValue: 92,
        unit: "%",
        department: "Kvalitet & Audit",
      },
    ];
    for (const kpi of defaultKpis) {
      managementKpis.set(kpi.id, kpi);
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

    const roleLookupMatch = url.pathname.match(/\/roles\/([^/]+)$/);
    if (roleLookupMatch && req.method === "GET") {
      const roleName = decodeURIComponent(roleLookupMatch[1]);
      return sendJson(res, 200, { id: `role-${roleName}-id`, name: roleName });
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
        try {
          const parsed = JSON.parse(body || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              if (item?.name) set.add(String(item.name).toLowerCase());
            }
          } else {
            set.add("therapist");
          }
        } catch {
          set.add("therapist");
        }
        return sendJson(res, 204, {});
      }
      if (req.method === "DELETE") {
        set.delete("therapist");
        set.delete("admin");
        return sendJson(res, 204, {});
      }
    }

    if (url.pathname.endsWith("/users")) {
      if (req.method === "GET") {
        const searchUsername = url.searchParams.get("username");
        const list = Array.from(usersByUsername.values())
          .filter((u) => !searchUsername || u.username === searchUsername)
          .map((u) => ({
            id: u.id,
            username: u.username,
            firstName: u.fullName.split(" ")[0] || u.username,
            lastName: u.fullName.split(" ").slice(1).join(" ") || "",
            email: u.email,
            enabled: true,
          }));
        return sendJson(res, 200, list);
      }
      if (req.method === "POST") {
        let parsed: any = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          parsed = {};
        }
        const uname = String(parsed.username || "").trim();
        if (!uname) {
          return sendJson(res, 400, { errorMessage: "Username is required" });
        }
        if (usersByUsername.has(uname)) {
          return sendJson(res, 409, { errorMessage: "User exists with same username" });
        }
        const id = crypto.randomUUID();
        const fullName =
          [parsed.firstName, parsed.lastName].filter(Boolean).join(" ").trim() || uname;
        usersByUsername.set(uname, {
          id,
          username: uname,
          fullName,
          email: String(parsed.email || `${uname}@example.dk`),
          role: "CLIENT",
        });
        userRoles.set(id, new Set(["client"]));
        return sendJson(
          res,
          201,
          { id, username: uname },
          { Location: `http://127.0.0.1:${keycloakPort}${url.pathname}/${id}` }
        );
      }
    }

    if (/\/users\/[^/]+\/reset-password$/.test(url.pathname) && req.method === "PUT") {
      return sendJson(res, 204, undefined);
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

    if (pathname === "/api/v1/i18n") {
      if (method === "GET") {
        return sendJson(res, 200, Array.from(i18nAdminEntries.values()));
      }
      if (method === "POST") {
        if (!auth.userUuid) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }
        if (!auth.isAdmin) {
          return sendJson(res, 403, { error: "Forbidden: admin required" });
        }
        const locale = String(jsonBody.locale || "da").trim() || "da";
        const translationKey = String(jsonBody.translationKey || "").trim();
        const translationValue = String(jsonBody.translationValue ?? "");
        const namespace =
          String(jsonBody.namespace || "").trim() ||
          (translationKey.includes(".") ? translationKey.split(".")[0] : "common");
        if (!translationKey) {
          return sendJson(res, 400, { error: "translationKey is required" });
        }
        i18nStore[locale] = i18nStore[locale] || {};
        setNestedI18nKey(i18nStore[locale], translationKey, translationValue);
        const id = deterministicUuid(`i18n:${locale}:${translationKey}`);
        const entry = {
          id,
          locale,
          namespace,
          translationKey,
          translationValue,
          updatedAt: new Date().toISOString(),
        };
        i18nAdminEntries.set(id, entry);
        return sendJson(res, 201, entry);
      }
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
        setNestedI18nKey(i18nStore[locale], key, val);
        const id = deterministicUuid(`i18n:${locale}:${key}`);
        i18nAdminEntries.set(id, {
          id,
          locale,
          namespace: key.includes(".") ? key.split(".")[0] : "common",
          translationKey: key,
          translationValue: String(val ?? ""),
          updatedAt: new Date().toISOString(),
        });
        return sendJson(res, 200, { key, value: val });
      }
      if (method === "DELETE" && parts.length === 1) {
        if (!auth.userUuid) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }
        if (!auth.isAdmin) {
          return sendJson(res, 403, { error: "Forbidden: admin required" });
        }
        const targetId = decodeURIComponent(parts[0]);
        const existing = i18nAdminEntries.get(targetId);
        if (!existing) {
          return sendJson(res, 404, { error: "Translation entry not found" });
        }
        i18nAdminEntries.delete(targetId);
        if (i18nStore[existing.locale]) {
          deleteNestedI18nKey(i18nStore[existing.locale], existing.translationKey);
          delete i18nStore[existing.locale][existing.translationKey];
        }
        return sendJson(res, 204, undefined);
      }
    }

    // Require auth for all protected routes below
    if (!auth.userUuid) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    if (pathname === "/api/v1/secure-data" && method === "GET") {
      return sendJson(res, 200, { status: "OK", userUuid: auth.userUuid });
    }

    if (pathname === "/api/v1/management/kpis") {
      if (!auth.isAdmin) {
        return sendJson(res, 403, { error: "Management or admin role is required" });
      }
      if (method === "GET") {
        return sendJson(res, 200, Array.from(managementKpis.values()));
      }
      if (method === "POST") {
        const metricName = String(jsonBody.metricName || "").trim();
        const metricValue = Number(jsonBody.metricValue || 0);
        const unit = String(jsonBody.unit || "DKK").trim() || "DKK";
        const department = String(jsonBody.department || "").trim();
        if (!metricName || !(metricValue > 0) || !department) {
          return sendJson(res, 400, { error: "Invalid KPI payload" });
        }
        const id = crypto.randomUUID();
        const created = { id, metricName, metricValue, unit, department };
        managementKpis.set(id, created);
        return sendJson(res, 201, created);
      }
    }

    const kpiIdMatch = pathname.match(/^\/api\/v1\/management\/kpis\/([^/]+)$/);
    if (kpiIdMatch) {
      if (!auth.isAdmin) {
        return sendJson(res, 403, { error: "Management or admin role is required" });
      }
      const kpiId = decodeURIComponent(kpiIdMatch[1]);
      if (!managementKpis.has(kpiId)) {
        return sendJson(res, 404, { error: "KPI not found" });
      }
      if (method === "DELETE") {
        managementKpis.delete(kpiId);
        return sendJson(res, 204, undefined);
      }
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

    // 3. Client profile endpoints & clinic clients list
    if (pathname === "/api/v1/clinic/clients") {
      if (method === "GET") {
        const merged = new Map<string, any>();
        for (const cp of clientProfiles.values()) {
          const uid = String(cp.userId || cp.id);
          merged.set(uid, cp);
        }
        for (const u of usersByUsername.values()) {
          const roles = userRoles.get(u.id) || new Set([u.role.toLowerCase()]);
          const isOnlyClient = u.role.toUpperCase() === "CLIENT" && !roles.has("therapist");
          if (isOnlyClient && !merged.has(u.id)) {
            merged.set(u.id, {
              id: deterministicUuid(`client-row:${u.id}`),
              userId: u.id,
              fullName: u.fullName,
              email: u.email,
            });
          }
        }
        return sendJson(res, 200, Array.from(merged.values()));
      }
      if (method === "POST") {
        const uid = String(jsonBody.userId || jsonBody.userUuid || crypto.randomUUID());
        const id = crypto.randomUUID();
        const saved = { id, userId: uid, ...jsonBody };
        clientProfiles.set(uid, saved);
        return sendJson(res, 201, saved);
      }
    }

    const clinicClientIdMatch = pathname.match(/^\/api\/v1\/clinic\/clients\/([^/]+)$/);
    if (clinicClientIdMatch && method === "DELETE") {
      const targetId = decodeURIComponent(clinicClientIdMatch[1]);
      for (const [k, cp] of clientProfiles.entries()) {
        if (cp.id === targetId || cp.userId === targetId || k === targetId) {
          clientProfiles.delete(k);
          return sendJson(res, 204, undefined);
        }
      }
      return sendJson(res, 404, { error: "Not found" });
    }

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
        fullName: jsonBody.displayName || existing.fullName || auth.fullName || "Bo Jensen",
        biography: jsonBody.biography || existing.biography || "",
        iban,
        currency,
        workingHoursJson:
          jsonBody.workingHoursJson !== undefined
            ? jsonBody.workingHoursJson
            : existing.workingHoursJson || "09:00-17:00",
        organisationId: orgId,
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
      const storedRoles = Array.from(userRoles.get(auth.userUuid) || []);
      const combinedRoles = Array.from(new Set([...auth.roles, ...storedRoles]));
      const effectiveIsTherapist = auth.isTherapist || combinedRoles.includes("therapist");
      const effectiveIsAdmin = auth.isAdmin || combinedRoles.includes("admin");
      const missingProfileFields: string[] = [];
      if (effectiveIsTherapist) {
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
        fullName: auth.fullName,
        email: auth.email,
        roles: combinedRoles,
        isTherapist: effectiveIsTherapist,
        isAdmin: effectiveIsAdmin,
        providerProfile: profile,
        clientProfile: clientProfiles.get(auth.userUuid) || null,
        canCreateServices: missingProfileFields.length === 0,
        missingProfileFields,
      });
    }

    if (pathname === "/api/v1/clinic/services") {
      if (method === "GET") {
        const therapistUuid = url.searchParams.get("therapistUuid");
        const activeOnly = url.searchParams.get("activeOnly") === "true";
        let list = Array.from(services.values());
        if (therapistUuid) {
          const profile = providerProfiles.get(therapistUuid);
          if (!profile) {
            return sendJson(res, 200, []);
          }
          list = list.filter((s: any) => {
            if (s.provider?.id || s.providerProfileId) {
              return (
                s.providerProfileId === profile.id ||
                s.provider?.id === profile.id ||
                s.therapistUuid === therapistUuid
              );
            }
            return profile.organisationId && s.organisationId === profile.organisationId;
          });
        }
        if (activeOnly) {
          list = list.filter((s: any) => s.active !== false && s.isActive !== false);
        }
        return sendJson(res, 200, list);
      }
      if (method === "POST") {
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
          providerProfileId: profile.id,
          organisationId: profile.organisation?.id,
          provider: {
            id: profile.id,
            userUuid: targetUuid,
            displayName: profile.displayName,
            organisation: profile.organisation,
          },
          organisation: profile.organisation,
          name: jsonBody.name,
          description: jsonBody.description,
          durationMinutes: jsonBody.durationMinutes,
          price: jsonBody.price,
          priceDkk: jsonBody.price,
          currency: jsonBody.currency || profile.currency || "DKK",
          location: jsonBody.location,
          isActive: true,
          active: true,
          organisationName: profile.organisation?.name || "Nordic Mind Clinic ApS",
        };
        services.set(id, srv);
        return sendJson(res, 201, srv);
      }
    }

    const serviceToggleMatch = pathname.match(/^\/api\/v1\/clinic\/services\/([^/]+)\/toggle$/);
    if (serviceToggleMatch && method === "PATCH") {
      const srv = services.get(serviceToggleMatch[1]);
      if (!srv) return sendJson(res, 404, { error: "Not found" });
      srv.isActive = !srv.isActive;
      srv.active = srv.isActive;
      return sendJson(res, 200, srv);
    }

    const serviceIdMatch = pathname.match(/^\/api\/v1\/clinic\/services\/([^/]+)$/);
    if (serviceIdMatch && method === "DELETE") {
      const targetId = decodeURIComponent(serviceIdMatch[1]);
      if (!services.has(targetId)) {
        return sendJson(res, 404, { error: "Not found" });
      }
      services.delete(targetId);
      return sendJson(res, 204, undefined);
    }

    if (pathname === "/api/v1/clinic/directory" && method === "GET") {
      return sendJson(res, 200, {
        providers: Array.from(providerProfiles.values()),
        services: Array.from(services.values()),
        organisations: Array.from(organisations.values()),
      });
    }

    // 5. Handshakes (/api/v1/clinic/handshakes)
    const hsClientMatch = pathname.match(/^\/api\/v1\/clinic\/handshakes\/client\/([^/]+)$/);
    if (hsClientMatch && method === "GET") {
      const targetClient = decodeURIComponent(hsClientMatch[1]);
      const list = Array.from(handshakes.values()).filter(
        (h) => h.clientUuid === targetClient || h.clientId === targetClient
      );
      return sendJson(res, 200, list);
    }

    const hsTherapistMatch = pathname.match(/^\/api\/v1\/clinic\/handshakes\/therapist\/([^/]+)$/);
    if (hsTherapistMatch && method === "GET") {
      const targetTherapist = decodeURIComponent(hsTherapistMatch[1]);
      const list = Array.from(handshakes.values()).filter(
        (h) => h.therapistUuid === targetTherapist || h.therapistId === targetTherapist
      );
      return sendJson(res, 200, list);
    }

    if (pathname === "/api/v1/clinic/handshakes") {
      if (method === "GET") {
        return sendJson(res, 200, Array.from(handshakes.values()));
      }
      if (method === "POST") {
        const reqClientUuid = String(jsonBody.clientUuid || jsonBody.clientId || auth.userUuid);
        const reqTherapistUuid = String(jsonBody.therapistUuid || jsonBody.therapistId || "");
        const existing = Array.from(handshakes.values()).find(
          (h) => h.clientUuid === reqClientUuid && h.therapistUuid === reqTherapistUuid
        );
        const provider = providerProfiles.get(reqTherapistUuid);
        const clientCp = clientProfiles.get(reqClientUuid);
        const resolvedClientName =
          jsonBody.clientName ||
          existing?.clientName ||
          clientCp?.fullName ||
          auth.fullName ||
          "Anders Sand";
        const resolvedTherapistName =
          jsonBody.therapistName ||
          existing?.therapistName ||
          provider?.displayName ||
          "Maja Lindholm";
        const resolvedOrgName =
          jsonBody.organisationName ||
          existing?.organisationName ||
          provider?.organisation?.name ||
          "Nordic Mind Clinic ApS";
        const id = existing?.id || crypto.randomUUID();
        const hs = {
          id,
          clientId: reqClientUuid,
          clientUuid: reqClientUuid,
          clientName: resolvedClientName,
          therapistId: reqTherapistUuid,
          therapistUuid: reqTherapistUuid,
          therapistName: resolvedTherapistName,
          organisationName: resolvedOrgName,
          status: jsonBody.status || existing?.status || "REQUESTED",
          sharedJournalAccess:
            jsonBody.sharedJournalAccess !== undefined
              ? Boolean(jsonBody.sharedJournalAccess)
              : existing?.sharedJournalAccess ?? true,
          historyStartDate:
            jsonBody.historyStartDate !== undefined
              ? jsonBody.historyStartDate
              : existing?.historyStartDate ?? null,
          historyEndDate:
            jsonBody.historyEndDate !== undefined
              ? jsonBody.historyEndDate
              : existing?.historyEndDate ?? null,
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
      const hs = handshakes.get(decodeURIComponent(hsStatusMatch[1]));
      if (!hs) return sendJson(res, 404, { error: "Not found" });
      if (jsonBody.status !== undefined) hs.status = jsonBody.status;
      if (jsonBody.sharedJournalAccess !== undefined) {
        hs.sharedJournalAccess = Boolean(jsonBody.sharedJournalAccess);
      }
      if (jsonBody.historyStartDate !== undefined) hs.historyStartDate = jsonBody.historyStartDate;
      if (jsonBody.historyEndDate !== undefined) hs.historyEndDate = jsonBody.historyEndDate;
      if (jsonBody.allowedBranches !== undefined) hs.allowedBranches = jsonBody.allowedBranches;
      if (jsonBody.customRestrictions !== undefined) hs.customRestrictions = jsonBody.customRestrictions;
      if (jsonBody.branchRestrictions !== undefined) hs.branchRestrictions = jsonBody.branchRestrictions;
      return sendJson(res, 200, hs);
    }

    const hsIdMatch = pathname.match(/^\/api\/v1\/clinic\/handshakes\/([^/]+)$/);
    if (hsIdMatch && method === "DELETE") {
      const hsId = decodeURIComponent(hsIdMatch[1]);
      if (!handshakes.has(hsId)) return sendJson(res, 404, { error: "Not found" });
      handshakes.delete(hsId);
      return sendJson(res, 204, undefined);
    }

    // 6. Appointments (/api/v1/appointments)
    if (pathname === "/api/v1/appointments/timefold-slots" && method === "GET") {
      const therapistUuid = url.searchParams.get("therapistUuid") || "";
      const date = url.searchParams.get("date") || "2026-11-26";
      const durationMinutes = Number(url.searchParams.get("durationMinutes") || 60);
      const preferredTime = url.searchParams.get("preferredTime") || "10:00";
      const excludeAppointmentId = url.searchParams.get("excludeAppointmentId") || "";
      const includeOutsideHours = url.searchParams.get("includeOutsideHours") === "true";
      const profile = providerProfiles.get(therapistUuid);
      const normalWindows = resolveMockWorkingWindows(profile?.workingHoursJson, date);
      const generationWindows = includeOutsideHours
        ? [{ startMinute: 7 * 60, endMinute: 21 * 60 }]
        : normalWindows;

      const existingBookings = Array.from(appointments.values()).filter(
        (a) =>
          a.therapistUuid === therapistUuid &&
          a.status !== "CANCELLED" &&
          (!excludeAppointmentId || a.id !== excludeAppointmentId)
      );

      const seenMinutes = new Set<number>();
      const startMinutes: number[] = [];
      for (const w of generationWindows) {
        for (let m = w.startMinute; m + durationMinutes <= w.endMinute; m += 30) {
          if (!seenMinutes.has(m)) {
            seenMinutes.add(m);
            startMinutes.push(m);
          }
        }
      }
      startMinutes.sort((a, b) => a - b);

      const prefMatch = /^(\d{2}):(\d{2})/.exec(preferredTime);
      const prefMin = prefMatch ? Number(prefMatch[1]) * 60 + Number(prefMatch[2]) : 10 * 60;
      const nowMs = Date.now();

      const slots = startMinutes.map((m) => {
        const hhmm = formatMinuteHhmm(m);
        const startIso = `${date}T${hhmm}:00`;
        const endIso = addMinutesIsoMock(startIso, durationMinutes);
        const overlaps = existingBookings.some(
          (a) => a.startTime < endIso && a.endTime > startIso
        );
        const inPast = new Date(startIso).getTime() < nowMs;
        const withinWorkingHours = fitsMockWindows(normalWindows, startIso, endIso);
        const available = !overlaps && !inPast && (withinWorkingHours || includeOutsideHours);
        const softScore = -Math.floor(Math.abs(m - prefMin) / 15);
        return {
          slot: hhmm,
          startTime: startIso,
          endTime: endIso,
          available,
          overlaps,
          inPast,
          withinWorkingHours,
          softScore,
          recommended: false,
        };
      });

      const availableSorted = slots
        .filter((s) => s.available)
        .sort((a, b) => b.softScore - a.softScore);
      const recommendedSlot = availableSorted[0]?.slot ?? null;
      for (const s of slots) {
        s.recommended = Boolean(recommendedSlot && s.slot === recommendedSlot);
      }

      return sendJson(res, 200, {
        solver: "Timefold Solver 1.16.0",
        therapistUuid,
        date,
        durationMinutes,
        workingHoursWindow:
          normalWindows.length === 0
            ? "Lukket"
            : normalWindows.map((w) => `${formatMinuteHhmm(w.startMinute)}-${formatMinuteHhmm(w.endMinute)}`).join(", "),
        closed: normalWindows.length === 0 && !includeOutsideHours,
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
          jsonBody.clientUuid &&
          jsonBody.therapistUuid &&
          jsonBody.clientUuid === jsonBody.therapistUuid
        ) {
          return sendJson(res, 400, {
            error: "A therapist cannot book themselves as their own therapist",
            message: "A therapist cannot book themselves as their own therapist",
          });
        }
        const selectedSrv = jsonBody.serviceId ? services.get(jsonBody.serviceId) : null;
        const resolvedEnd =
          jsonBody.endTime ||
          (jsonBody.startTime
            ? addMinutesIsoMock(jsonBody.startTime, Number(selectedSrv?.durationMinutes || 60))
            : null);
        if (
          jsonBody.startTime &&
          resolvedEnd &&
          new Date(resolvedEnd).getTime() <= new Date(jsonBody.startTime).getTime()
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
            a.startTime < resolvedEnd &&
            a.endTime > jsonBody.startTime
        );
        if (conflict) {
          return sendJson(res, 409, {
            error: "Timefold AI rejected booking: Therapist is already booked during the requested slot",
            message: "Timefold AI rejected booking: Therapist is already booked during the requested slot",
          });
        }
        if (
          jsonBody.therapistUuid &&
          auth.userUuid &&
          auth.userUuid !== jsonBody.therapistUuid &&
          jsonBody.startTime &&
          resolvedEnd
        ) {
          const prof = providerProfiles.get(jsonBody.therapistUuid);
          if (prof?.workingHoursJson && String(prof.workingHoursJson).trim()) {
            const wins = resolveMockWorkingWindows(
              prof.workingHoursJson,
              String(jsonBody.startTime).slice(0, 10)
            );
            if (!fitsMockWindows(wins, jsonBody.startTime, resolvedEnd)) {
              return sendJson(res, 409, {
                error: "Timefold AI rejected booking: Requested time is outside the therapist's available working hours",
                message: "Timefold AI rejected booking: Requested time is outside the therapist's available working hours",
              });
            }
          }
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
          endTime: resolvedEnd,
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
          fullHash: existing.gitCommitHash || "abc1234",
          author: existing.clientName || "System",
          timestamp: existing.startTime || "2026-11-20T10:00:00",
          message: `Appointment ${existing.status}`,
          snapshot: `${existing.title || "Terapisamtale"} (${existing.status})`,
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
        const srv = existing.serviceId ? services.get(existing.serviceId) : null;
        const resolvedEnd =
          jsonBody.endTime ||
          (jsonBody.startTime
            ? addMinutesIsoMock(jsonBody.startTime, Number(srv?.durationMinutes || 60))
            : existing.endTime);
        const conflict = Array.from(appointments.values()).some(
          (a) =>
            a.id !== aptId &&
            a.status !== "CANCELLED" &&
            a.therapistUuid === existing.therapistUuid &&
            a.startTime < resolvedEnd &&
            a.endTime > jsonBody.startTime
        );
        if (conflict) {
          return sendJson(res, 409, {
            error: "Timefold AI rejected booking: Therapist is already booked during the requested slot",
            message: "Timefold AI rejected booking: Therapist is already booked during the requested slot",
          });
        }
        if (
          existing.therapistUuid &&
          auth.userUuid &&
          auth.userUuid !== existing.therapistUuid &&
          jsonBody.startTime &&
          resolvedEnd
        ) {
          const prof = providerProfiles.get(existing.therapistUuid);
          if (prof?.workingHoursJson && String(prof.workingHoursJson).trim()) {
            const wins = resolveMockWorkingWindows(
              prof.workingHoursJson,
              String(jsonBody.startTime).slice(0, 10)
            );
            if (!fitsMockWindows(wins, jsonBody.startTime, resolvedEnd)) {
              return sendJson(res, 409, {
                error: "Timefold AI rejected booking: Requested time is outside the therapist's available working hours",
                message: "Timefold AI rejected booking: Requested time is outside the therapist's available working hours",
              });
            }
          }
        }
        existing.startTime = jsonBody.startTime;
        existing.endTime = resolvedEnd;
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
        providers: Array.from(providerProfiles.values()).filter(
          (p: any) => !p.userUuid || p.userUuid !== clientUuid
        ),
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
    if (pathname === "/api/v1/psychotraumatology/tests") {
      if (method === "GET") {
        const list =
          auth.isTherapist || auth.isAdmin
            ? pcl5Tests
            : pcl5Tests.filter((t) => t.clientUuid === auth.userUuid);
        return sendJson(res, 200, list);
      }
      if (method === "POST") {
        const testEntry = {
          id: crypto.randomUUID(),
          ...jsonBody,
          createdAt: new Date().toISOString(),
        };
        pcl5Tests.push(testEntry);
        return sendJson(res, 200, testEntry);
      }
    }

    const pclIdMatch = pathname.match(/^\/api\/v1\/psychotraumatology\/tests\/([^/]+)$/);
    if (pclIdMatch && method === "DELETE") {
      const targetId = decodeURIComponent(pclIdMatch[1]);
      const idx = pcl5Tests.findIndex((t) => t.id === targetId);
      if (idx === -1) return sendJson(res, 404, { error: "Not found" });
      pcl5Tests.splice(idx, 1);
      return sendJson(res, 204, undefined);
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
    if (pathname === "/api/v1/journals") {
      if (method === "GET") {
        const list =
          auth.isTherapist || auth.isAdmin
            ? journalEntries
            : journalEntries.filter((e) => e.clientUuid === auth.userUuid);
        return sendJson(res, 200, list);
      }
      if (method === "POST") {
        const branch = jsonBody.gitBranch || "main";
        const effectiveClientUuid = String(jsonBody.clientUuid || jsonBody.userId || auth.userUuid);
        const shared =
          jsonBody.sharedWithTherapists ?? jsonBody.sharedWithTherapist ?? true;
        const commit = addJGitCommit({
          clientUuid: effectiveClientUuid,
          author: auth.fullName || auth.username,
          message: jsonBody.title || "Journalopslag",
          isConfidential: false,
          addedLine: jsonBody.content || jsonBody.title || "Journalopslag",
          mood: jsonBody.moodRating ?? 7,
          branch,
        });
        const entry = {
          id: crypto.randomUUID(),
          userId: jsonBody.userId || effectiveClientUuid,
          clientUuid: effectiveClientUuid,
          title: jsonBody.title,
          content: jsonBody.content,
          moodRating: jsonBody.moodRating ?? 7,
          sharedWithTherapist: Boolean(shared),
          sharedWithTherapists: Boolean(shared),
          sharedTherapistUuids: Array.isArray(jsonBody.sharedTherapistUuids)
            ? jsonBody.sharedTherapistUuids
            : [],
          gitBranch: branch,
          createdAt: commit.timestamp,
          timestamp: commit.timestamp,
          commitHash: commit.commitHash,
          gitCommitHash: commit.commitHash,
        };
        journalEntries.unshift(entry);
        return sendJson(res, 200, entry);
      }
    }

    const journalIdMatch = pathname.match(/^\/api\/v1\/journals\/([^/]+)$/);
    if (journalIdMatch && method === "DELETE") {
      const targetId = decodeURIComponent(journalIdMatch[1]);
      const idx = journalEntries.findIndex((e) => e.id === targetId);
      if (idx === -1) return sendJson(res, 404, { error: "Not found" });
      journalEntries.splice(idx, 1);
      return sendJson(res, 204, undefined);
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
    if (pathname === "/api/v1/finance") {
      if (method === "GET") {
        const list =
          auth.isTherapist || auth.isAdmin
            ? Array.from(invoicesById.values())
            : Array.from(invoicesById.values()).filter((i) => i.clientUuid === auth.userUuid);
        return sendJson(res, 200, list);
      }
      if (method === "POST") {
        const amount = Number(jsonBody.amount ?? jsonBody.amountGrossDkk ?? 2);
        const currency = String(jsonBody.currency || "DKK").toUpperCase();
        const invoiceId = `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const gitCommitHash = crypto.randomBytes(4).toString("hex");
        const clientUuid = String(jsonBody.clientUuid || auth.userUuid);
        const invoice = {
          id: invoiceId,
          invoiceId,
          clientUuid,
          description: String(jsonBody.description || "Klinikydelse"),
          amount,
          amountNetDkk: amount,
          amountGrossDkk: amount,
          currency,
          status: String(jsonBody.status || "PAID"),
          gitCommitHash,
          createdAt: new Date().toISOString(),
        };
        invoicesById.set(invoiceId, invoice);
        ledgerCommits.set(gitCommitHash, {
          commitHash: gitCommitHash,
          shortHash: gitCommitHash.slice(0, 7),
          invoiceId,
          clientUuid,
          amount,
          currency,
          message: `Invoice ${invoiceId} (${amount} ${currency})`,
          authorName: auth.fullName || auth.username,
          voucher: `PAID ${amount} ${currency}`,
        });
        glBalances["1100"] = (glBalances["1100"] || 0) + amount;
        glBalances["4100"] = (glBalances["4100"] || 0) + amount;
        return sendJson(res, 201, invoice);
      }
    }

    const financeIdMatch = pathname.match(/^\/api\/v1\/finance\/([^/]+)$/);
    if (financeIdMatch && method === "DELETE") {
      const targetId = decodeURIComponent(financeIdMatch[1]);
      if (!invoicesById.has(targetId)) {
        return sendJson(res, 404, { error: "Invoice not found" });
      }
      invoicesById.delete(targetId);
      return sendJson(res, 204, undefined);
    }

    if (pathname === "/api/v1/finance/invoices/session" && method === "POST") {
      const amount = Number(jsonBody.amount || 50);
      const currency = String(jsonBody.currency || "DKK").toUpperCase();
      const invoiceId = `KB-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const gitCommitHash = crypto.randomBytes(4).toString("hex");
      const invoice = {
        id: invoiceId,
        invoiceId,
        clientUuid: jsonBody.clientUuid || auth.userUuid,
        description: String(jsonBody.description || "Terapisession"),
        amount,
        amountNetDkk: amount,
        amountGrossDkk: amount,
        currency,
        status: "PAID",
        gitCommitHash,
        createdAt: new Date().toISOString(),
      };
      invoicesById.set(invoiceId, invoice);
      ledgerCommits.set(gitCommitHash, {
        commitHash: gitCommitHash,
        shortHash: gitCommitHash.slice(0, 7),
        invoiceId,
        clientUuid: invoice.clientUuid,
        amount,
        currency,
        message: `PAID ${amount} ${currency}`,
        authorName: auth.fullName || auth.username,
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
      const amount = Number(jsonBody.monthlyAmount || 3);
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
        savingsAccountId: `FIN-SAV-${targetUuid.slice(0, 8).toUpperCase()}`,
        balance: 0,
        remainingClips: 0,
        clipUnitPrice: 0,
        currency: "DKK",
      };
      const plans = Array.from(installmentLoans.values()).filter((l) => l.clientUuid === targetUuid);
      const clientInvoices = Array.from(invoicesById.values()).filter(
        (inv) => inv.clientUuid === targetUuid
      );
      return sendJson(res, 200, {
        clientUuid: targetUuid,
        invoices: clientInvoices,
        prepaidSavings: savings,
        subscriptions: subscriptionsByClient.get(targetUuid) || [],
        installmentPlans: plans,
        vippsConfig: {
          ...VIPPS_MOCK_CONFIG,
          grantedRoles: Array.from(grantedAccessByUser.get(auth.userUuid) || []),
        },
        vippsAgreements: Array.from(vippsAgreementsById.values()).filter(
          (a) => a.clientUuid === targetUuid
        ),
        gitHistory: Array.from(ledgerCommits.values()).filter(
          (c) => !c.clientUuid || c.clientUuid === targetUuid
        ),
      });
    }

    if (pathname === "/api/v1/finance/vipps/config" && method === "GET") {
      return sendJson(res, 200, {
        ...VIPPS_MOCK_CONFIG,
        grantedRoles: Array.from(grantedAccessByUser.get(auth.userUuid) || []),
      });
    }

    if (pathname === "/api/v1/finance/vipps/checkout" && method === "POST") {
      if (!auth.userUuid) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const targetClientUuid = String(jsonBody.clientUuid || auth.userUuid);
      const productType = String(jsonBody.productType || "SUBSCRIPTION").toUpperCase();
      const paymentMethod = String(jsonBody.paymentMethod || "MOBILEPAY").toUpperCase();
      if (paymentMethod === "CREDIT_CARD" && (!jsonBody.cardToken || !jsonBody.cardLast4)) {
        return sendJson(res, 400, { error: "Tokenized credit card metadata is required" });
      }
      const maskedInstrument =
        paymentMethod === "MOBILEPAY"
          ? `MobilePay ${String(jsonBody.phoneNumber || "+4520123456")}`
          : `${String(jsonBody.cardBrand || "VISA")} •••• ${String(jsonBody.cardLast4 || "4242")}`;

      let amountDkk = Number(jsonBody.amount || 0);
      let planName = String(jsonBody.planName || productType);
      let payoutIban = VIPPS_MOCK_CONFIG.clinicPayoutIban;
      let vippsMsn = VIPPS_MOCK_CONFIG.clinicVippsMsn;
      let glCredit = "4200";
      let grantedRole: string | null = null;
      let keycloakRealmRole: string | null = null;
      let isRecurring = false;

      if (productType === "THERAPIST_ACCESS") {
        const tier = VIPPS_MOCK_CONFIG.tiers.THERAPIST_ACCESS;
        amountDkk = tier.amountDkk;
        planName = String(jsonBody.planName || tier.planName);
        payoutIban = tier.payoutIban;
        vippsMsn = tier.vippsMsn;
        glCredit = tier.glAccount;
        grantedRole = "THERAPIST";
        keycloakRealmRole = "therapist";
        isRecurring = true;
      } else if (productType === "MANAGEMENT_ACCESS") {
        const tier = VIPPS_MOCK_CONFIG.tiers.MANAGEMENT_ACCESS;
        amountDkk = tier.amountDkk;
        planName = String(jsonBody.planName || tier.planName);
        payoutIban = tier.payoutIban;
        vippsMsn = tier.vippsMsn;
        glCredit = tier.glAccount;
        grantedRole = "ADMIN";
        keycloakRealmRole = "admin";
        isRecurring = true;
      } else if (productType === "SESSION_INVOICE") {
        amountDkk = amountDkk > 0 ? amountDkk : 2;
        glCredit = "4100";
      } else if (productType === "CLIP_CARD") {
        amountDkk = amountDkk > 0 ? amountDkk : 3;
        glCredit = "2100";
        const clips = Number(jsonBody.clips || 5);
        const existingSavings = savingsAccounts.get(targetClientUuid) || {
          savingsAccountId: `sav-${targetClientUuid.slice(0, 8)}`,
          balance: 0,
          remainingClips: 0,
          currency: "DKK",
        };
        existingSavings.balance = Number(existingSavings.balance || 0) + amountDkk;
        existingSavings.remainingClips = Number(existingSavings.remainingClips || 0) + clips;
        existingSavings.clipUnitPrice =
          existingSavings.remainingClips > 0
            ? existingSavings.balance / existingSavings.remainingClips
            : 0;
        savingsAccounts.set(targetClientUuid, existingSavings);
      } else {
        amountDkk = amountDkk > 0 ? amountDkk : 3;
        glCredit = "4200";
        isRecurring = true;
      }

      glBalances["1100"] = (glBalances["1100"] || 0) + amountDkk;
      glBalances[glCredit] = (glBalances[glCredit] || 0) + amountDkk;

      if (grantedRole) {
        if (!userRoles.has(targetClientUuid)) {
          userRoles.set(targetClientUuid, new Set(["client"]));
        }
        userRoles.get(targetClientUuid)!.add(keycloakRealmRole!);
        if (!grantedAccessByUser.has(targetClientUuid)) {
          grantedAccessByUser.set(targetClientUuid, new Set());
        }
        grantedAccessByUser.get(targetClientUuid)!.add(productType);
      }

      const invoiceId = `inv-${crypto.randomUUID().slice(0, 8)}`;
      const gitCommitHash = crypto.randomBytes(4).toString("hex");
      const vippsReferenceId = `vipps-ref-${crypto.randomUUID().slice(0, 8)}`;
      const agreementId = isRecurring ? `agr-${crypto.randomUUID().slice(0, 8)}` : null;

      if (agreementId) {
        vippsAgreementsById.set(agreementId, {
          agreementId,
          clientUuid: targetClientUuid,
          productType,
          planName,
          amountDkk,
          currency: "DKK",
          paymentMethod,
          maskedInstrument,
          payoutIban,
          vippsMsn,
          glAccount: glCredit,
          grantedRole,
          status: "ACTIVE",
          chargeCount: 1,
          gitCommitHash,
        });
      }

      const commitSnapshot = {
        commitHash: gitCommitHash,
        shortHash: gitCommitHash.slice(0, 7),
        invoiceId,
        clientUuid: targetClientUuid,
        productType,
        amountDkk,
        payoutIban,
        vippsMsn,
        message: `Vipps OSGi ${productType} (${amountDkk} DKK) -> ${payoutIban}`,
        authorName: auth.fullName || auth.username,
      };
      invoicesById.set(invoiceId, {
        id: invoiceId,
        invoiceId,
        clientUuid: targetClientUuid,
        description: planName,
        amount: amountDkk,
        amountNetDkk: amountDkk,
        amountGrossDkk: amountDkk,
        currency: "DKK",
        status: isRecurring ? "ACTIVE" : "PAID",
        gitCommitHash,
        createdAt: new Date().toISOString(),
      });
      ledgerCommits.set(gitCommitHash, commitSnapshot);
      addJGitCommit({
        clientUuid: targetClientUuid,
        author: auth.fullName || auth.username,
        message: commitSnapshot.message,
        isConfidential: false,
        addedLine: commitSnapshot.message,
      });

      return sendJson(res, 201, {
        status: isRecurring ? "ACTIVE" : "CAPTURED",
        productType,
        planName,
        amountDkk,
        currency: "DKK",
        paymentMethod,
        maskedInstrument,
        payoutIban,
        vippsMsn,
        grantedRole,
        keycloakRealmRole,
        agreementId,
        invoiceId,
        vippsReferenceId,
        gitCommitHash,
      });
    }

    const vippsChargeMatch = pathname.match(/^\/api\/v1\/finance\/vipps\/agreements\/([^/]+)\/charge$/);
    if (vippsChargeMatch && method === "POST") {
      if (!auth.userUuid) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const agreement = vippsAgreementsById.get(decodeURIComponent(vippsChargeMatch[1]));
      if (!agreement) {
        return sendJson(res, 404, { error: "Vipps agreement not found" });
      }
      if (agreement.status !== "ACTIVE") {
        return sendJson(res, 400, { error: "Vipps agreement is not active" });
      }
      glBalances["1100"] = (glBalances["1100"] || 0) + Number(agreement.amountDkk);
      glBalances[agreement.glAccount] = (glBalances[agreement.glAccount] || 0) + Number(agreement.amountDkk);
      agreement.chargeCount = Number(agreement.chargeCount || 1) + 1;
      agreement.gitCommitHash = crypto.randomBytes(4).toString("hex");
      return sendJson(res, 200, agreement);
    }

    const vippsCancelMatch = pathname.match(/^\/api\/v1\/finance\/vipps\/agreements\/([^/]+)\/cancel$/);
    if (vippsCancelMatch && method === "POST") {
      if (!auth.userUuid) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      const agreement = vippsAgreementsById.get(decodeURIComponent(vippsCancelMatch[1]));
      if (!agreement) {
        return sendJson(res, 404, { error: "Vipps agreement not found" });
      }
      agreement.status = "STOPPED";
      agreement.gitCommitHash = crypto.randomBytes(4).toString("hex");
      return sendJson(res, 200, agreement);
    }

    if (pathname === "/api/v1/finance/ledger/summary" && method === "GET") {
      const dynamicRoles = Array.from(userRoles.get(auth.userUuid) || []);
      const dynamicAccess = grantedAccessByUser.get(auth.userUuid);
      const hasFinanceAccess =
        auth.isTherapist ||
        auth.isAdmin ||
        dynamicRoles.includes("therapist") ||
        dynamicRoles.includes("admin") ||
        Boolean(dynamicAccess?.has("THERAPIST_ACCESS") || dynamicAccess?.has("MANAGEMENT_ACCESS"));
      if (!hasFinanceAccess) {
        return sendJson(res, 403, { error: "Forbidden: requires therapist or admin role" });
      }
      const glNames: Record<string, { name: string; type: string }> = {
        "1100": { name: "Bank / Vipps Liquidity", type: "ASSET" },
        "1200": { name: "Patient Installment Receivables", type: "ASSET" },
        "2100": { name: "Deferred Prepaid Liability", type: "LIABILITY" },
        "4100": { name: "Session Revenue", type: "REVENUE" },
        "4200": { name: "Subscription Revenue", type: "REVENUE" },
        "4300": { name: "Platform License Revenue", type: "REVENUE" },
      };
      return sendJson(res, 200, {
        chartOfAccounts: Object.entries(glBalances).map(([glCode, balance]) => ({
          code: glCode,
          glCode,
          name: glNames[glCode]?.name || `Account ${glCode}`,
          type: glNames[glCode]?.type || "REVENUE",
          balance,
        })),
        vippsConfig: {
          ...VIPPS_MOCK_CONFIG,
          grantedRoles: Array.from(dynamicAccess || []),
        },
        vippsAgreements: Array.from(vippsAgreementsById.values()),
        gitHistory: Array.from(ledgerCommits.values()),
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
      keycloakServer.closeAllConnections?.();
      backendServer.closeAllConnections?.();
      await new Promise<void>((resolve) => keycloakServer.close(() => resolve()));
      await new Promise<void>((resolve) => backendServer.close(() => resolve()));
    },
  };
}
