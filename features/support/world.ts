import {
  setWorldConstructor,
  World,
  type IWorldOptions,
  BeforeAll,
  AfterAll,
  Before,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  given,
  type KeycloakTestIdentity,
  RestAssuredRequestSpecification,
  RestAssuredResponse,
} from "./restAssured.ts";

setDefaultTimeout(60000);

// Load .env.local so Keycloak and NextAuth env vars are available in Node
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

export const baseTestUrl = process.env.BDD_FRONTEND_URL || "http://localhost:3000";
export const backendDirectUrl =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";
export const TEST_PASSWORD = process.env.BDD_TEST_PASSWORD || "TestPass123!";

let sharedBrowser: Browser | null = null;
const keycloakUsernameByUuid = new Map<string, string>([
  ["4c421f46-836c-4897-8dae-ba9587473273", "bijens"],
  ["5e357ca1-4913-414f-91a6-81a7de9042ab", "client"],
  ["f951db57-01ab-4693-bed4-17d03f0870f1", "client2"],
  ["3229b65b-0e95-4dc6-8336-ac7a5a56edc1", "test"],
]);

async function getKeycloakAdminContext(): Promise<{
  baseUrl: string;
  realm: string;
  headers: Record<string, string>;
} | null> {
  const issuerUrl =
    process.env.KEYCLOAK_ISSUER ||
    "https://login.157.180.43.151.nip.io/realms/EduJournal";
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || "platform-admin";
  const clientSecret =
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ||
    "Eksf3Rd4uJtV1oW9eOrolcrvI3i4fxcg";

  if (!issuerUrl.includes("/realms/")) return null;
  const [baseUrl, realm] = issuerUrl.split("/realms/");
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(`${issuerUrl}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!tokenRes.ok) return null;
  const tokenData: any = await tokenRes.json();
  if (!tokenData.access_token) return null;

  return {
    baseUrl,
    realm,
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

export async function fetchKeycloakUserRoles(userUuid: string): Promise<string[]> {
  const ctx = await getKeycloakAdminContext();
  if (!ctx) return ["client"];
  const res = await fetch(
    `${ctx.baseUrl}/admin/realms/${ctx.realm}/users/${encodeURIComponent(
      userUuid
    )}/role-mappings/realm`,
    { headers: ctx.headers }
  );
  if (!res.ok) return ["client"];
  const roles: any[] = await res.json();
  const names = roles.map((r) => String(r.name)).filter(Boolean);
  if (!names.includes("client")) {
    names.push("client");
  }
  return names;
}

export async function setKeycloakUserTherapistRole(
  userUuid: string,
  shouldHaveTherapistRole: boolean
): Promise<void> {
  const ctx = await getKeycloakAdminContext();
  if (!ctx) return;

  const roleRes = await fetch(
    `${ctx.baseUrl}/admin/realms/${ctx.realm}/roles/therapist`,
    { headers: ctx.headers }
  );
  if (!roleRes.ok) return;
  const roleRep: any = await roleRes.json();

  await fetch(
    `${ctx.baseUrl}/admin/realms/${ctx.realm}/users/${encodeURIComponent(
      userUuid
    )}/role-mappings/realm`,
    {
      method: shouldHaveTherapistRole ? "POST" : "DELETE",
      headers: ctx.headers,
      body: JSON.stringify([{ id: roleRep.id, name: roleRep.name }]),
    }
  );
}

async function provisionKeycloakUsers(): Promise<void> {
  const ctx = await getKeycloakAdminContext();
  if (!ctx) return;

  const usersToEnsure = [
    {
      id: "4c421f46-836c-4897-8dae-ba9587473273",
      username: "bijens",
      email: "bjens@mail.com",
      firstName: "Bo",
      lastName: "Jensen",
      therapist: true,
    },
    {
      id: "5e357ca1-4913-414f-91a6-81a7de9042ab",
      username: "client",
      email: "client@mail.com",
      firstName: "Anders",
      lastName: "Sand",
      therapist: false,
    },
    {
      id: "f951db57-01ab-4693-bed4-17d03f0870f1",
      username: "client2",
      email: "client2@mail.com",
      firstName: "Sofie",
      lastName: "Holm",
      therapist: false,
    },
    {
      id: "3229b65b-0e95-4dc6-8336-ac7a5a56edc1",
      username: "test",
      email: "test@mail.com",
      firstName: "Test",
      lastName: "Bruger",
      therapist: false,
    },
  ];

  for (const u of usersToEnsure) {
    // Ensure user is enabled, emailVerified, and has no requiredActions blocking direct ROPC login
    await fetch(
      `${ctx.baseUrl}/admin/realms/${ctx.realm}/users/${encodeURIComponent(u.id)}`,
      {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({
          id: u.id,
          username: u.username,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          enabled: true,
          emailVerified: true,
          requiredActions: [],
        }),
      }
    );

    // Reset password to deterministic TEST_PASSWORD
    await fetch(
      `${ctx.baseUrl}/admin/realms/${ctx.realm}/users/${encodeURIComponent(
        u.id
      )}/reset-password`,
      {
        method: "PUT",
        headers: ctx.headers,
        body: JSON.stringify({
          type: "password",
          value: TEST_PASSWORD,
          temporary: false,
        }),
      }
    );

    await setKeycloakUserTherapistRole(u.id, u.therapist);
  }
}

export async function ensureBackendBaselineSeed(): Promise<void> {
  const therapistHeaders = {
    "Content-Type": "application/json",
    "X-Auth-User-Uuid": "4c421f46-836c-4897-8dae-ba9587473273",
    "X-Auth-Username": "bijens",
    "X-Auth-Full-Name": "Bo Jensen",
    "X-Auth-Email": "bjens@mail.com",
    "X-Auth-Roles": "client,therapist,admin",
  };

  // 1. Ensure Therapist ProviderProfile & Organisation exist in PostgreSQL
  await fetch(`${backendDirectUrl}/api/v1/clinic/therapist-onboarding`, {
    method: "POST",
    headers: therapistHeaders,
    body: JSON.stringify({
      userUuid: "4c421f46-836c-4897-8dae-ba9587473273",
      cvrNumber: "39485712",
      organisationName: "Nordic Mind Clinic ApS",
      displayName: "Bo Jensen",
      biography: "Autoriseret psykolog med speciale i EMDR og traumeterapi.",
    }),
  });

  // 2. Ensure ClientProfile for Anders Sand exists in PostgreSQL
  await fetch(`${backendDirectUrl}/api/v1/public/client-profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "5e357ca1-4913-414f-91a6-81a7de9042ab",
      fullName: "Anders Sand",
      email: "client@mail.com",
      phoneNumber: "+45 20 30 40 50",
      dateOfBirth: "1992-05-14",
      homeAddress: "Nørrebrogade 42",
      postalCode: "2200",
    }),
  });

  // 3. Ensure active Handshake between Anders Sand and Bo Jensen
  await fetch(`${backendDirectUrl}/api/v1/clinic/handshakes`, {
    method: "POST",
    headers: therapistHeaders,
    body: JSON.stringify({
      clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
      clientName: "Anders Sand",
      therapistUuid: "4c421f46-836c-4897-8dae-ba9587473273",
      therapistName: "Bo Jensen",
      organisationName: "Nordic Mind Clinic ApS",
      status: "ACTIVE",
    }),
  });

  // 4. Clean up non-seed appointments on 2026-10-14, 2026-10-15, and 2026-10-22, and ensure exactly 2 appointments on 2026-10-14
  const ovRes = await fetch(
    `${backendDirectUrl}/api/v1/clinic/therapist/4c421f46-836c-4897-8dae-ba9587473273/overview`,
    { headers: therapistHeaders }
  );
  if (ovRes.ok) {
    const ovData: any = await ovRes.json();
    const existingApts: any[] = Array.isArray(ovData.appointments)
      ? ovData.appointments
      : [];
    for (const apt of existingApts) {
      if (apt.status === "CANCELLED") continue;
      const d = String(apt.startTime || "").slice(0, 10);
      if (d === "2026-10-14" || d === "2026-10-15" || d === "2026-10-22") {
        await fetch(`${backendDirectUrl}/api/v1/appointments/${apt.id}`, {
          method: "DELETE",
          headers: therapistHeaders,
        });
      }
    }
  }

  // Create the 2 deterministic appointments on 2026-10-14 for Bo Jensen & Anders Sand
  await fetch(`${backendDirectUrl}/api/v1/appointments`, {
    method: "POST",
    headers: therapistHeaders,
    body: JSON.stringify({
      clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
      therapistUuid: "4c421f46-836c-4897-8dae-ba9587473273",
      title: "Individuel Terapisamtale",
      startTime: "2026-10-14T10:00:00",
      endTime: "2026-10-14T11:00:00",
      status: "SCHEDULED",
    }),
  });
  await fetch(`${backendDirectUrl}/api/v1/appointments`, {
    method: "POST",
    headers: therapistHeaders,
    body: JSON.stringify({
      clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
      therapistUuid: "4c421f46-836c-4897-8dae-ba9587473273",
      title: "Opfølgende Samtale",
      startTime: "2026-10-14T14:00:00",
      endTime: "2026-10-14T15:00:00",
      status: "SCHEDULED",
    }),
  });

  // 5. Ensure at least 1 shared journal entry and 1 confidential clinical note exist in JGit & PostgreSQL for Anders Sand
  const histRes = await fetch(
    `${backendDirectUrl}/api/v1/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab`,
    { headers: therapistHeaders }
  );
  const histList: any[] = histRes.ok ? await histRes.json() : [];
  const hasShared = histList.some((c) => !String(c.snapshot || "").includes("INTERNAL_MEDICAL_NOTES") || String(c.snapshot || "").includes("Uge 41 Refleksion"));
  const hasConfidential = histList.some((c) =>
    String(c.snapshot || "").includes("INTERNAL_MEDICAL_NOTES")
  );

  if (!hasShared) {
    await fetch(`${backendDirectUrl}/api/v1/journals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-User-Uuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "X-Auth-Username": "client",
        "X-Auth-Full-Name": "Anders Sand",
        "X-Auth-Roles": "client",
      },
      body: JSON.stringify({
        clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
        title: "Uge 41 Refleksion",
        content: "Jeg har sovet bedre i denne uge.",
        moodRating: 7,
        sharedWithTherapists: true,
      }),
    });
  }

  if (!hasConfidential) {
    await fetch(`${backendDirectUrl}/api/v1/journals/therapist-notes`, {
      method: "POST",
      headers: therapistHeaders,
      body: JSON.stringify({
        clientUuid: "5e357ca1-4913-414f-91a6-81a7de9042ab",
        therapistNote: "Patient responderer positivt på kognitiv omstrukturering.",
        therapistName: "Bo Jensen",
        organisationName: "Nordic Mind Clinic ApS",
      }),
    });
  }

  // 6. Ensure MongoDB i18n portal keys exist for da, en, fr, es, de
  const i18nPortalSeeds: Record<string, Record<string, string>> = {
    da: {
      "portal.tabCalendar": "Månedskalender & Dagsprogram",
      "portal.appointmentsCountBadge": "{count} aftaler",
      "portal.singleAppointmentBadge": "1 aftale",
    },
    en: {
      "portal.tabCalendar": "Monthly Calendar & Daily Schedule",
      "portal.appointmentsCountBadge": "{count} appointments",
      "portal.singleAppointmentBadge": "1 appointment",
    },
    fr: {
      "portal.tabCalendar": "Calendrier Mensuel & Programme",
      "portal.appointmentsCountBadge": "{count} rdv",
      "portal.singleAppointmentBadge": "1 rdv",
    },
    es: {
      "portal.tabCalendar": "Calendario Mensual y Agenda",
      "portal.appointmentsCountBadge": "{count} citas",
      "portal.singleAppointmentBadge": "1 cita",
    },
    de: {
      "portal.tabCalendar": "Monatskalender & Tagesplan",
      "portal.appointmentsCountBadge": "{count} Termine",
      "portal.singleAppointmentBadge": "1 Termin",
    },
  };

  for (const [loc, entries] of Object.entries(i18nPortalSeeds)) {
    const checkRes = await fetch(`${backendDirectUrl}/api/v1/i18n/${loc}`);
    const checkJson: any = checkRes.ok ? await checkRes.json() : {};
    if (checkJson?.portal?.tabCalendar !== entries["portal.tabCalendar"]) {
      for (const [key, value] of Object.entries(entries)) {
        await fetch(
          `${backendDirectUrl}/api/v1/i18n/${loc}/${encodeURIComponent(key)}`,
          {
            method: "PUT",
            headers: therapistHeaders,
            body: JSON.stringify({ value }),
          }
        );
      }
    }
  }
}

let spawnedNextProcess: any = null;

async function launchPlaywrightBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    try {
      return await chromium.launch({
        executablePath:
          "/home/work/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
        headless: true,
      });
    } catch {
      return await chromium.launch({
        executablePath:
          "/home/work/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
        headless: true,
      });
    }
  }
}

async function ensureFrontendServerRunning(): Promise<void> {
  const checkListening = async () => {
    try {
      const res = await fetch(`${baseTestUrl}/api/backend/i18n/da`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await checkListening()) {
    return;
  }

  const { spawn } = await import("node:child_process");
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.__NEXT_PRIVATE_ORIGIN;

  spawnedNextProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", "3000"],
    {
      cwd: process.cwd(),
      env: cleanEnv,
      stdio: "ignore",
      detached: true,
    }
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await checkListening()) {
      // Warm up /da and /api/auth/csrf so initial webpack compilation is complete
      await fetch(`${baseTestUrl}/api/auth/csrf`).catch(() => {});
      await fetch(`${baseTestUrl}/da`).catch(() => {});
      return;
    }
  }
}

BeforeAll(async function () {
  await ensureFrontendServerRunning();
  await provisionKeycloakUsers();
  await ensureBackendBaselineSeed();
  sharedBrowser = await launchPlaywrightBrowser();
});

AfterAll(async function () {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
  if (spawnedNextProcess && spawnedNextProcess.pid) {
    try {
      process.kill(-spawnedNextProcess.pid);
    } catch {
      try {
        spawnedNextProcess.kill();
      } catch {
        // ignore
      }
    }
    spawnedNextProcess = null;
  }
});

Before(async function (this: FrontendBddWorld) {
  await ensureBackendBaselineSeed();
  this.createdServiceId = null;
  this.createdHandshakeId = null;
  this.createdAppointmentId = null;
});

export class FrontendBddWorld extends World {
  public currentIdentity: KeycloakTestIdentity | null = null;
  public lastResponse: RestAssuredResponse | null = null;
  public currentUiHtml: string = "";
  public currentUiUrl: string = "";
  public activeTimelineViewMode: "DELTA" | "SNAPSHOT" = "DELTA";
  public focusedCommitHash: string | null = null;

  public browserContext: BrowserContext | null = null;
  public page: Page | null = null;
  public loggedInIdentityUuid: string | null = null;

  public createdServiceId: string | null = null;
  public createdHandshakeId: string | null = null;
  public createdAppointmentId: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }

  public given(): RestAssuredRequestSpecification {
    const spec = given(baseTestUrl);
    if (this.currentIdentity) {
      spec.authAsKeycloakUser(this.currentIdentity);
    }
    return spec;
  }

  public async ensurePlaywrightPage(): Promise<Page> {
    if (!sharedBrowser) {
      sharedBrowser = await launchPlaywrightBrowser();
    }
    if (!this.browserContext) {
      this.browserContext = await sharedBrowser.newContext({
        viewport: { width: 1440, height: 900 },
      });
    }
    if (!this.page) {
      this.page = await this.browserContext.newPage();
    }
    return this.page;
  }

  public async loginInBrowserIfNeeded(targetPath: string): Promise<Page> {
    const page = await this.ensurePlaywrightPage();
    const requiresAuth = targetPath.includes("/dashboard");

    if (
      requiresAuth &&
      this.currentIdentity &&
      this.loggedInIdentityUuid !== this.currentIdentity.userUuid
    ) {
      await this.browserContext!.clearCookies();
      const kcUsername =
        keycloakUsernameByUuid.get(this.currentIdentity.userUuid) ||
        this.currentIdentity.username;

      // Authenticate via NextAuth Credentials provider against live Keycloak
      await page.goto(`${baseTestUrl}/da`, { waitUntil: "domcontentloaded" });

      // Perform real NextAuth credentials login inside the browser context
      await page.evaluate(
        async ({ username, password }) => {
          const csrfRes = await fetch("/api/auth/csrf");
          const { csrfToken } = await csrfRes.json();
          const params = new URLSearchParams({
            csrfToken,
            username,
            password,
            redirect: "false",
            json: "true",
          });
          await fetch("/api/auth/callback/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
        },
        { username: kcUsername, password: TEST_PASSWORD }
      );

      this.loggedInIdentityUuid = this.currentIdentity.userUuid;
    }

    return page;
  }

  public async visitPage(targetPath: string): Promise<void> {
    const page = await this.loginInBrowserIfNeeded(targetPath);
    const fullUrl = targetPath.startsWith("http")
      ? targetPath
      : `${baseTestUrl}${targetPath.startsWith("/") ? "" : "/"}${targetPath}`;

    await page.goto(fullUrl, { waitUntil: "networkidle" });

    // Wait for loading spinners to disappear
    await page
      .waitForFunction(
        () => !document.querySelector(".spinner-border"),
        { timeout: 15000 }
      )
      .catch(() => {});

    // If visiting the therapist dashboard, select a calendar day with appointments (e.g. 2026-10-14) and open the Client Journal and JGit Timeline windows for Anders Sand so Multi-Window assertions can inspect the real DOM
    if (targetPath.includes("/dashboard/therapist")) {
      const aptDayBtn = page.locator("button.calendar-day-cell.has-appointments").first();
      if ((await aptDayBtn.count()) > 0) {
        await aptDayBtn.click();
        await page.waitForTimeout(250);
      }

      const openJournalBtn = page
        .locator('button:has-text("Åbn Anders Sands Journal"), button:has-text("+ Anders Sand")')
        .first();
      if ((await openJournalBtn.count()) > 0) {
        await openJournalBtn.click();
        await page.waitForTimeout(500);
      }

      const openTimelineBtn = page
        .locator('[data-window-kind="CLIENT_JOURNAL"] button:has-text("JGit Tidslinje"), button:has-text("Åbn JGit Tidslinje ↗")')
        .first();
      if ((await openTimelineBtn.count()) > 0) {
        await openTimelineBtn.click();
        await page.waitForTimeout(600);
      }
    }

    this.currentUiUrl = targetPath;
    this.currentUiHtml = await page.content();
  }
}

setWorldConstructor(FrontendBddWorld);
