import { When, Then } from "@cucumber/cucumber";
import { expect, type Locator, type Page } from "@playwright/test";
import { FrontendBddWorld } from "../support/world.ts";
import { assertVisualSnapshot } from "../support/visualRegression.ts";
import { ensureRegisteredUser } from "./frontend_steps.ts";

interface UiScenarioState {
  localizedHeadings: Map<string, string>;
  lastCreatedI18nKey: string | null;
  kpiNamesByLabel: Map<string, string>;
  lastCreatedAppointmentTitle: string | null;
  lastUiAppointmentId: string | null;
  lastZoomPercentageBefore: string | null;
}

const uiStateByWorld = new WeakMap<FrontendBddWorld, UiScenarioState>();

function getUiState(world: FrontendBddWorld): UiScenarioState {
  let state = uiStateByWorld.get(world);
  if (!state) {
    state = {
      localizedHeadings: new Map(),
      lastCreatedI18nKey: null,
      kpiNamesByLabel: new Map(),
      lastCreatedAppointmentTitle: null,
      lastUiAppointmentId: null,
      lastZoomPercentageBefore: null,
    };
    uiStateByWorld.set(world, state);
  }
  return state;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requirePage(world: FrontendBddWorld): Page {
  if (!world.page) {
    throw new Error("Playwright page has not been initialized in this scenario.");
  }
  return world.page;
}

async function fillOrSelect(locator: Locator, value: string): Promise<void> {
  await expect(locator).toBeVisible();
  const tagName = await locator.evaluate((el) => el.tagName.toUpperCase());
  if (tagName === "SELECT") {
    const matched = await locator.evaluate((el, target) => {
      const select = el as HTMLSelectElement;
      const lower = target.toLowerCase();
      for (const opt of Array.from(select.options)) {
        if (
          opt.value.toLowerCase() === lower ||
          opt.text.toLowerCase().includes(lower)
        ) {
          return opt.value;
        }
      }
      return null;
    }, value);
    await locator.selectOption(matched ?? value);
  } else {
    await locator.fill(value);
  }
}

async function selectMatchingOrFirstOption(
  selectLocator: Locator,
  preferredTerms: string[]
): Promise<boolean> {
  const chosenValue = await selectLocator.evaluate((el, terms) => {
    const select = el as HTMLSelectElement;
    const usable = Array.from(select.options).filter(
      (opt) => opt.value && opt.value !== "__manual__"
    );
    if (usable.length === 0) return null;
    for (const term of terms) {
      if (!term) continue;
      const lower = term.toLowerCase();
      const hit = usable.find(
        (opt) =>
          opt.value.toLowerCase() === lower ||
          opt.text.toLowerCase().includes(lower)
      );
      if (hit) return hit.value;
    }
    return usable[0].value;
  }, preferredTerms);

  if (!chosenValue) return false;
  await selectLocator.selectOption(chosenValue);
  return true;
}

async function setCheckbox(locator: Locator, checked: boolean): Promise<void> {
  await expect(locator).toBeVisible();
  if (checked) {
    await locator.check();
  } else {
    await locator.uncheck();
  }
}

async function openAsRole(
  world: FrontendBddWorld,
  logicalName: string,
  role: string,
  targetPath: string,
  viewport?: { width: number; height: number }
): Promise<void> {
  const existing = world.usersByLogicalName.get(logicalName);
  if (!existing) {
    await ensureRegisteredUser(
      world,
      logicalName,
      `${role === "THERAPIST" ? "Dr. " : ""}${logicalName}`,
      `${logicalName}@example.dk`,
      role
    );
  }
  world.currentIdentity = world.identityFor(logicalName, existing?.role ?? role);
  const page = await world.visitPage(targetPath, viewport);
  await page.waitForLoadState("load");
  await expect(page.getByTestId("portal-workspace-shell")).toHaveCount(1);
}

// ============================================================================
// 1. i18n.feature (@ui-only @ui)
// ============================================================================

When(
  "in the browser a visitor switches the landing page language through {string}, {string}, {string}, {string}, and {string}",
  async function (
    this: FrontendBddWorld,
    loc1: string,
    loc2: string,
    loc3: string,
    loc4: string,
    loc5: string
  ) {
    const state = getUiState(this);
    this.currentIdentity = null;
    this.loggedInIdentityKey = null;

    await this.visitPage(`/${loc1}`);
    const page = requirePage(this);
    const switcher = page.getByTestId("language-switcher-select");
    await expect(switcher).toBeVisible();

    const firstHeading = page.locator("h1").first();
    await expect(firstHeading).toBeVisible();
    state.localizedHeadings.set(loc1, (await firstHeading.innerText()).trim());
    await this.assertPageHealthy();

    for (const loc of [loc2, loc3, loc4, loc5, loc1]) {
      await switcher.selectOption(loc);
      await expect(page).toHaveURL(new RegExp(`/${escapeRegExp(loc)}(?:/|$|\\?)`));
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible();
      state.localizedHeadings.set(loc, (await heading.innerText()).trim());
      await this.assertPageHealthy();
    }
  }
);

Then(
  "the browser UI should render localized headings without missing translation errors or leaked keys",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    await expect(page.locator("h1").first()).toBeVisible();
    const distinctHeadings = new Set(
      Array.from(state.localizedHeadings.values()).filter((h) => h.length > 0)
    );
    expect(distinctHeadings.size).toBeGreaterThanOrEqual(4);
    await this.assertPageHealthy();
  }
);

Then(
  "the visual snapshot {string} for {string} and {string} for {string} should match baseline",
  async function (
    this: FrontendBddWorld,
    snap1: string,
    loc1: string,
    snap2: string,
    loc2: string
  ) {
    const page = requirePage(this);
    const switcher = page.getByTestId("language-switcher-select");
    for (const [snapName, locale] of [
      [snap1, loc1],
      [snap2, loc2],
    ] as const) {
      const cleanLocale = locale.replace(/^\/+/, "");
      const currentPath = new URL(page.url()).pathname;
      if (!currentPath.startsWith(`/${cleanLocale}`)) {
        await switcher.selectOption(cleanLocale);
        await expect(page).toHaveURL(
          new RegExp(`/${escapeRegExp(cleanLocale)}(?:/|$|\\?)`)
        );
      }
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertVisualSnapshot(this, snapName, { fullPage: false });
    }
  }
);

When(
  "in the portal UI administrator {string} opens {string}",
  async function (this: FrontendBddWorld, adminName: string, targetPath: string) {
    await openAsRole(this, adminName, "ADMIN", targetPath);
  }
);

Then(
  "the browser UI should display i18n search, locale filter pills, and pagination controls",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await expect(page.getByTestId("i18n-feature-view")).toBeVisible();
    await expect(page.getByTestId("input-i18n-search")).toBeVisible();
    for (const loc of ["all", "da", "en", "fr", "es", "de"]) {
      await expect(page.getByTestId(`filter-i18n-locale-${loc}`)).toBeVisible();
    }
    await expect(page.getByTestId("i18n-pagination")).toBeVisible();
    await expect(page.getByTestId("i18n-prev-page")).toBeVisible();
    await expect(page.getByTestId("i18n-next-page")).toBeVisible();
    await this.assertPageHealthy();
  }
);

