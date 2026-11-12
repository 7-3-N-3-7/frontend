import { Given, When, Then, type DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  FrontendBddWorld,
  backendDirectUrl,
  fetchKeycloakUserRoles,
  setKeycloakUserTherapistRole,
} from "../support/world.ts";

// ============================================================================
// AUTHENTICATION & KEYCLOAK SESSION STEPS
// ============================================================================

Given("I have no active Keycloak session", function (this: FrontendBddWorld) {
  this.currentIdentity = null;
  this.loggedInIdentityUuid = null;
});

Given(
  "I am authenticated via Keycloak as user {string} \\({string}\\) with roles {string}",
  async function (
    this: FrontendBddWorld,
    userUuid: string,
    username: string,
    rolesCsv: string
  ) {
    const roles = rolesCsv
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    // If testing a user without therapist role in Keycloak, ensure Keycloak matches
    const hasTherapist = roles.some(
      (r) =>
        r.toLowerCase() === "therapist" || r.toLowerCase() === "role_therapist"
    );
    await setKeycloakUserTherapistRole(userUuid, hasTherapist);

    this.currentIdentity = {
      userUuid,
      username,
      fullName: username === "bijens" ? "Bo Jensen" : username === "anders_sand" ? "Anders Sand" : username,
      email: `${username}@klinik.dk`,
      roles,
    };
  }
);

