import {
  setWorldConstructor,
  World,
  type IWorldOptions,
  BeforeAll,
  AfterAll,
  Before,
  After,
  Status,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  given,
  type KeycloakTestIdentity,
  RestAssuredRequestSpecification,
  RestAssuredResponse,
} from "./restAssured.ts";
import { startSelfContainedMockStack, type MockStackServers } from "./mockStack.ts";

setDefaultTimeout(60000);

function parseAndLoadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const valRaw = line.slice(eqIdx + 1).trim();
    const val =
      (valRaw.startsWith('"') && valRaw.endsWith('"')) ||
      (valRaw.startsWith("'") && valRaw.endsWith("'"))
        ? valRaw.slice(1, -1)
        : valRaw;
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

function loadEnvFiles() {
  if (process.env.BDD_SELF_CONTAINED === "true") return;
  parseAndLoadEnvFile(path.resolve(process.cwd(), ".env.local"));
  parseAndLoadEnvFile(path.resolve(process.cwd(), "..", ".env"));
}

loadEnvFiles();

export let baseTestUrl = process.env.BDD_FRONTEND_URL || "http://localhost:3000";
export let uiBaseUrl = process.env.BDD_FRONTEND_URL || "http://localhost:3000";
export let backendDirectUrl =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";
export const TEST_PASSWORD = process.env.BDD_TEST_PASSWORD || "TestPass123!";

let sharedBrowser: Browser | null = null;
let activeMockStack: MockStackServers | null = null;
let spawnedNextProcess: any = null;

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
  if (activeMockStack || process.env.BDD_SELF_CONTAINED === "true") {
    return null;
  }
  const issuerUrl =
    process.env.KEYCLOAK_ISSUER ||
    "http://platform.localhost/auth/realms/EduJournal";
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

  try {
    const tokenRes = await fetch(`${issuerUrl}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(2000),
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
  } catch {
    return null;
  }
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

export async function ensureBackendBaselineSeed(): Promise<void> {
  // Intentionally lightweight: scenarios create isolated per-run entities declaratively.
}

async function launchPlaywrightBrowser(): Promise<Browser> {
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--font-render-hinting=none",
    "--disable-lcd-text",
    "--force-color-profile=srgb",
  ];
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      args: launchArgs,
    });
  }
  try {
    return await chromium.launch({ headless: true, args: launchArgs });
  } catch {
    const fallbackPaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/home/work/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
      "/home/work/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    ];
    for (const exePath of fallbackPaths) {
      if (fs.existsSync(exePath)) {
        try {
          return await chromium.launch({
            executablePath: exePath,
            headless: true,
            args: launchArgs,
          });
        } catch {
          // try next
        }
      }
    }
    return await chromium.launch({ headless: true, args: launchArgs });
  }
}

async function isLiveBffReachable(): Promise<boolean> {
  for (const probeUrl of [
    `${baseTestUrl}/api/backend/i18n/da`,
    `${backendDirectUrl}/api/v1/i18n/da`,
  ]) {
    try {
      const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(1500) });
      if (probe.ok) return true;
    } catch {
      // try next probe URL
    }
  }
  return false;
}

async function ensureMockStackIfNeeded(): Promise<void> {
  let useMock = process.env.BDD_SELF_CONTAINED === "true";
  if (!useMock) {
    useMock = !(await isLiveBffReachable());
  }

  if (useMock && !activeMockStack) {
    activeMockStack = await startSelfContainedMockStack(18081, 18082);
    backendDirectUrl = `http://127.0.0.1:${activeMockStack.backendPort}`;
    if (!process.env.BDD_FRONTEND_URL) {
      baseTestUrl = backendDirectUrl;
      uiBaseUrl = "http://127.0.0.1:13000";
    }
    process.env.BACKEND_INTERNAL_URL = backendDirectUrl;
    process.env.KEYCLOAK_ISSUER = `http://127.0.0.1:${activeMockStack.keycloakPort}/realms/EduJournal`;
    process.env.KEYCLOAK_CLIENT_ID = "platform-client";
    process.env.KEYCLOAK_CLIENT_SECRET = "mock-secret";
    process.env.KEYCLOAK_ADMIN_CLIENT_ID = "platform-admin";
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = "mock-admin-secret";
    process.env.NEXTAUTH_SECRET =
      process.env.NEXTAUTH_SECRET || "bdd-self-contained-secret-key-123456";
    process.env.NEXTAUTH_URL = uiBaseUrl;
  }
}