When(
  "in the portal UI administrator filters the i18n dictionary by search {string} and locale {string}",
  async function (this: FrontendBddWorld, searchQuery: string, locale: string) {
    const page = requirePage(this);
    await page.getByTestId("input-i18n-search").fill(searchQuery);
    await page.getByTestId(`filter-i18n-locale-${locale.toLowerCase()}`).click();
    await expect(page.getByTestId("i18n-filtered-count")).toBeVisible();
  }
);

Then(
  "the visual snapshot {string} of the i18n workspace should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const view = page.getByTestId("i18n-feature-view");
    await expect(view).toBeVisible();
    await expect(page.getByTestId("i18n-list")).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: view,
      mask: [
        page.getByTestId("i18n-list"),
        page.getByTestId("i18n-filtered-count"),
      ],
    });
  }
);

When(
  "in the portal UI administrator creates a translation key in locale {string} with value {string}",
  async function (this: FrontendBddWorld, locale: string, val: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    const key = `ui.bdd.key.${this.runSuffix}`;
    state.lastCreatedI18nKey = key;

    await fillOrSelect(page.getByTestId("input-i18n-locale"), locale);
    await page.getByTestId("input-i18n-key").fill(key);
    await page.getByTestId("input-i18n-value").fill(val);
    await page.getByTestId("submit-i18n").click();

    await page.getByTestId("input-i18n-search").fill(key);
    await page.getByTestId("filter-i18n-locale-all").click();
  }
);

Then(
  "the i18n dictionary list in the UI should contain the created translation value {string}",
  async function (this: FrontendBddWorld, expectedValue: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    if (state.lastCreatedI18nKey) {
      await page.getByTestId("input-i18n-search").fill(state.lastCreatedI18nKey);
    }
    await expect(page.getByTestId("i18n-list")).toContainText(expectedValue);
  }
);

When(
  "in the portal UI administrator deletes that created translation entry via the confirmation dialog",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    if (state.lastCreatedI18nKey) {
      await page.getByTestId("input-i18n-search").fill(state.lastCreatedI18nKey);
    }
    const list = page.getByTestId("i18n-list");
    await expect(list).toBeVisible();
    const deleteBtn = list.locator('[data-testid^="delete-i18n-"]').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    await expect(page.getByTestId("confirm-action-dialog")).toBeVisible();
    await page.getByTestId("confirm-action-accept").click();
  }
);

Then(
  "the created translation entry should be removed from the i18n dictionary list",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    const key = state.lastCreatedI18nKey ?? "";
    if (key) {
      await expect(page.getByTestId("i18n-list").getByText(key)).toHaveCount(0);
    }
    await this.assertPageHealthy();
  }
);

Then(
  "authenticated portal pages across {string}, {string}, and {string} should render cleanly without i18n errors",
  async function (
    this: FrontendBddWorld,
    path1: string,
    path2: string,
    path3: string
  ) {
    for (const targetPath of [path1, path2, path3]) {
      this.currentIdentity = targetPath.includes("/therapist")
        ? this.identityFor("maja_terapeut", "THERAPIST")
        : this.identityFor("anders_sand", "CLIENT");
      const page = await this.visitPage(targetPath);
      await page.waitForLoadState("load");
      await expect(page.getByTestId("portal-workspace-shell")).toHaveCount(1);
      await expect(page.getByTestId("portal-workspace-shell")).toBeVisible();
      await expect(page.locator("main").first()).toBeVisible();
      await this.assertPageHealthy();
    }
  }
);

// ============================================================================
// 2. management.feature (@ui-only @ui)
// ============================================================================

Then(
  "the browser UI should show element {string} with KPI list {string}",
  async function (
    this: FrontendBddWorld,
    containerTestId: string,
    listTestId: string
  ) {
    const page = requirePage(this);
    await expect(page.getByTestId(containerTestId)).toBeVisible();
    await expect(page.getByTestId(listTestId)).toBeVisible();
    await this.assertPageHealthy();
  }
);

Then(
  "the visual snapshot {string} of the management workspace should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const form = page
      .getByTestId("management-feature-view")
      .locator("form")
      .filter({ has: page.getByTestId("submit-kpi") })
      .first();
    await expect(form).toBeVisible();
    await assertVisualSnapshot(this, snapName, { locator: form });
  }
);

When(
  "in the portal UI administrator creates a KPI named {string} with value {string}, unit {string}, and department {string}",
  async function (
    this: FrontendBddWorld,
    kpiLabel: string,
    value: string,
    unit: string,
    department: string
  ) {
    const page = requirePage(this);
    const state = getUiState(this);
    const scopedName = `${kpiLabel} [${this.runSuffix}]`;
    state.kpiNamesByLabel.set(kpiLabel, scopedName);

    await page.getByTestId("input-kpi-name").fill(scopedName);
    await page.getByTestId("input-kpi-value").fill(value);
    await page.getByTestId("input-kpi-unit").fill(unit);
    await page.getByTestId("input-kpi-department").fill(department);
    await page.getByTestId("submit-kpi").click();
  }
);

Then(
  "the KPI list in the UI should display {string}",
  async function (this: FrontendBddWorld, kpiLabel: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    const expected = state.kpiNamesByLabel.get(kpiLabel) ?? kpiLabel;
    await expect(page.getByTestId("kpi-list")).toContainText(expected);
  }
);

When(
  "in the portal UI administrator deletes the KPI {string} via the confirmation dialog",
  async function (this: FrontendBddWorld, kpiLabel: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    const expected = state.kpiNamesByLabel.get(kpiLabel) ?? kpiLabel;
    const row = page
      .getByTestId("kpi-list")
      .locator(":scope > *")
      .filter({ hasText: expected })
      .first();
    await expect(row).toBeVisible();
    await row.locator('[data-testid^="delete-kpi-"]').first().click();

    await expect(page.getByTestId("confirm-action-dialog")).toBeVisible();
    await page.getByTestId("confirm-action-accept").click();
  }
);

Then(
  "the KPI {string} should no longer appear in the KPI list",
  async function (this: FrontendBddWorld, kpiLabel: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    const expected = state.kpiNamesByLabel.get(kpiLabel) ?? kpiLabel;
    await expect(page.getByTestId("kpi-list")).not.toContainText(expected);
  }
);

When(
  "in the portal UI therapist {string} navigates to {string}",
  async function (this: FrontendBddWorld, therapistName: string, targetPath: string) {
    await openAsRole(this, therapistName, "THERAPIST", targetPath);
  }
);

Then(
  "the browser URL should redirect to {string} without unhandled errors",
  async function (this: FrontendBddWorld, expectedFragment: string) {
    const page = requirePage(this);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(expectedFragment)));
    await this.assertPageHealthy();
  }
);

// ============================================================================
// 3. user.feature (@ui-only @ui)
// ============================================================================