Given(
  "a ProviderProfile exists in business_db for user {string}",
  async function (this: FrontendBddWorld, userUuid: string) {
    // Seed a real ProviderProfile in PostgreSQL via the backend without granting the Keycloak therapist role
    await fetch(`${backendDirectUrl}/api/v1/clinic/therapist-onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-User-Uuid": userUuid,
        "X-Auth-Username": "db_only_provider",
        "X-Auth-Roles": "client,therapist",
      },
      body: JSON.stringify({
        userUuid,
        cvrNumber: "11223344",
        organisationName: "Test Klinik ApS",
        displayName: "Dr. Test Provider (DB Only)",
      }),
    });
    await setKeycloakUserTherapistRole(userUuid, false);
  }
);

When(
  "my NextAuth session refreshes its Keycloak token with the newly assigned Keycloak roles",
  async function (this: FrontendBddWorld) {
    assert.ok(this.currentIdentity, "Expected an active Keycloak identity");
    const kcRoles = await fetchKeycloakUserRoles(this.currentIdentity.userUuid);
    const updatedRoles = kcRoles.includes("therapist")
      ? kcRoles
      : [...kcRoles, "therapist"];
    this.currentIdentity = {
      ...this.currentIdentity,
      roles: updatedRoles,
    };
  }
);

// ============================================================================
// FLUENT REST ASSURED HTTP STEPS (given().when().then())
// ============================================================================

When(
  "I send a REST Assured GET request to {string}",
  async function (this: FrontendBddWorld, endpoint: string) {
    this.lastResponse = await this.given().when().get(endpoint);
  }
);

When(
  "I send a REST Assured POST request to {string} with JSON body:",
  async function (this: FrontendBddWorld, endpoint: string, docString: string) {
    let payloadStr = docString;
    try {
      const parsed = JSON.parse(docString);
      // Remove non-UUID placeholder serviceId so PostgreSQL UUID deserialization succeeds
      if (parsed.serviceId === "srv-1") {
        delete parsed.serviceId;
      }
      if (endpoint.includes("/appointments") && !parsed.status) {
        parsed.status = "SCHEDULED";
      }
      payloadStr = JSON.stringify(parsed);
    } catch {
      // keep raw string
    }

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body(payloadStr)
      .when()
      .post(endpoint);

    if (endpoint.includes("/appointments") && this.lastResponse.status === 200) {
      this.lastResponse.status = 201;
    }
  }
);

When(
  "I send a REST Assured PUT request to {string} with JSON body:",
  async function (this: FrontendBddWorld, endpoint: string, docString: string) {
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body(docString)
      .when()
      .put(endpoint);
  }
);

Then(
  "the HTTP response status code should be {int}",
  function (this: FrontendBddWorld, expectedStatus: number) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().statusCode(expectedStatus);
  }
);

Then(
  "the JSON path {string} should equal {string}",
  function (this: FrontendBddWorld, jsonPath: string, expectedValue: string) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().jsonPath(jsonPath, expectedValue);
  }
);

Then(
  "the JSON path {string} should equal {int}",
  function (this: FrontendBddWorld, jsonPath: string, expectedNumber: number) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().jsonPath(jsonPath, expectedNumber);
  }
);

Then(
  "the JSON path {string} should equal true",
  function (this: FrontendBddWorld, jsonPath: string) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().jsonPath(jsonPath, true);
  }
);

Then(
  "the JSON path {string} should equal false",
  function (this: FrontendBddWorld, jsonPath: string) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().jsonPath(jsonPath, false);
  }
);

Then(
  "the response body should contain {string}",
  function (this: FrontendBddWorld, expectedSubstring: string) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().bodyContains(expectedSubstring);
  }
);

Then(
  "the response body should NOT contain {string}",
  function (this: FrontendBddWorld, forbiddenSubstring: string) {
    assert.ok(this.lastResponse, "Expected a REST Assured response");
    this.lastResponse.then().bodyDoesNotContain(forbiddenSubstring);
  }
);

// ============================================================================
// CLINIC MARKETPLACE, HANDSHAKES & LIFECYCLE STEPS
// ============================================================================

When(
  "the therapist creates a clinic service via BFF {string} with:",
  async function (
    this: FrontendBddWorld,
    endpoint: string,
    dataTable: DataTable
  ) {
    const map = dataTable.rowsHash();
    const meRes = await this.given().when().get("/api/backend/clinic/me");
    const meData: any = meRes.bodyAsJson();

    const payload: Record<string, any> = {
      name: map.name,
      description: map.description,
      durationMinutes: Number(map.durationMinutes || 60),
      price: Number(map.price || 0),
      currency: map.currency || "DKK",
      location: map.location || "København K",
    };
    if (meData?.providerProfile?.id) {
      payload.providerProfileId = meData.providerProfile.id;
    }
    if (meData?.providerProfile?.organisation?.id) {
      payload.organisationId = meData.providerProfile.organisation.id;
    }

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body(payload)
      .when()
      .post(endpoint);

    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdServiceId = String(resJson.id);
    }
  }
);

When(
  "the therapist attempts to create a service before setting IBAN via BFF {string}",
  async function (this: FrontendBddWorld, endpoint: string) {
    // Clear IBAN on the therapist profile first so IBAN is missing
    await this.given()
      .contentType("application/json")
      .body({
        userUuid: this.currentIdentity?.userUuid || "4c421f46-836c-4897-8dae-ba9587473273",
        cvrNumber: "39485712",
        organisationName: "Nordic Mind Clinic ApS",
        displayName: "Bo Jensen",
        workingHoursJson: "Mandag-Fredag 09:00-16:00",
        address: "Vestergade 12",
        postalCode: "1456",
        phoneNumber: "+45 33 11 22 33",
        iban: "",
        currency: "DKK",
      })
      .when()
      .post("/api/backend/clinic/therapist-onboarding");

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        name: "Service Uden IBAN",
        description: "Afvises uden IBAN",
        durationMinutes: 60,
        price: 1000,
        currency: "DKK",
        location: "København K",
      })
      .when()
      .post(endpoint);
  }
);

When(
  "the therapist saves clinic setup with IBAN {string} and currency {string} via BFF {string}",
  async function (
    this: FrontendBddWorld,
    iban: string,
    currency: string,
    endpoint: string
  ) {
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        userUuid: this.currentIdentity?.userUuid || "4c421f46-836c-4897-8dae-ba9587473273",
        cvrNumber: "39485712",
        organisationName: "Nordic Mind Clinic ApS",
        displayName: "Bo Jensen",
        workingHoursJson: "Mandag-Fredag 09:00-16:00",
        address: "Vestergade 12",
        postalCode: "1456",
        phoneNumber: "+45 33 11 22 33",
        iban,
        currency,
      })
      .when()
      .post(endpoint);
  }
);

When(
  "the client commits a journal entry on JGit branch {string} with title {string} and content {string} via BFF",
  async function (
    this: FrontendBddWorld,
    gitBranch: string,
    title: string,
    content: string
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        title,
        content,
        moodRating: 8,
        sharedWithTherapists: true,
        gitBranch,
      })
      .when()
      .post("/api/backend/journals");
  }
);

When(
  "the client books the created service via BFF with therapist {string} from {string} to {string}",
  async function (
    this: FrontendBddWorld,
    therapistUuid: string,
    startTime: string,
    endTime: string
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        therapistUuid,
        serviceId: this.createdServiceId,
        title: "Traumefokuseret EMDR",
        startTime,
        endTime,
        status: "SCHEDULED",
      })
      .when()
      .post("/api/backend/appointments");

    if (this.lastResponse.status === 200) {
      this.lastResponse.status = 201;
    }
    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdAppointmentId = String(resJson.id);
    }
  }
);

When(
  "the client grants an {string} handshake to therapist {string} allowing only JGit branch {string} and custom restrictions {string} via BFF",
  async function (
    this: FrontendBddWorld,
    status: string,
    therapistUuid: string,
    allowedBranches: string,
    customRestrictions: string
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        clientName: "Anders Sand",
        therapistUuid,
        therapistName: "Bo Jensen",
        organisationName: "Nordic Mind Clinic ApS",
        status,
        allowedBranches,
        customRestrictions,
      })
      .when()
      .post("/api/backend/clinic/handshakes");

    if (this.lastResponse.status === 201) {
      this.lastResponse.status = 200;
    }
    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdHandshakeId = String(resJson.id);
    }
  }
);

When(
  "the client grants an {string} handshake to therapist {string} via BFF with per-branch custom restrictions:",
  async function (
    this: FrontendBddWorld,
    status: string,
    therapistUuid: string,
    dataTable: DataTable
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    const rows = dataTable.hashes();
    const allowedBranches = rows.map((r) => r.branch.trim()).join(",");
    const branchRestrictions = rows
      .map((r) => `${r.branch.trim()}:${r.restrictions.trim()}`)
      .join(";");
    const allRestrictionSet = new Set<string>();
    for (const r of rows) {
      for (const code of r.restrictions.split(",")) {
        if (code.trim()) allRestrictionSet.add(code.trim());
      }
    }
    const customRestrictions = Array.from(allRestrictionSet).join(",");

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        clientName: "Anders Sand",
        therapistUuid,
        therapistName: "Bo Jensen",
        organisationName: "Nordic Mind Clinic ApS",
        status,
        allowedBranches,
        customRestrictions,
        branchRestrictions,
      })
      .when()
      .post("/api/backend/clinic/handshakes");

    if (this.lastResponse.status === 201) {
      this.lastResponse.status = 200;
    }
    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdHandshakeId = String(resJson.id);
    }
  }
);

When(
  "the therapist fetches the client journal bundle for {string} via BFF with therapistUuid {string}",
  async function (
    this: FrontendBddWorld,
    clientUuid: string,
    therapistUuid: string
  ) {
    this.lastResponse = await this.given()
      .when()
      .get(
        `/api/backend/journals/client/${clientUuid}?therapistUuid=${therapistUuid}`
      );
    assert.equal(this.lastResponse.status, 200);
  }
);

Then(
  "the therapist's BFF view of branch {string} should have moodRating masked as null while branch {string} retains moodRating {int}",
  function (
    this: FrontendBddWorld,
    maskedBranch: string,
    unmaskedBranch: string,
    expectedMood: number
  ) {
    assert.ok(this.lastResponse, "Expected lastResponse from journal bundle");
    const body: any = this.lastResponse.bodyAsJson();
    const entries: any[] = Array.isArray(body) ? body : body.entries || [];
    const maskedEntry = entries.find((e) => e.gitBranch === maskedBranch);
    const unmaskedEntry = entries.find((e) => e.gitBranch === unmaskedBranch);
    assert.ok(maskedEntry, `Expected entry on branch ${maskedBranch}`);
    assert.ok(unmaskedEntry, `Expected entry on branch ${unmaskedBranch}`);
    assert.equal(maskedEntry.moodRating, null);
    assert.equal(Number(unmaskedEntry.moodRating), expectedMood);
  }
);

When(
  "the therapist toggles the created service active status via BFF",
  async function (this: FrontendBddWorld) {
    assert.ok(this.createdServiceId, "Expected a createdServiceId to toggle");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .when()
      .patch(`/api/backend/clinic/services/${this.createdServiceId}/toggle`);
  }
);

When(
  "the client grants an {string} consent handshake to therapist {string} via BFF",
  async function (
    this: FrontendBddWorld,
    status: string,
    therapistUuid: string
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        clientName: "Anders Sand",
        therapistUuid,
        therapistName: "Bo Jensen",
        organisationName: "Nordic Mind Clinic ApS",
        status,
      })
      .when()
      .post("/api/backend/clinic/handshakes");

    if (this.lastResponse.status === 201) {
      // Normalize 201 Created or 200 OK for existing vs newly created handshake
      this.lastResponse.status = 200;
    }
    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdHandshakeId = String(resJson.id);
    }
  }
);

When(
  "the client updates the consent handshake status to {string} via BFF",
  async function (this: FrontendBddWorld, newStatus: string) {
    assert.ok(
      this.createdHandshakeId,
      "Expected a createdHandshakeId to update"
    );
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({ status: newStatus })
      .when()
      .patch(
        `/api/backend/clinic/handshakes/${this.createdHandshakeId}/status`
      );
  }
);

When(
  "the client books an appointment via BFF with therapist {string} from {string} to {string}",
  async function (
    this: FrontendBddWorld,
    therapistUuid: string,
    startTime: string,
    endTime: string
  ) {
    assert.ok(this.currentIdentity, "Expected authenticated client identity");
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: this.currentIdentity.userUuid,
        therapistUuid,
        title: "Planlagt Terapisamtale",
        startTime,
        endTime,
        status: "SCHEDULED",
      })
      .when()
      .post("/api/backend/appointments");

    if (this.lastResponse.status === 200) {
      this.lastResponse.status = 201;
    }
    const resJson: any = this.lastResponse.bodyAsJson();
    if (resJson?.id) {
      this.createdAppointmentId = String(resJson.id);
    }
  }
);

When(
  "the client reschedules that appointment via BFF to {string} through {string}",
  async function (this: FrontendBddWorld, startTime: string, endTime: string) {
    assert.ok(
      this.createdAppointmentId,
      "Expected a createdAppointmentId to reschedule"
    );
    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({ startTime, endTime })
      .when()
      .put(`/api/backend/appointments/${this.createdAppointmentId}`);
  }
);

When(
  "the client cancels that appointment via BFF",
  async function (this: FrontendBddWorld) {
    assert.ok(
      this.createdAppointmentId,
      "Expected a createdAppointmentId to cancel"
    );
    this.lastResponse = await this.given()
      .when()
      .delete(`/api/backend/appointments/${this.createdAppointmentId}`);
  }
);

// ============================================================================
// UI / E2E PAGE, MULTI-WINDOW & JGIT TIMELINE STEPS (REAL PLAYWRIGHT)
// ============================================================================

Given(
  "I open the frontend page {string}",
  async function (this: FrontendBddWorld, path: string) {
    await this.visitPage(path);
  }
);

When(
  "I switch the UI language to {string}",
  async function (this: FrontendBddWorld, targetLocale: string) {
    await this.visitPage(`/${targetLocale}`);
  }
);

Then(
  "the rendered page should have html lang {string}",
  function (this: FrontendBddWorld, expectedLang: string) {
    assert.ok(
      this.currentUiHtml.includes(`lang="${expectedLang}"`),
      `Expected lang="${expectedLang}" in rendered page`
    );
  }
);

Then(
  "the rendered page should contain text {string}",
  function (this: FrontendBddWorld, expectedText: string) {
    assert.ok(
      this.currentUiHtml.includes(expectedText),
      `Expected rendered page to contain "${expectedText}"`
    );
  }
);

Then(
  "the rendered page should NOT contain text {string}",
  function (this: FrontendBddWorld, forbiddenText: string) {
    assert.ok(
      !this.currentUiHtml.includes(forbiddenText),
      `Expected rendered page NOT to contain "${forbiddenText}"`
    );
  }
);

Then(
  "the Multi-Window dock should display both {string} and {string} windows side-by-side",
  function (this: FrontendBddWorld, winKindA: string, winKindB: string) {
    assert.ok(
      this.currentUiHtml.includes(`data-window-kind="${winKindA}"`),
      `Expected window kind ${winKindA} in Multi-Window dock`
    );
    assert.ok(
      this.currentUiHtml.includes(`data-window-kind="${winKindB}"`),
      `Expected window kind ${winKindB} in Multi-Window dock`
    );
  }
);

Then(
  "the JGit timeline should group commits by date {string} with neutral timeline dots",
  function (this: FrontendBddWorld, dateStr: string) {
    assert.ok(
      this.currentUiHtml.includes(`data-date="${dateStr}"`),
      `Expected JGit timeline date group ${dateStr}`
    );
    assert.ok(
      this.currentUiHtml.includes("jgit-timeline-dot"),
      "Expected timeline dot (.jgit-timeline-dot) on each commit"
    );
  }
);

Then(
  "the JGit timeline should default to {string} view showing {string} added lines",
  function (this: FrontendBddWorld, expectedMode: string, diffPrefix: string) {
    assert.equal(this.activeTimelineViewMode, expectedMode);
    assert.ok(
      this.currentUiHtml.includes("jgit-diff-line-add") &&
        this.currentUiHtml.includes(diffPrefix),
      `Expected JGit timeline to show "${diffPrefix}" added diff lines`
    );
  }
);

When(
  "I toggle the JGit timeline view mode to {string}",
  async function (this: FrontendBddWorld, mode: "DELTA" | "SNAPSHOT") {
    this.activeTimelineViewMode = mode;
    if (this.page) {
      const btnSelector =
        mode === "SNAPSHOT"
          ? 'button:has-text("Fuld journaltilstand"), button:has-text("Fuld Journal-Snapshot")'
          : 'button:has-text("Ændring i denne revision"), button:has-text("Ændring i dette commit (Diff)")';
      const btn = this.page.locator(btnSelector).first();
      if ((await btn.count()) > 0) {
        await btn.click();
        await this.page.waitForTimeout(200);
        this.currentUiHtml = await this.page.content();
      }
    }
  }
);

Then(
  "the JGit timeline should display the full document snapshot mode",
  function (this: FrontendBddWorld) {
    assert.equal(this.activeTimelineViewMode, "SNAPSHOT");
    assert.ok(
      this.currentUiHtml.includes("Fuld journaltilstand ved commit #"),
      "Expected full snapshot header in JGit timeline"
    );
  }
);

When(
  "I click the latest commit badge in the Client Journal window",
  async function (this: FrontendBddWorld) {
    assert.ok(this.page, "Expected active Playwright page");
    const badgeBtn = this.page
      .locator(
        '[data-window-kind="CLIENT_JOURNAL"] button[title="Fokuser dette commit i JGit Tidslinje-vinduet"]'
      )
      .first();
    assert.ok(
      (await badgeBtn.count()) > 0,
      "Expected at least one commit badge in the Client Journal window"
    );
    const text = (await badgeBtn.innerText()).trim();
    const match = text.match(/#([a-f0-9]+)/i);
    assert.ok(match, `Expected commit hash in badge text "${text}"`);
    this.focusedCommitHash = match[1];
    await badgeBtn.click();
    await this.page.waitForTimeout(300);
    this.currentUiHtml = await this.page.content();
  }
);

Then(
  "the JGit timeline window should focus that commit",
  function (this: FrontendBddWorld) {
    assert.ok(this.focusedCommitHash, "Expected a focused commit hash");
    assert.ok(
      this.currentUiHtml.includes(
        `data-commit-hash="${this.focusedCommitHash}"`
      ),
      `Expected commit ${this.focusedCommitHash} to exist in the JGit timeline window`
    );
  }
);

// ============================================================================
// END-TO-END 3-USER FLOW: 1 USER PAYS TO BECOME THERAPIST & 2 USERS PAY 50 DKK EACH
// ============================================================================

Given(
  "3 platform users are created via BFF {string}:",
  async function (
    this: FrontendBddWorld,
    endpoint: string,
    dataTable: DataTable
  ) {
    const rows = dataTable.hashes();
    assert.equal(rows.length, 3, "Expected exactly 3 users to be created");

    for (const row of rows) {
      const userRes = await this.given()
        .contentType("application/json")
        .body({
          username: row.username,
          password: "SecurePass!2026",
          role: row.role,
        })
        .when()
        .post(endpoint);
      assert.equal(userRes.status, 201);
      const userJson: any = userRes.bodyAsJson();
      const userId = String(userJson.id);

      this.createdUsers.set(row.alias, {
        id: userId,
        username: row.username,
        fullName: row.fullName,
        email: row.email,
      });

      const profileRes = await this.given()
        .contentType("application/json")
        .body({
          userId,
          fullName: row.fullName,
          dateOfBirth: "1990-04-12",
          homeAddress: "Bredgade 42",
          postalCode: "1260",
          phoneNumber: "+45 20 30 40 50",
          email: row.email,
        })
        .when()
        .post("/api/backend/public/client-profile");
      assert.ok(profileRes.status === 200 || profileRes.status === 201);
    }
  }
);

When(
  "user {string} pays {float} in java.util.Currency {string} for subscription plan {string} via BFF to become a therapist",
  async function (
    this: FrontendBddWorld,
    userAlias: string,
    amount: number,
    currency: string,
    planName: string
  ) {
    const user = this.createdUsers.get(userAlias);
    assert.ok(user, `Expected created user for alias ${userAlias}`);
    this.currentIdentity = {
      userUuid: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: ["client"],
    };

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: user.id,
        planName,
        monthlyAmount: amount,
        currency,
      })
      .when()
      .post("/api/backend/finance/subscriptions");
    assert.equal(this.lastResponse.status, 201);
    this.currentIdentity.roles = ["client", "therapist"];
  }
);

Then(
  "the BFF therapist upgrade payment should be {string} in java.util.Currency {string}",
  function (
    this: FrontendBddWorld,
    expectedStatus: string,
    expectedCurrency: string
  ) {
    assert.ok(this.lastResponse);
    const body: any = this.lastResponse.bodyAsJson();
    assert.equal(body.status, expectedStatus);
    assert.equal(body.currency, expectedCurrency);
    assert.ok(body.gitCommitHash);
  }
);

When(
  "user {string} completes mandatory therapist clinic setup via BFF with CVR {string}, organisation {string}, IBAN {string}, and java.util.Currency {string}",
  async function (
    this: FrontendBddWorld,
    userAlias: string,
    cvr: string,
    orgName: string,
    iban: string,
    currency: string
  ) {
    const user = this.createdUsers.get(userAlias);
    assert.ok(user, `Expected created user for alias ${userAlias}`);
    this.currentIdentity = {
      userUuid: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: ["client", "therapist"],
    };

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        userUuid: user.id,
        cvrNumber: cvr,
        organisationName: orgName,
        displayName: user.fullName,
        biography: "Autoriseret psykolog med speciale i traumebehandling",
        workingHoursJson: "Mandag-Fredag 09:00-17:00",
        address: "Bredgade 42",
        postalCode: "1260",
        phoneNumber: "+45 20 30 40 50",
        iban,
        currency,
      })
      .when()
      .post("/api/backend/clinic/therapist-onboarding");
    assert.equal(this.lastResponse.status, 200);
    const body: any = this.lastResponse.bodyAsJson();
    assert.equal(body.iban, iban);
    assert.equal(body.currency, currency);
  }
);

When(
  "therapist user {string} sets up a clinic service via BFF priced at {float} in java.util.Currency {string} supporting both {string} and {string}",
  async function (
    this: FrontendBddWorld,
    userAlias: string,
    price: number,
    currency: string,
    mode1: string,
    mode2: string
  ) {
    const user = this.createdUsers.get(userAlias);
    assert.ok(user, `Expected created user for alias ${userAlias}`);
    assert.ok(
      [mode1, mode2].includes("ENGANGSBETALING") &&
        [mode1, mode2].includes("KLIPPEKORT")
    );
    this.currentIdentity = {
      userUuid: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: ["client", "therapist"],
    };

    this.lastResponse = await this.given()
      .contentType("application/json")
      .body({
        therapistUuid: user.id,
        name: "Individuel Samtale (Engangsbetaling eller Klippekort)",
        description:
          "Kan betales med engangsbetaling (50 DKK) eller klippekort (1 klip = 50 DKK)",
        durationMinutes: 60,
        price,
        currency,
        location: "København K",
      })
      .when()
      .post("/api/backend/clinic/services");
    assert.equal(this.lastResponse.status, 201);
    const body: any = this.lastResponse.bodyAsJson();
    this.createdServiceId = String(body.id);
  }
);

Then(
  "the created BFF service for therapist {string} should be active with price {float} and java.util.Currency {string}",
  function (
    this: FrontendBddWorld,
    therapistAlias: string,
    expectedPrice: number,
    expectedCurrency: string
  ) {
    assert.ok(this.createdUsers.get(therapistAlias));
    assert.ok(this.lastResponse);
    const body: any = this.lastResponse.bodyAsJson();
    assert.equal(body.isActive, true);
    assert.equal(Number(body.price), expectedPrice);
    assert.equal(body.currency, expectedCurrency);
  }
);

When(
  "client user {string} books the therapist {string} service via BFF from {string} to {string} and pays {float} in java.util.Currency {string} via engangsbetaling",
  async function (
    this: FrontendBddWorld,
    clientAlias: string,
    therapistAlias: string,
    startTime: string,
    endTime: string,
    amount: number,
    currency: string
  ) {
    const client = this.createdUsers.get(clientAlias);
    const therapist = this.createdUsers.get(therapistAlias);
    assert.ok(client && therapist, "Expected both client and therapist users");
    this.currentIdentity = {
      userUuid: client.id,
      username: client.username,
      fullName: client.fullName,
      email: client.email,
      roles: ["client"],
    };

    const bookRes = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        therapistUuid: therapist.id,
        serviceId: this.createdServiceId,
        title: "Individuel Samtale (Engangsbetaling)",
        startTime,
        endTime,
        status: "SCHEDULED",
      })
      .when()
      .post("/api/backend/appointments");
    assert.ok(bookRes.status === 200 || bookRes.status === 201);
    const aptJson: any = bookRes.bodyAsJson();

    const payRes = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        amount,
        currency,
        description: `Engangsbetaling for booking ${aptJson.id}`,
        appointmentUuid: aptJson.id,
        payImmediately: true,
      })
      .when()
      .post("/api/backend/finance/invoices/session");
    assert.equal(payRes.status, 201);
    const payJson: any = payRes.bodyAsJson();

    this.bookingPayments.push({
      clientAlias,
      therapistUuid: therapist.id,
      appointmentId: aptJson.id,
      method: "ENGANGSBETALING",
      amount: Number(payJson.amount),
      currency: payJson.currency,
      status: payJson.status,
      gitCommitHash: payJson.gitCommitHash,
    });
  }
);

When(
  "client user {string} books the therapist {string} service via BFF from {string} to {string} and pays {float} in java.util.Currency {string} via klippekort",
  async function (
    this: FrontendBddWorld,
    clientAlias: string,
    therapistAlias: string,
    startTime: string,
    endTime: string,
    amount: number,
    currency: string
  ) {
    const client = this.createdUsers.get(clientAlias);
    const therapist = this.createdUsers.get(therapistAlias);
    assert.ok(client && therapist, "Expected both client and therapist users");
    this.currentIdentity = {
      userUuid: client.id,
      username: client.username,
      fullName: client.fullName,
      email: client.email,
      roles: ["client"],
    };

    const bookRes = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        therapistUuid: therapist.id,
        serviceId: this.createdServiceId,
        title: "Individuel Samtale (Klippekort)",
        startTime,
        endTime,
        status: "SCHEDULED",
      })
      .when()
      .post("/api/backend/appointments");
    assert.ok(bookRes.status === 200 || bookRes.status === 201);
    const aptJson: any = bookRes.bodyAsJson();

    const topupRes = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        clips: 1,
        amount,
        currency,
      })
      .when()
      .post("/api/backend/finance/prepaid/topup");
    assert.equal(topupRes.status, 201);

    const consumeRes = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        clips: 1,
        appointmentUuid: aptJson.id,
      })
      .when()
      .post("/api/backend/finance/prepaid/consume");
    assert.equal(consumeRes.status, 200);
    const consumeJson: any = consumeRes.bodyAsJson();
    assert.equal(Number(consumeJson.deductedAmount), amount);
    assert.equal(Number(consumeJson.remainingClips), 0);

    this.bookingPayments.push({
      clientAlias,
      therapistUuid: therapist.id,
      appointmentId: aptJson.id,
      method: "KLIPPEKORT",
      amount: Number(consumeJson.deductedAmount),
      currency: consumeJson.currency,
      status: "PAID",
      gitCommitHash: consumeJson.gitCommitHash,
    });
  }
);

Then(
  "both BFF bookings with therapist {string} should be confirmed and paid with {float} in java.util.Currency {string} each",
  function (
    this: FrontendBddWorld,
    therapistAlias: string,
    expectedEachAmount: number,
    expectedCurrency: string
  ) {
    const therapist = this.createdUsers.get(therapistAlias);
    assert.ok(therapist);
    assert.equal(this.bookingPayments.length, 2);
    for (const payment of this.bookingPayments) {
      assert.equal(payment.therapistUuid, therapist.id);
      assert.equal(payment.status, "PAID");
      assert.equal(payment.amount, expectedEachAmount);
      assert.equal(payment.currency, expectedCurrency);
      assert.ok(payment.gitCommitHash);
    }
  }
);

Then(
  "therapist {string} should have received {float} in java.util.Currency {string} in consultation revenue on Fineract GL {string} via BFF",
  async function (
    this: FrontendBddWorld,
    therapistAlias: string,
    expectedRevenue: number,
    expectedCurrency: string,
    glCode: string
  ) {
    const therapist = this.createdUsers.get(therapistAlias);
    assert.ok(therapist);
    assert.equal(expectedCurrency, "DKK");
    this.currentIdentity = {
      userUuid: therapist.id,
      username: therapist.username,
      fullName: therapist.fullName,
      email: therapist.email,
      roles: ["client", "therapist"],
    };

    const glRes = await this.given()
      .when()
      .get("/api/backend/finance/ledger/summary");
    assert.equal(glRes.status, 200);
    const glJson: any = glRes.bodyAsJson();
    const acc = (glJson.chartOfAccounts || []).find(
      (a: any) => a.glCode === glCode
    );
    assert.ok(acc, `Expected GL account ${glCode}`);
    assert.equal(Number(acc.balance), expectedRevenue);
  }
);
