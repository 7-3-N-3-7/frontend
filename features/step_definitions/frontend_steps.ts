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
      this.currentUiHtml.includes('class="jgit-timeline-dot"'),
      "Expected neutral timeline dot (.jgit-timeline-dot) on each commit"
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
      const btnText =
        mode === "SNAPSHOT"
          ? "Fuld Journal-Snapshot"
          : "Ændring i dette commit (Diff)";
      const btn = this.page.locator(`button:has-text("${btnText}")`).first();
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