When(
  "in the browser a visitor opens the 2-step registration wizard on {string}",
  async function (this: FrontendBddWorld, landingPath: string) {
    if (this.context) {
      await this.context.clearCookies();
    }
    this.currentIdentity = null;
    this.loggedInIdentityKey = null;
    await this.visitPage(landingPath);

    const page = requirePage(this);
    await page.getByTestId("hero-cta-register").click();
    await expect(page.getByTestId("register-step-indicator")).toBeVisible();
  }
);

Then(
  "the registration modal should show step {string} and match visual snapshot {string}",
  async function (this: FrontendBddWorld, stepLabel: string, snapName: string) {
    const page = requirePage(this);
    await expect(page.getByTestId("register-step-indicator")).toContainText(
      stepLabel
    );
    const modal = page.locator(".modal-content").first();
    await expect(modal).toBeVisible();
    await assertVisualSnapshot(this, snapName, { locator: modal });
  }
);

When(
  "in the browser the visitor fills step 1 of registration with first name {string}, last name {string}, username {string}, and advances to step 2",
  async function (
    this: FrontendBddWorld,
    firstName: string,
    lastName: string,
    username: string
  ) {
    const page = requirePage(this);
    await page.locator("#regFirst").fill(firstName);
    await page.locator("#regLast").fill(lastName);
    await page.locator("#regUser").fill(username);
    await page.getByTestId("register-next-step").click();
    await expect(page.locator("#regEmail")).toBeVisible();
    await expect(page.getByTestId("register-password-hint")).toBeVisible();
  }
);

When(
  "in the browser the visitor returns to step 1 of the registration wizard",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("register-prev-step").click();
  }
);

Then(
  "the registration modal should return to step {string}",
  async function (this: FrontendBddWorld, stepLabel: string) {
    const page = requirePage(this);
    await expect(page.getByTestId("register-step-indicator")).toContainText(
      stepLabel
    );
    await expect(page.locator("#regFirst")).toBeVisible();
  }
);

When(
  "in the browser a visitor completes the 2-step registration for logical user {string} on {string}",
  async function (this: FrontendBddWorld, logicalName: string, landingPath: string) {
    if (this.context) {
      await this.context.clearCookies();
    }
    this.currentIdentity = null;
    this.loggedInIdentityKey = null;
    await this.visitPage(landingPath);

    const page = requirePage(this);
    const scoped = this.scopedUsername(logicalName);
    const email = `${logicalName}_${this.runSuffix}@example.dk`;

    await page.getByTestId("hero-cta-register").click();
    await page.locator("#regFirst").fill("Ny");
    await page.locator("#regLast").fill("Klient");
    await page.locator("#regUser").fill(scoped);
    await page.getByTestId("register-next-step").click();

    await expect(page.locator("#regEmail")).toBeVisible();
    await page.locator("#regEmail").fill(email);
    await page.locator("#regPass").fill("SecurePassword123!");
    await page.locator('.modal-content form button[type="submit"]').first().click();

    await expect(page).toHaveURL(/\/dashboard\/personal/);
    this.loggedInIdentityKey = "__ui_modal__";

    const res = await this.requestAs("cleanup_admin", "ADMIN").get(
      "/api/backend/users"
    );
    if (res.status === 200) {
      const users = res.json<Array<{ id?: string; username?: string }>>();
      const found = users.find(
        (u) => String(u.username || "").toLowerCase() === scoped.toLowerCase()
      );
      if (found?.id) {
        this.createdUserIds.add(String(found.id));
        this.usersByLogicalName.set(logicalName, {
          id: String(found.id),
          logicalName,
          scopedUsername: scoped,
          fullName: "Ny Klient",
          email,
          role: "CLIENT",
        });
      }
    }
  }
);

Then(
  "the browser should sign in and navigate to the personal dashboard with {string} visible",
  async function (this: FrontendBddWorld, testId: string) {
    const page = requirePage(this);
    await expect(page).toHaveURL(/\/dashboard\/personal/);
    await expect(page.getByTestId(testId)).toBeVisible();
    await this.assertPageHealthy();
  }
);

When(
  "in the browser the unauthenticated visitor opens {string}",
  async function (this: FrontendBddWorld, targetPath: string) {
    if (this.context) {
      await this.context.clearCookies();
    }
    this.currentIdentity = null;
    this.loggedInIdentityKey = null;
    await this.visitPage(targetPath);
  }
);

Then(
  "the browser should redirect to the landing page showing {string}",
  async function (this: FrontendBddWorld, testId: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(testId)).toBeVisible();
    await this.assertPageHealthy();
  }
);

When(
  "in the portal UI user {string} with role {string} opens {string}",
  async function (
    this: FrontendBddWorld,
    logicalName: string,
    role: string,
    targetPath: string
  ) {
    await openAsRole(this, logicalName, role, targetPath);
  }
);

When(
  "in the portal UI the user collapses the desktop sidebar",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("sidebar-collapse-toggle").click();
  }
);

Then(
  "the workspace sidebar attribute {string} should be {string}",
  async function (this: FrontendBddWorld, attrName: string, expectedValue: string) {
    const page = requirePage(this);
    await expect(page.getByTestId("portal-workspace-shell")).toHaveAttribute(
      attrName,
      expectedValue
    );
  }
);

Then(
  "the visual snapshot {string} of the desktop viewport should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    await assertVisualSnapshot(this, snapName, {
      fullPage: false,
      mask: [page.locator("main"), page.getByTestId("user-menu-trigger")],
    });
  }
);

When(
  "in the portal UI the user switches portal area via {string}",
  async function (this: FrontendBddWorld, switchTestId: string) {
    const page = requirePage(this);
    const btn = page.getByTestId(switchTestId);
    await expect(btn).toBeVisible();
    await btn.click();
  }
);

Then(
  "the browser URL should contain {string}",
  async function (this: FrontendBddWorld, fragment: string) {
    const page = requirePage(this);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(fragment)));
    await this.assertPageHealthy();
  }
);

When(
  "in a mobile viewport {string} client {string} opens {string}",
  async function (
    this: FrontendBddWorld,
    viewportText: string,
    clientName: string,
    targetPath: string
  ) {
    const [wStr, hStr] = viewportText.toLowerCase().split("x");
    const width = Number(wStr) || 390;
    const height = Number(hStr) || 844;
    await openAsRole(this, clientName, "CLIENT", targetPath, { width, height });
  }
);

When(
  "in the portal UI the user opens the mobile navigation drawer",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("mobile-menu-toggle").click();
    await expect(page.getByTestId("mobile-sidebar-drawer")).toBeVisible();
  }
);