async function ensureFrontendServerRunning(): Promise<void> {
  const checkListening = async () => {
    try {
      const res = await fetch(`${uiBaseUrl}/api/backend/i18n/da`, {
        signal: AbortSignal.timeout(2500),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await checkListening()) {
    return;
  }

  const shouldSpawn =
    process.env.BDD_SELF_CONTAINED === "true" ||
    activeMockStack !== null ||
    process.env.BDD_SPAWN_NEXT === "true";
  if (!shouldSpawn) {
    return;
  }

  const parsedUrl = new URL(uiBaseUrl);
  const port = parsedUrl.port || "13000";
  const hasProdBuild = fs.existsSync(path.resolve(process.cwd(), ".next", "BUILD_ID"));
  const subcommand = hasProdBuild ? "start" : "dev";

  const { spawn } = await import("node:child_process");
  const cleanEnv: Record<string, string | undefined> = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.__NEXT_PRIVATE_ORIGIN;
  cleanEnv.BACKEND_INTERNAL_URL = backendDirectUrl;
  cleanEnv.NEXTAUTH_URL = uiBaseUrl;
  cleanEnv.NEXTAUTH_SECRET =
    process.env.NEXTAUTH_SECRET || "bdd-self-contained-secret-key-123456";
  if (hasProdBuild) {
    cleanEnv.NODE_ENV = "production";
  }

  spawnedNextProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", subcommand, "-H", "127.0.0.1", "-p", port],
    {
      cwd: process.cwd(),
      env: cleanEnv,
      stdio: "ignore",
      detached: process.platform !== "win32",
    }
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await checkListening()) {
      await fetch(`${uiBaseUrl}/api/auth/csrf`).catch(() => {});
      await fetch(`${uiBaseUrl}/da`).catch(() => {});
      return;
    }
  }

  throw new Error(`Next.js UI server failed to become ready on ${uiBaseUrl} within 60s`);
}

BeforeAll(async function () {
  await ensureMockStackIfNeeded();
  if (process.env.BDD_SPAWN_NEXT === "true") {
    await ensureFrontendServerRunning();
  }
});

AfterAll(async function () {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
  if (spawnedNextProcess && spawnedNextProcess.pid) {
    try {
      if (process.platform !== "win32") {
        process.kill(-spawnedNextProcess.pid);
      } else {
        spawnedNextProcess.kill();
      }
    } catch {
      try {
        spawnedNextProcess.kill();
      } catch {
        // ignore
      }
    }
    spawnedNextProcess = null;
  }
  if (activeMockStack) {
    await activeMockStack.close();
    activeMockStack = null;
  }
});

Before(async function (this: FrontendBddWorld) {
  if (activeMockStack) {
    await fetch(`${backendDirectUrl}/__test__/reset`, { method: "POST" });
  }
  this.resetScenarioState();
});

After(async function (this: FrontendBddWorld, scenario) {
  if (scenario.result?.status === Status.FAILED && this.page) {
    try {
      const screenshot = await this.page.screenshot({ fullPage: true });
      await this.attach(screenshot, "image/png");
    } catch {
      // ignore if page is already closed
    }
  }

  for (const restoration of this.i18nRestorations.reverse()) {
    await this.requestAs("i18n_cleanup_admin", "ADMIN")
      .contentType("application/json")
      .body({ value: restoration.previousValue })
      .put(`/api/backend/i18n/${restoration.locale}/${restoration.key}`)
      .catch(() => {});
  }

  for (const kpiId of Array.from(this.createdKpiIds).reverse()) {
    await this.requestAs("cleanup_admin", "ADMIN")
      .delete(`/api/backend/management/kpis/${kpiId}`)
      .catch(() => {});
  }

  for (const userId of Array.from(this.createdUserIds).reverse()) {
    await this.requestAs("cleanup_admin", "ADMIN")
      .delete(`/api/backend/users/${userId}`)
      .catch(() => {});
  }

  if (this.page) {
    await this.page.close().catch(() => {});
    this.page = null;
  }
  if (this.browserContext) {
    await this.browserContext.close().catch(() => {});
    this.browserContext = null;
  }
});

export interface ScenarioUserRecord {
  id: string;
  logicalName: string;
  scopedUsername: string;
  fullName: string;
  email: string;
  role: string;
}

export class FrontendBddWorld extends World {
  public runSuffix = "";
  public currentIdentity: KeycloakTestIdentity | null = null;
  public lastResponse: RestAssuredResponse | null = null;
  public secondaryResponse: RestAssuredResponse | null = null;

  public browserContext: BrowserContext | null = null;
  public page: Page | null = null;
  public loggedInIdentityKey: string | null = null;
  public pageErrors: string[] = [];
  public apiServerErrors: string[] = [];

  public usersByLogicalName = new Map<string, ScenarioUserRecord>();
  public providerIdsByLogicalName = new Map<string, string>();
  public orgIdsByLogicalName = new Map<string, string>();
  public servicesByName = new Map<
    string,
    { id: string; therapistLogicalName: string; currency: string }
  >();
  public baselineGlBalances = new Map<string, number>();
  public createdUserIds = new Set<string>();
  public createdKpiIds = new Set<string>();
  public i18nRestorations: Array<{ locale: string; key: string; previousValue: string }> = [];

  public lastServiceId: string | null = null;
  public lastHandshakeId: string | null = null;
  public lastAppointmentId: string | null = null;
  public lastInvoiceId: string | null = null;
  public lastCommitHash: string | null = null;
  public lastLoanId: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
    this.runSuffix = crypto.randomUUID().slice(0, 8);
  }

  public resetScenarioState(): void {
    this.runSuffix = crypto.randomUUID().slice(0, 8);
    this.currentIdentity = null;
    this.lastResponse = null;
    this.secondaryResponse = null;
    this.loggedInIdentityKey = null;
    this.pageErrors = [];
    this.apiServerErrors = [];
    this.usersByLogicalName.clear();
    this.providerIdsByLogicalName.clear();
    this.orgIdsByLogicalName.clear();
    this.servicesByName.clear();
    this.baselineGlBalances.clear();
    this.createdUserIds.clear();
    this.createdKpiIds.clear();
    this.i18nRestorations = [];
    this.lastServiceId = null;
    this.lastHandshakeId = null;
    this.lastAppointmentId = null;
    this.lastInvoiceId = null;
    this.lastCommitHash = null;
    this.lastLoanId = null;
  }

  public scopedUsername(logicalName: string): string {
    const existing = this.usersByLogicalName.get(logicalName);
    if (existing) return existing.scopedUsername;
    return `${logicalName}_${this.runSuffix}`;
  }

  public identityFor(logicalName: string, roleOverride?: string): KeycloakTestIdentity {
    const existing = this.usersByLogicalName.get(logicalName);
    const role = (roleOverride || existing?.role || "CLIENT").toLowerCase();
    return {
      userUuid: existing?.id || crypto.randomUUID(),
      username: existing?.scopedUsername || `${logicalName}_${this.runSuffix}`,
      fullName: existing?.fullName || logicalName,
      email: existing?.email || `${logicalName}_${this.runSuffix}@example.dk`,
      roles: [role],
    };
  }

  public given(): RestAssuredRequestSpecification {
    const spec = given(baseTestUrl);
    if (this.currentIdentity) {
      spec.authAsKeycloakUser(this.currentIdentity);
    }
    return spec;
  }

  public requestAs(
    logicalName: string,
    roleOverride?: string
  ): RestAssuredRequestSpecification {
    return given(baseTestUrl).authAsKeycloakUser(this.identityFor(logicalName, roleOverride));
  }

  public async ensurePlaywrightPage(
    viewport: { width: number; height: number } = { width: 1440, height: 900 }
  ): Promise<Page> {
    await ensureFrontendServerRunning();

    if (!sharedBrowser) {
      sharedBrowser = await launchPlaywrightBrowser();
    }
    if (!this.browserContext) {
      this.browserContext = await sharedBrowser.newContext({ viewport });
    }
    if (!this.page) {
      this.pageErrors = [];
      this.apiServerErrors = [];
      this.page = await this.browserContext.newPage();
      this.page.on("pageerror", (err) => {
        this.pageErrors.push(err?.message || String(err));
      });
      this.page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 500) {
          this.apiServerErrors.push(`${response.status()} ${response.url()}`);
        }
      });
    } else {
      const cur = this.page.viewportSize();
      if (!cur || cur.width !== viewport.width || cur.height !== viewport.height) {
        await this.page.setViewportSize(viewport);
      }
    }
    return this.page;
  }

  public async loginInBrowserIfNeeded(
    viewport: { width: number; height: number } = { width: 1440, height: 900 }
  ): Promise<Page> {
    const page = await this.ensurePlaywrightPage(viewport);

    if (!this.currentIdentity) {
      if (this.loggedInIdentityKey !== null) {
        await this.browserContext!.clearCookies();
        this.loggedInIdentityKey = null;
      }
      return page;
    }

    const id = this.currentIdentity;
    const kcUsername = keycloakUsernameByUuid.get(id.userUuid) || id.username;
    const identityKey = `${id.userUuid}:${id.roles.join(",")}:${kcUsername}`;

    if (this.loggedInIdentityKey !== identityKey) {
      await this.browserContext!.clearCookies();
      const secret = process.env.NEXTAUTH_SECRET;
      if (!secret) {
        throw new Error(
          "NEXTAUTH_SECRET is required to mint Playwright NextAuth session cookies."
        );
      }

      const cookieName = uiBaseUrl.startsWith("https://")
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token";

      const jwtValue = await encode({
        token: {
          sub: id.userUuid,
          name: id.fullName,
          email: id.email,
          userUuid: id.userUuid,
          username: kcUsername,
          fullName: id.fullName,
          roles: id.roles,
          accessTokenExpires: Date.now() + 3600 * 1000,
        },
        secret,
        maxAge: 3600,
      });

      await this.browserContext!.addCookies([
        {
          name: cookieName,
          value: jwtValue,
          url: uiBaseUrl,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      this.loggedInIdentityKey = identityKey;
    }

    return page;
  }

  public async visitPage(
    targetPath: string,
    viewport: { width: number; height: number } = { width: 1440, height: 900 }
  ): Promise<Page> {
    const page = await this.loginInBrowserIfNeeded(viewport);
    const fullUrl = targetPath.startsWith("http")
      ? targetPath
      : `${uiBaseUrl}${targetPath.startsWith("/") ? "" : "/"}${targetPath}`;

    await page.goto(fullUrl, { waitUntil: "domcontentloaded" });
    return page;
  }

  public async assertPageHealthy(): Promise<void> {
    if (this.pageErrors.length > 0) {
      throw new Error(`Uncaught pageerror(s): ${this.pageErrors.join(" | ")}`);
    }
    if (this.apiServerErrors.length > 0) {
      throw new Error(`Unexpected 5xx /api/ response(s): ${this.apiServerErrors.join(" | ")}`);
    }
    if (this.page) {
      const bodyText = await this.page
        .locator("body")
        .innerText()
        .catch(() => "");
      if (bodyText.includes("MISSING_MESSAGE")) {
        throw new Error("Rendered page contains 'MISSING_MESSAGE' i18n error.");
      }
      const leakedKeyMatch = bodyText.match(
        /\b(landing|dashboard|portal|HomePage)\.[a-zA-Z0-9_.]+\b/
      );
      if (leakedKeyMatch) {
        throw new Error(`Leaked raw i18n translation key in UI: '${leakedKeyMatch[0]}'`);
      }
    }
  }
}

setWorldConstructor(FrontendBddWorld);