Then(
  "element {string} should be visible and match visual snapshot {string}",
  async function (this: FrontendBddWorld, testId: string, snapName: string) {
    const page = requirePage(this);
    const el = page.getByTestId(testId);
    await expect(el).toBeVisible();

    let snapshotTarget: Locator = el;
    const mask: Locator[] = [];
    if (testId === "mobile-sidebar-drawer") {
      snapshotTarget = el.locator("aside").first();
    } else if (testId === "settings-clinic-page") {
      const profileForm = page.getByTestId("personal-profile-form");
      await expect(profileForm).toBeVisible();
      snapshotTarget = profileForm;
      mask.push(
        page.getByTestId("input-profile-fullName"),
        page.getByTestId("input-profile-email"),
        page.getByTestId("input-profile-phone")
      );
    } else if (testId === "therapist-onboarding-form") {
      mask.push(
        page.getByTestId("input-onboard-displayName"),
        page.getByTestId("input-onboard-orgName")
      );
    }

    await assertVisualSnapshot(this, snapName, {
      locator: snapshotTarget,
      mask,
    });
  }
);

When(
  "in the portal UI the user closes the mobile drawer and opens the user menu dropdown",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("mobile-menu-close").click();
    await expect(page.getByTestId("mobile-sidebar-drawer")).toBeHidden();
    await page.getByTestId("user-menu-trigger").click();
  }
);

Then(
  "element {string} should be visible",
  async function (this: FrontendBddWorld, testId: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(testId)).toBeVisible();
    await this.assertPageHealthy();
  }
);

Then(
  "the visual snapshot {string} of the user directory workspace should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const form = page.getByTestId("user-form");
    await expect(form).toBeVisible();
    await assertVisualSnapshot(this, snapName, { locator: form });
  }
);

When(
  "in the portal UI administrator creates a {string} user account for logical user {string}",
  async function (this: FrontendBddWorld, role: string, logicalName: string) {
    const page = requirePage(this);
    const scoped = this.scopedUsername(logicalName);

    await page.getByTestId("input-username").fill(scoped);
    await page.getByTestId("input-password").fill("SecurePassword123!");
    await fillOrSelect(page.getByTestId("select-role"), role);
    await page.getByTestId("submit-user").click();

    await expect(page.getByTestId("user-list")).toContainText(scoped);

    const row = page
      .getByTestId("user-list")
      .locator('[data-testid^="user-item-"]')
      .filter({ hasText: scoped })
      .first();
    const rowTestId = await row.getAttribute("data-testid");
    const createdId = rowTestId?.replace("user-item-", "") ?? "";
    if (createdId) {
      this.createdUserIds.add(createdId);
      this.usersByLogicalName.set(logicalName, {
        id: createdId,
        logicalName,
        scopedUsername: scoped,
        fullName: scoped,
        email: `${scoped}@example.dk`,
        role: role.toUpperCase(),
      });
    }
  }
);

Then(
  "the user directory list in the UI should contain logical user {string}",
  async function (this: FrontendBddWorld, logicalName: string) {
    const page = requirePage(this);
    const scoped = this.scopedUsername(logicalName);
    await expect(page.getByTestId("user-list")).toContainText(scoped);
  }
);

When(
  "in the portal UI administrator deletes logical user {string} via the confirmation dialog",
  async function (this: FrontendBddWorld, logicalName: string) {
    const page = requirePage(this);
    const scoped = this.scopedUsername(logicalName);
    const row = page
      .getByTestId("user-list")
      .locator('[data-testid^="user-item-"]')
      .filter({ hasText: scoped })
      .first();
    await expect(row).toBeVisible();
    await row.locator('[data-testid^="delete-user-"]').first().click();

    await expect(page.getByTestId("confirm-action-dialog")).toBeVisible();
    await page.getByTestId("confirm-action-accept").click();
  }
);

Then(
  "logical user {string} should be removed from the UI user directory list",
  async function (this: FrontendBddWorld, logicalName: string) {
    const page = requirePage(this);
    const scoped = this.scopedUsername(logicalName);
    await expect(page.getByTestId("user-list")).not.toContainText(scoped);
  }
);

// ============================================================================
// 4. clinic.feature (@ui-only @ui)
// ============================================================================

When(
  "in the portal UI therapist {string} opens {string}",
  async function (this: FrontendBddWorld, therapistName: string, targetPath: string) {
    await openAsRole(this, therapistName, "THERAPIST", targetPath);
  }
);

When(
  "in the portal UI therapist completes clinic onboarding with organisation {string}, CVR {string}, and IBAN {string}",
  async function (
    this: FrontendBddWorld,
    organisationName: string,
    cvr: string,
    iban: string
  ) {
    const page = requirePage(this);
    await page.getByTestId("input-onboard-orgName").fill(organisationName);
    await page.getByTestId("input-onboard-cvr").fill(cvr);
    const displayNameEl = page.getByTestId("input-onboard-displayName");
    if ((await displayNameEl.inputValue()).trim() === "") {
      await displayNameEl.fill(organisationName);
    }
    await page.getByTestId("input-onboard-iban").fill(iban);
    await fillOrSelect(page.getByTestId("input-onboard-currency"), "DKK");

    const hoursEl = page.getByTestId("input-onboard-hours");
    if ((await hoursEl.count()) > 0 && (await hoursEl.inputValue()).trim() === "") {
      await hoursEl.fill("09:00-17:00");
    }
    const addrEl = page.getByTestId("input-onboard-address");
    if ((await addrEl.count()) > 0 && (await addrEl.inputValue()).trim() === "") {
      await addrEl.fill("Bredgade 42");
    }
    const zipEl = page.getByTestId("input-onboard-postalCode");
    if ((await zipEl.count()) > 0 && (await zipEl.inputValue()).trim() === "") {
      await zipEl.fill("1260");
    }
    const phoneEl = page.getByTestId("input-onboard-phone");
    if ((await phoneEl.count()) > 0 && (await phoneEl.inputValue()).trim() === "") {
      await phoneEl.fill("+45 33 14 25 36");
    }

    await page.getByTestId("submit-therapist-onboarding").click();
    await expect(page.getByTestId("onboarding-saved-badge")).toBeVisible();
  }
);

When(
  "in the portal UI therapist creates service {string} priced at {int} DKK for {int} minutes",
  async function (
    this: FrontendBddWorld,
    serviceName: string,
    priceDkk: number,
    durationMin: number
  ) {
    const page = requirePage(this);
    await expect(page.getByTestId("therapist-service-form")).toBeVisible();
    await page.getByTestId("input-service-name").fill(serviceName);
    await page.getByTestId("input-service-price").fill(String(priceDkk));
    await page.getByTestId("input-service-duration").fill(String(durationMin));
    await page.getByTestId("input-service-location").fill("København K");
    await page.getByTestId("submit-clinic-service").click();
    await expect(page.getByTestId("input-service-name")).toHaveValue("");
  }
);

Then(
  "the therapist services list in the UI should display {string}",
  async function (this: FrontendBddWorld, serviceName: string) {
    const page = requirePage(this);
    const list = page.getByTestId("therapist-services-list");
    await expect(list).toBeVisible();

    for (let pageIdx = 0; pageIdx < 30; pageIdx++) {
      const content = (await list.textContent()) ?? "";
      if (content.includes(serviceName)) break;
      const nextBtn = page.getByTestId("services-next");
      if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) break;
      await nextBtn.click();
    }

    await expect(list).toContainText(serviceName);
  }
);

When(
  "in the portal UI client {string} opens {string}",
  async function (this: FrontendBddWorld, clientName: string, targetPath: string) {
    await openAsRole(this, clientName, "CLIENT", targetPath);
  }
);

When(
  "in the portal UI client requests a handshake with provider {string}",
  async function (this: FrontendBddWorld, providerName: string) {
    const page = requirePage(this);
    const provider =
      this.usersByLogicalName.get(providerName) ??
      (await ensureRegisteredUser(
        this,
        providerName,
        `Dr. ${providerName}`,
        `${providerName}@klinik.dk`,
        "THERAPIST"
      ));

    await expect(page.getByTestId("client-marketplace-panel")).toBeVisible();
    await expect(page.getByTestId("marketplace-provider-list")).toBeVisible();

    const card = page.getByTestId(`marketplace-provider-${provider.id}`);
    for (let pageIdx = 0; pageIdx < 25; pageIdx++) {
      if ((await card.count()) > 0) break;
      const nextBtn = page.getByTestId("marketplace-next");
      if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) break;
      await nextBtn.click();
    }

    await expect(card).toBeVisible();
    await page.getByTestId(`request-handshake-${provider.id}`).click();
  }
);

Then(
  "provider card for {string} should display handshake status in the marketplace",
  async function (this: FrontendBddWorld, providerName: string) {
    const page = requirePage(this);
    const provider = this.usersByLogicalName.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not registered in scenario.`);
    }
    await expect(page.getByTestId(`handshake-status-${provider.id}`)).toBeVisible();
  }
);

Then(
  "the visual snapshot {string} of the consents view should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const panel = page.getByTestId("client-consents-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("personal-profile-form")).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: panel,
      mask: [
        page.getByTestId("input-profile-fullName"),
        page.getByTestId("input-profile-email"),
        page.getByTestId("input-profile-phone"),
        page.getByTestId("client-handshakes-consent-list"),
      ],
    });
  }
);

When(
  "in the portal UI client updates personal phone to {string} and configures handshake restriction from {string} hiding mood scores",
  async function (this: FrontendBddWorld, phone: string, startDate: string) {
    const page = requirePage(this);

    await page.getByTestId("input-profile-phone").fill(phone);
    await page.getByTestId("submit-personal-profile").click();
    await expect(page.getByTestId("profile-saved-badge")).toBeVisible();

    const list = page.getByTestId("client-handshakes-consent-list");
    await expect(list).toBeVisible();
    const toggleBtn = list
      .locator('[data-testid^="toggle-handshake-settings-"]')
      .first();
    await expect(toggleBtn).toBeVisible();

    const toggleIdAttr = await toggleBtn.getAttribute("data-testid");
    const hsId = toggleIdAttr?.replace("toggle-handshake-settings-", "") ?? "";
    if (!hsId) {
      throw new Error("Could not determine handshake ID on consents panel.");
    }

    const startInput = page.getByTestId(`input-hs-start-${hsId}`);
    if ((await startInput.count()) === 0 || !(await startInput.isVisible())) {
      await toggleBtn.click();
    }

    await expect(startInput).toBeVisible();
    await startInput.fill(startDate);
    await setCheckbox(page.getByTestId(`input-hs-no-mood-${hsId}`), true);
    await page.getByTestId(`save-handshake-settings-${hsId}`).click();
  }
);

Then(
  "elements {string} and {string} should be visible",
  async function (this: FrontendBddWorld, id1: string, id2: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(id1)).toBeVisible();
    await expect(page.getByTestId(id2)).toBeVisible();
    await this.assertPageHealthy();
  }
);

When(
  "in the portal UI client clicks {string}",
  async function (this: FrontendBddWorld, testId: string) {
    const page = requirePage(this);
    const el = page.getByTestId(testId);
    await expect(el).toBeVisible();
    await el.click();
  }
);

Then(
  "the browser URL should contain {string} and show {string}",
  async function (this: FrontendBddWorld, urlFragment: string, testId: string) {
    const page = requirePage(this);
    await expect(page).toHaveURL(new RegExp(escapeRegExp(urlFragment)));
    await expect(page.getByTestId(testId)).toBeVisible();
    await this.assertPageHealthy();
  }
);

// ============================================================================
// 5. journal.feature (@ui-only @ui)
// ============================================================================

When(
  "in the portal UI client toggles the diary share option to inspect active handshake guidance",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await setCheckbox(page.getByTestId("input-journal-shared"), true);
    await expect(page.getByTestId("journal-handshake-sharing-box")).toBeVisible();
  }
);

When(
  "in the portal UI client toggles off diary sharing and submits a private diary entry titled {string} with mood {int}",
  async function (this: FrontendBddWorld, title: string, mood: number) {
    const page = requirePage(this);
    await setCheckbox(page.getByTestId("input-journal-shared"), false);
    await page.getByTestId("input-journal-title").fill(title);
    await page
      .getByTestId("input-journal-content")
      .fill("Privat dagbogsnotat uden deling med behandler.");
    await fillOrSelect(page.getByTestId("input-journal-mood"), String(mood));
    await page.getByTestId("submit-journal").click();
  }
);

Then(
  "the journal list in the UI should contain {string}",
  async function (this: FrontendBddWorld, title: string) {
    const page = requirePage(this);
    await expect(page.getByTestId("journal-list")).toContainText(title);
  }
);

Then(
  "the visual snapshot {string} of the journal workspace should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    await expect(page.getByTestId("journal-list")).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      fullPage: false,
      mask: [page.getByTestId("journal-list"), page.getByTestId("user-menu-trigger")],
    });
  }
);

When(
  "in the portal UI client shares a diary entry titled {string} with therapist {string} and mood {int}",
  async function (
    this: FrontendBddWorld,
    title: string,
    therapistName: string,
    mood: number
  ) {
    const page = requirePage(this);
    await page.getByTestId("input-journal-title").fill(title);
    await page
      .getByTestId("input-journal-content")
      .fill("Delt refleksion via aktivt samtykke-handshake.");
    await fillOrSelect(page.getByTestId("input-journal-mood"), String(mood));
    await setCheckbox(page.getByTestId("input-journal-shared"), true);

    const shareBox = page.getByTestId("journal-handshake-sharing-box");
    await expect(shareBox).toBeVisible();

    const therapist = this.usersByLogicalName.get(therapistName);
    const checkboxes = shareBox.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count > 0) {
      let checkedSpecific = false;
      for (let i = 0; i < count; i++) {
        const cb = checkboxes.nth(i);
        const labelText = await cb
          .locator("xpath=ancestor::label[1]")
          .innerText()
          .catch(() => "");
        if (
          therapist &&
          (labelText.includes(therapist.fullName) ||
            labelText.includes(therapistName))
        ) {
          await setCheckbox(cb, true);
          checkedSpecific = true;
          break;
        }
      }
      if (!checkedSpecific) {
        await setCheckbox(checkboxes.first(), true);
      }
    }

    await page.getByTestId("submit-journal").click();
  }
);

When(
  "in the portal UI therapist activates timeline zoom preset {string}",
  async function (this: FrontendBddWorld, preset: string) {
    const page = requirePage(this);
    const btn = page.getByTestId(`zoom-preset-${preset.toLowerCase()}`);
    await expect(btn).toBeVisible();
    await btn.click();
  }
);

Then(
  "element {string} should reflect zoom tier {string} and match visual snapshot {string}",
  async function (
    this: FrontendBddWorld,
    badgeTestId: string,
    tier: string,
    snapName: string
  ) {
    const page = requirePage(this);
    const badge = page.getByTestId(badgeTestId);
    await expect(badge).toBeVisible();
    const tierPattern = new RegExp(tier.replace(/c/gi, "[ck]"), "i");
    await expect(badge).toContainText(tierPattern);
    const container = page.getByTestId("patient-timeline-container");
    await expect(container).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: container,
      mask: [page.getByTestId("timeline-client-select")],
    });
  }
);

When(
  "in the portal UI therapist filters timeline by {string} then {string} then {string}",
  async function (this: FrontendBddWorld, f1: string, f2: string, f3: string) {
    const page = requirePage(this);
    for (const filterName of [f1, f2, f3]) {
      const btn = page.getByTestId(
        `timeline-filter-${filterName.toLowerCase()}`
      );
      await expect(btn).toBeVisible();
      await btn.click();
    }
  }
);

When(
  "in the portal UI therapist opens the first timeline event card at {string} zoom",
  async function (this: FrontendBddWorld, preset: string) {
    const page = requirePage(this);
    await page.getByTestId(`zoom-preset-${preset.toLowerCase()}`).click();
    const firstCard = page
      .locator('[data-testid^="timeline-event-card-"]')
      .first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.getByTestId("journal-detail-inspector")).toBeVisible();
  }
);

When(
  "in the portal UI therapist closes {string}",
  async function (this: FrontendBddWorld, closeTestId: string) {
    const page = requirePage(this);
    await page.getByTestId(closeTestId).click();
  }
);

Then(
  "element {string} should be hidden",
  async function (this: FrontendBddWorld, testId: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(testId)).toBeHidden();
  }
);

When(
  "in the portal UI therapist zooms via keyboard {string} three times and {string} once on {string}",
  async function (
    this: FrontendBddWorld,
    key1: string,
    key2: string,
    trackTestId: string
  ) {
    const page = requirePage(this);
    const state = getUiState(this);
    const readout = page.getByTestId("zoom-percentage-value");
    await expect(readout).toBeVisible();
    state.lastZoomPercentageBefore = (await readout.innerText()).trim();

    const track = page.getByTestId(trackTestId);
    await expect(track).toBeVisible();
    await track.focus();
    await track.press(key1);
    await track.press(key1);
    await track.press(key1);
    await track.press(key2);
  }
);

Then(
  "the zoom percentage readout {string} should update accordingly",
  async function (this: FrontendBddWorld, readoutTestId: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    const readout = page.getByTestId(readoutTestId);
    await expect(readout).toContainText("%");
    if (state.lastZoomPercentageBefore) {
      await expect(readout).not.toHaveText(state.lastZoomPercentageBefore);
    }
  }
);

// ============================================================================
// 6. appointment.feature (@ui-only @ui)
// ============================================================================

When(
  "in the portal UI client opens Timefold AI slot assistant, fetches slots, and applies the recommended slot with 60-minute chip",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);

    const therapistSelect = page.getByTestId("select-therapist");
    if ((await therapistSelect.count()) > 0 && !(await therapistSelect.inputValue())) {
      await selectMatchingOrFirstOption(therapistSelect, []);
    }
    const serviceSelect = page.getByTestId("select-service");
    if ((await serviceSelect.count()) > 0 && !(await serviceSelect.inputValue())) {
      await selectMatchingOrFirstOption(serviceSelect, []);
    }

    await page.getByTestId("toggle-timefold-panel").click();
    await expect(page.getByTestId("timefold-panel")).toBeVisible();
    await page.getByTestId("fetch-timefold-slots").click();

    const applyBtn = page.getByTestId("apply-recommended-slot");
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    await expect(page.getByTestId("input-endTime")).not.toHaveValue("");
  }
);

Then(
  "the visual snapshot {string} of the appointment booking form should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const form = page
      .locator("form")
      .filter({ has: page.getByTestId("submit-booking") })
      .first();
    await expect(form).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: form,
      mask: [
        page.getByTestId("select-therapist"),
        page.getByTestId("select-service"),
        page.getByTestId("input-clientName"),
        page.getByTestId("display-startTime"),
        page.getByTestId("display-endTime"),
        page.getByTestId("booking-calendar"),
        page.getByTestId("booking-timefold-slots"),
        page.getByTestId("timefold-panel"),
      ],
    });
  }
);

When(
  "in the portal UI client submits the appointment form titled {string} for therapist {string}",
  async function (this: FrontendBddWorld, title: string, therapistName: string) {
    const page = requirePage(this);
    const state = getUiState(this);
    state.lastCreatedAppointmentTitle = title;

    const therapist = this.usersByLogicalName.get(therapistName);
    await selectMatchingOrFirstOption(page.getByTestId("select-therapist"), [
      therapist?.id ?? "",
      therapist?.fullName ?? "",
      therapistName,
    ]);
    await expect(page.getByTestId("select-service")).toBeEnabled();
    await selectMatchingOrFirstOption(page.getByTestId("select-service"), []);

    if (!(await page.getByTestId("input-startTime").inputValue())) {
      const firstAvailableSlot = page
        .getByTestId("booking-timefold-slots")
        .locator('button[data-testid^="booking-slot-"]:not(:disabled)')
        .first();
      if ((await firstAvailableSlot.count()) > 0) {
        await firstAvailableSlot.click();
      }
    }

    const clientNameInput = page.getByTestId("input-clientName");
    if ((await clientNameInput.count()) > 0 && !(await clientNameInput.inputValue())) {
      await clientNameInput.fill(this.currentIdentity?.name || "UI Test Client");
    }

    await page.getByTestId("input-title").fill(title);
    await page.getByTestId("submit-booking").click();
    await expect(page.getByTestId("input-startTime")).toHaveValue("");
    await expect(page.getByTestId("input-title")).not.toHaveValue(title);
  }
);

Then(
  "the appointment list in the UI should contain {string}",
  async function (this: FrontendBddWorld, title: string) {
    const page = requirePage(this);
    if ((await page.getByTestId("booking-pagination").count()) > 0) {
      await page.getByTestId("filter-appointment-search").fill(title);
    }
    await expect(page.getByTestId("booking-list")).toContainText(title);
  }
);

When(
  "in the portal UI the user expands booking history for that appointment",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    const list = page.getByTestId("booking-list");
    await expect(list).toBeVisible();

    const targetApptId = this.lastAppointmentId;
    let historyBtn = targetApptId
      ? page.getByTestId(`git-history-btn-${targetApptId}`)
      : null;

    if (targetApptId && historyBtn) {
      for (let pageIdx = 0; pageIdx < 30; pageIdx++) {
        if ((await historyBtn.count()) > 0) break;
        const nextBtn = page.getByTestId("booking-next-page");
        if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) break;
        await nextBtn.click();
      }
    } else {
      if (
        state.lastCreatedAppointmentTitle &&
        (await page.getByTestId("booking-pagination").count()) > 0
      ) {
        await page
          .getByTestId("filter-appointment-search")
          .fill(state.lastCreatedAppointmentTitle);
      }
      const matchingRow = state.lastCreatedAppointmentTitle
        ? list
            .locator(":scope > *")
            .filter({ hasText: state.lastCreatedAppointmentTitle })
            .first()
        : list;
      historyBtn = matchingRow
        .locator('[data-testid^="git-history-btn-"]')
        .first();
    }

    await expect(historyBtn).toBeVisible();

    const btnTestId = await historyBtn.getAttribute("data-testid");
    const apptId = btnTestId?.replace("git-history-btn-", "") ?? "";
    state.lastUiAppointmentId = apptId || null;

    await historyBtn.click();
    const historyPanel = apptId
      ? page.getByTestId(`git-history-panel-${apptId}`)
      : page.locator('[data-testid^="git-history-panel-"]').first();
    await expect(historyPanel).toBeVisible();
    await expect(historyPanel.locator("ul li").first()).toBeVisible();
  }
);

Then(
  "the human-readable git history panel should be visible and technical SHA details should be absent",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    const apptId = state.lastUiAppointmentId;
    if (apptId) {
      await expect(page.getByTestId(`git-history-panel-${apptId}`)).toBeVisible();
      await expect(
        page.getByTestId(`technical-audit-history-${apptId}`)
      ).toHaveCount(0);
    } else {
      await expect(
        page.locator('[data-testid^="git-history-panel-"]').first()
      ).toBeVisible();
      await expect(
        page.locator('[data-testid^="technical-audit-history-"]')
      ).toHaveCount(0);
    }
  }
);

When(
  "in the portal UI therapist opens the weekly schedule panel and saves weekly availability",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("toggle-weekly-schedule").click();
    await expect(page.getByTestId("weekly-schedule-panel")).toBeVisible();
    await page.getByTestId("save-weekly-schedule").click();
    await expect(page.getByTestId("weekly-schedule-saved")).toBeVisible();
  }
);

Then(
  "the visual snapshot {string} of the weekly schedule panel should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const panel = page.getByTestId("weekly-schedule-panel");
    await expect(panel).toBeVisible();
    await assertVisualSnapshot(this, snapName, { locator: panel });
  }
);

Then(
  "the therapist technical audit history details should be visible and expandable",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const state = getUiState(this);
    const apptId = state.lastUiAppointmentId;
    const technicalDetails = apptId
      ? page.getByTestId(`technical-audit-history-${apptId}`)
      : page.locator('[data-testid^="technical-audit-history-"]').first();

    await expect(technicalDetails).toBeVisible();
    await technicalDetails.locator("summary").first().click();
    await expect(technicalDetails).toHaveAttribute("open", "");
  }
);

// ============================================================================
// 7. psychotraumatology.feature (@ui-only @ui)
// ============================================================================

When(
  "in the portal UI client selects option {int} on PCL-5 question {int} and advances to the next cluster",
  async function (this: FrontendBddWorld, optionVal: number, questionNumber: number) {
    const page = requirePage(this);
    await page.getByTestId(`pcl5-q-${questionNumber}-opt-${optionVal}`).click();
    await page.getByTestId("pcl5-next-cluster").click();
  }
);

Then(
  "element {string} should report progress {int} and cluster tab {string} should be active",
  async function (
    this: FrontendBddWorld,
    progressBarTestId: string,
    expectedProgress: number,
    clusterTabTestId: string
  ) {
    const page = requirePage(this);
    await expect(page.getByTestId(progressBarTestId)).toHaveAttribute(
      "aria-valuenow",
      String(expectedProgress)
    );
    const tab = page.getByTestId(clusterTabTestId);
    await expect(tab).toBeVisible();
    await expect
      .poll(async () => {
        const selected = await tab.getAttribute("aria-selected");
        const pressed = await tab.getAttribute("aria-pressed");
        const current = await tab.getAttribute("aria-current");
        const cls = (await tab.getAttribute("class")) ?? "";
        return (
          selected === "true" ||
          pressed === "true" ||
          Boolean(current) ||
          cls.includes("bg-teal-700")
        );
      })
      .toBe(true);
  }
);

Then(
  "the visual snapshot {string} of the PCL-5 form should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const form = page.getByTestId("psychotraumatology-form");
    await expect(form).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: form,
      mask: [
        page.getByTestId("select-pcl5-client"),
        page.getByTestId("input-clientUuid"),
      ],
    });
  }
);

When(
  "in the portal UI client completes all 20 PCL-5 items with Likert value {int} and submits",
  async function (this: FrontendBddWorld, likertValue: number) {
    const page = requirePage(this);
    const clusters = [
      { tab: 0, start: 0, count: 5 },
      { tab: 1, start: 5, count: 2 },
      { tab: 2, start: 7, count: 7 },
      { tab: 3, start: 14, count: 6 },
    ];
    for (const cluster of clusters) {
      await page.getByTestId(`pcl5-cluster-tab-${cluster.tab}`).click();
      for (let q = cluster.start; q < cluster.start + cluster.count; q++) {
        await page.getByTestId(`pcl5-q-${q}-opt-${likertValue}`).click();
      }
    }
    await page.getByTestId("submit-psychotraumatology").click();
  }
);

Then(
  "the PCL-5 results list in the UI should contain score {int}",
  async function (this: FrontendBddWorld, expectedScore: number) {
    const page = requirePage(this);
    await expect(page.getByTestId("psychotraumatology-list")).toContainText(
      String(expectedScore)
    );
  }
);

When(
  "in the portal UI therapist switches to manual PCL-5 quick-entry mode for client {string}",
  async function (this: FrontendBddWorld, clientName: string) {
    const page = requirePage(this);
    await page.getByTestId("toggle-manual-score-mode").click();
    await expect(page.getByTestId("input-score")).toBeVisible();

    const client = this.usersByLogicalName.get(clientName);
    const selectClient = page.getByTestId("select-pcl5-client");
    if ((await selectClient.count()) > 0 && (await selectClient.isVisible())) {
      const matched = await selectClient.evaluate(
        (el, target) => {
          const select = el as HTMLSelectElement;
          for (const opt of Array.from(select.options)) {
            if (
              (target.id && opt.value.includes(target.id)) ||
              (target.email && opt.text.includes(target.email)) ||
              (target.fullName && opt.text.includes(target.fullName))
            ) {
              return opt.value;
            }
          }
          return null;
        },
        {
          id: client?.id ?? "",
          email: client?.email ?? "",
          fullName: client?.fullName ?? clientName,
        }
      );

      if (matched) {
        await selectClient.selectOption(matched);
      } else {
        await selectClient.selectOption("__manual__");
      }
    }

    const manualUuidInput = page.getByTestId("input-clientUuid");
    if ((await manualUuidInput.count()) > 0 && (await manualUuidInput.isVisible())) {
      if (!client?.id) {
        throw new Error(`Client ${clientName} UUID missing in scenario.`);
      }
      await manualUuidInput.fill(client.id);
    }
  }
);

When(
  "in the portal UI therapist enters manual PCL-5 score {string} and submits",
  async function (this: FrontendBddWorld, scoreStr: string) {
    const page = requirePage(this);
    await page.getByTestId("input-score").fill(scoreStr);
    await page.getByTestId("submit-psychotraumatology").click();
  }
);

// ============================================================================
// 8. finance.feature (@ui-only @ui)
// ============================================================================

Then(
  "element {string} should be visible while {string} is hidden for clients",
  async function (this: FrontendBddWorld, visibleId: string, hiddenId: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(visibleId)).toBeVisible();
    await expect(page.getByTestId(hiddenId)).toBeHidden();
    await this.assertPageHealthy();
  }
);

Then(
  "the visual snapshot {string} of the finance workspace should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const view = page.getByTestId("finance-feature-view");
    await expect(view).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: view,
      mask: [
        page.getByTestId("client-clips-balance"),
        page.getByTestId("client-subscriptions-count"),
        page.getByTestId("client-invoices-count"),
        page.getByTestId("client-invoice-list"),
      ],
    });
  }
);

When(
  "in the portal UI client expands {string}",
  async function (this: FrontendBddWorld, toggleTestId: string) {
    const page = requirePage(this);
    const toggle = page.getByTestId(toggleTestId);
    await expect(toggle).toBeVisible();
    await toggle.click();
  }
);

Then(
  "buttons {string} and {string} should be visible",
  async function (this: FrontendBddWorld, btn1: string, btn2: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(btn1)).toBeVisible();
    await expect(page.getByTestId(btn2)).toBeVisible();
  }
);

When(
  "in the portal UI client opens checkout modal via {string}",
  async function (this: FrontendBddWorld, btnTestId: string) {
    const page = requirePage(this);
    await page.getByTestId(btnTestId).click();
    await expect(page.getByTestId("vipps-checkout-modal")).toBeVisible();
  }
);

Then(
  "element {string} should be visible without {string}",
  async function (this: FrontendBddWorld, visibleId: string, hiddenId: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(visibleId)).toBeVisible();
    await expect(page.getByTestId(hiddenId)).toBeHidden();
  }
);

Then(
  "the visual snapshot {string} of element {string} should match baseline",
  async function (this: FrontendBddWorld, snapName: string, elementTestId: string) {
    const page = requirePage(this);
    const el = page.getByTestId(elementTestId);
    await expect(el).toBeVisible();
    const target =
      elementTestId === "vipps-checkout-modal" ? el.locator("form").first() : el;
    await assertVisualSnapshot(this, snapName, { locator: target });
  }
);

When(
  "in the portal UI client submits MobilePay checkout with phone {string}",
  async function (this: FrontendBddWorld, phoneNumber: string) {
    const page = requirePage(this);
    const mpRadio = page.getByTestId("select-method-mobilepay");
    if ((await mpRadio.count()) > 0 && (await mpRadio.isVisible())) {
      await mpRadio.click();
    }
    await page.getByTestId("input-vipps-phone").fill(phoneNumber);
    await page.getByTestId("btn-confirm-vipps-checkout").click();
    await expect(page.getByTestId("vipps-checkout-modal")).toBeHidden();
  }
);

Then(
  "element {string} should be visible and clip balance should be {int}",
  async function (this: FrontendBddWorld, receiptTestId: string, expectedClips: number) {
    const page = requirePage(this);
    await expect(page.getByTestId(receiptTestId)).toBeVisible();
    await expect(page.getByTestId("client-clips-balance")).toContainText(
      String(expectedClips)
    );
  }
);

Then(
  "client prepaid clip balance in the UI should decrease to {int}",
  async function (this: FrontendBddWorld, expectedClips: number) {
    const page = requirePage(this);
    await expect(page.getByTestId("client-clips-balance")).toContainText(
      String(expectedClips)
    );
  }
);

When(
  "in the portal UI client opens checkout modal via {string} and switches to card payment",
  async function (this: FrontendBddWorld, btnTestId: string) {
    const page = requirePage(this);
    await page.getByTestId(btnTestId).click();
    await expect(page.getByTestId("vipps-checkout-modal")).toBeVisible();
    await page.getByTestId("select-method-card").click();
    await expect(page.getByTestId("input-card-number")).toBeVisible();
  }
);

Then(
  "the visual snapshot {string} of the card checkout modal should match baseline",
  async function (this: FrontendBddWorld, snapName: string) {
    const page = requirePage(this);
    const modal = page.getByTestId("vipps-checkout-modal");
    await expect(modal).toBeVisible();
    await assertVisualSnapshot(this, snapName, {
      locator: modal.locator("form").first(),
      mask: [page.getByTestId("input-card-holder")],
    });
  }
);

When(
  "in the portal UI client submits tokenized credit card checkout",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    await page.getByTestId("input-card-holder").fill("Test Klient");
    await page.getByTestId("input-card-number").fill("4571000011112222");
    await page.getByTestId("input-card-expiry").fill("12/28");
    await page.getByTestId("input-card-cvc").fill("123");
    await page.getByTestId("btn-confirm-vipps-checkout").click();
    await expect(page.getByTestId("vipps-checkout-modal")).toBeHidden();
  }
);

Then(
  "element {string} should contain {string}",
  async function (this: FrontendBddWorld, testId: string, expectedText: string) {
    const page = requirePage(this);
    await expect(page.getByTestId(testId)).toContainText(expectedText);
  }
);

When(
  "in the portal UI therapist expands {string} and opens {string}",
  async function (
    this: FrontendBddWorld,
    toggleTestId: string,
    btnTestId: string
  ) {
    const page = requirePage(this);
    await page.getByTestId(toggleTestId).click();
    const btn = page.getByTestId(btnTestId);
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("vipps-checkout-modal")).toBeVisible();
  }
);

When(
  "in the portal UI therapist expands checkout payout routing details",
  async function (this: FrontendBddWorld) {
    const page = requirePage(this);
    const routing = page.getByTestId("checkout-payout-routing");
    await expect(routing).toBeVisible();
    await routing.locator("summary").first().click();
    await expect(routing).toHaveAttribute("open", "");
  }
);

Then(
  "element {string} should display IBAN {string} and MSN {string}",
  async function (
    this: FrontendBddWorld,
    routingTestId: string,
    iban: string,
    msn: string
  ) {
    const page = requirePage(this);
    const el = page.getByTestId(routingTestId);
    await expect(el).toBeVisible();
    await expect(el).toContainText(iban);
    await expect(el).toContainText(msn);
  }
);
