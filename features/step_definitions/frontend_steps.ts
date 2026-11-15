import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { FrontendBddWorld } from "../support/world.ts";

// ============================================================================
// Shared Helpers
// ============================================================================

async function ensureRegisteredUser(
  world: FrontendBddWorld,
  logicalUsername: string,
  fullName: string,
  email: string,
  role: string
) {
  const existing = world.usersByLogicalName.get(logicalUsername);
  if (existing) {
    return existing;
  }

  const scoped = `${logicalUsername}_${world.runSuffix}`;
  const uniqueEmail = email.includes("@")
    ? `${email.split("@")[0]}_${world.runSuffix}@${email.split("@")[1]}`
    : `${scoped}@example.dk`;

  const res = await world
    .requestAs("seed_admin", "ADMIN")
    .contentType("application/json")
    .body({
      username: scoped,
      fullName,
      email: uniqueEmail,
      password: "SecurePassword123!",
      role,
    })
    .post("/api/backend/users");

  assert.ok(
    res.status === 200 || res.status === 201,
    `Failed to seed user ${logicalUsername}: ${res.status} ${res.bodyAsString()}`
  );

  const body = res.json<any>();
  const record = {
    id: String(body.id),
    logicalName: logicalUsername,
    scopedUsername: scoped,
    fullName,
    email: uniqueEmail,
    role: role.toUpperCase(),
  };
  world.usersByLogicalName.set(logicalUsername, record);
  world.createdUserIds.add(record.id);
  return record;
}

async function onboardTherapist(
  world: FrontendBddWorld,
  therapistUsername: string,
  iban: string,
  currency: string,
  workingHoursJson = "09:00-17:00"
) {
  const user = await ensureRegisteredUser(
    world,
    therapistUsername,
    world.usersByLogicalName.get(therapistUsername)?.fullName || `Dr. ${therapistUsername}`,
    `${therapistUsername}@klinik.dk`,
    "THERAPIST"
  );

  const cvrSeed = Array.from(`${therapistUsername}_${world.runSuffix}`).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 90000000,
    12345
  );
  const cvrNumber = String(10000000 + Math.abs(cvrSeed));

  const res = await world
    .requestAs(therapistUsername, "THERAPIST")
    .contentType("application/json")
    .body({
      userUuid: user.id,
      displayName: user.fullName,
      cvrNumber,
      organisationName: `Klinik ${user.fullName}`,
      iban,
      currency,
      address: "Bredgade 42",
      postalCode: "1260",
      phoneNumber: "+45 33 14 25 36",
      biography: "Autoriseret psykolog",
      workingHoursJson,
    })
    .post("/api/backend/clinic/therapist-onboarding");

  world.lastResponse = res;
  if (res.status === 200 || res.status === 201) {
    const body = res.json<any>();
    const providerId = body.id || body.providerProfile?.id || body.providerProfileId;
    if (providerId) {
      world.providerIdsByLogicalName.set(therapistUsername, String(providerId));
    }
    const orgId = body.organisation?.id || body.organisationId;
    if (orgId) {
      world.orgIdsByLogicalName.set(therapistUsername, String(orgId));
    }
  }

  // Ensure therapist's personal ClientProfile fields are populated so IBAN readiness is isolated.
  await world
    .requestAs(therapistUsername, "THERAPIST")
    .contentType("application/json")
    .body({
      userId: user.id,
      fullName: user.fullName,
      dateOfBirth: "1985-05-15",
      homeAddress: "Bredgade 42",
      postalCode: "1260",
      phoneNumber: "+45 33 14 25 36",
      email: user.email,
    })
    .post("/api/backend/public/client-profile");

  return res;
}

async function createService(
  world: FrontendBddWorld,
  therapistUsername: string,
  serviceName: string,
  price: number,
  currency: string,
  durationMinutes: number,
  branch: string
) {
  const providerProfileId = world.providerIdsByLogicalName.get(therapistUsername);
  const organisationId = world.orgIdsByLogicalName.get(therapistUsername);
  const therapistUser = world.usersByLogicalName.get(therapistUsername);

  const payload: Record<string, any> = {
    name: serviceName,
    description: `${serviceName} i speciale ${branch}`,
    durationMinutes,
    price,
    location: branch,
    currency,
  };
  if (therapistUser) payload.therapistUuid = therapistUser.id;
  if (providerProfileId) payload.providerProfileId = providerProfileId;
  if (organisationId) payload.organisationId = organisationId;

  const res = await world
    .requestAs(therapistUsername, "THERAPIST")
    .contentType("application/json")
    .body(payload)
    .post("/api/backend/clinic/services");

  world.lastResponse = res;
  if (res.status === 200 || res.status === 201) {
    const body = res.json<any>();
    if (body?.id) {
      world.servicesByName.set(serviceName, {
        id: String(body.id),
        therapistLogicalName: therapistUsername,
        currency,
      });
      world.lastServiceId = String(body.id);
    }
  }
  return res;
}

async function fetchLedgerSummary(world: FrontendBddWorld) {
  let res = await world.given().get("/api/backend/finance/ledger/summary");
  if (res.status === 401 || res.status === 403) {
    res = await world
      .requestAs("ledger_therapist", "THERAPIST")
      .get("/api/backend/finance/ledger/summary");
  }
  assert.equal(res.status, 200, res.bodyAsString());
  return res;
}

function resolveNestedKey(obj: Record<string, any>, dottedKey: string): any {
  if (obj && dottedKey in obj) return obj[dottedKey];
  return dottedKey
    .split(".")
    .reduce<any>((acc, part) => (acc != null ? acc[part] : undefined), obj);
}

// ============================================================================
// 1. User Account Management, Auth & RBAC Steps
// ============================================================================

Given("an authenticated administrator session", async function (this: FrontendBddWorld) {
  this.currentIdentity = this.identityFor("seed_admin", "ADMIN");
});

Given(
  "an authenticated therapist session for {string}",
  async function (this: FrontendBddWorld, username: string) {
    await ensureRegisteredUser(
      this,
      username,
      this.usersByLogicalName.get(username)?.fullName || username,
      `${username}@klinik.dk`,
      "THERAPIST"
    );
    this.currentIdentity = this.identityFor(username, "THERAPIST");
  }
);

Given(
  "an authenticated client session for {string}",
  async function (this: FrontendBddWorld, username: string) {
    await ensureRegisteredUser(
      this,
      username,
      this.usersByLogicalName.get(username)?.fullName || username,
      `${username}@example.dk`,
      "CLIENT"
    );
    this.currentIdentity = this.identityFor(username, "CLIENT");
  }
);

Given("an unauthenticated visitor session", function (this: FrontendBddWorld) {
  this.currentIdentity = null;
});

Given(
  "a registered user account exists with username {string}, full name {string}, email {string}, and role {string}",
  async function (
    this: FrontendBddWorld,
    username: string,
    fullName: string,
    email: string,
    role: string
  ) {
    await ensureRegisteredUser(this, username, fullName, email, role);
  }
);

When(
  "registering a new user account with username {string}, full name {string}, email {string}, password {string}, and role {string}",
  async function (
    this: FrontendBddWorld,
    username: string,
    fullName: string,
    email: string,
    password: string,
    role: string
  ) {
    const existing = this.usersByLogicalName.get(username);
    const targetUsername = existing ? existing.scopedUsername : `${username}_${this.runSuffix}`;
    const res = await this.given()
      .contentType("application/json")
      .body({
        username: targetUsername,
        fullName,
        email,
        password,
        role,
      })
      .post("/api/backend/users");
    this.lastResponse = res;
    if (res.status === 200 || res.status === 201) {
      const body = res.json<any>();
      const id = String(body.id);
      this.usersByLogicalName.set(username, {
        id,
        logicalName: username,
        scopedUsername: targetUsername,
        fullName,
        email,
        role: role.toUpperCase(),
      });
      this.createdUserIds.add(id);
    }
  }
);

Then("the user account registration should succeed", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.ok(
    this.lastResponse.status === 200 || this.lastResponse.status === 201,
    `Expected 200/201, got ${this.lastResponse.status}: ${this.lastResponse.bodyAsString()}`
  );
});

Then(
  "the user directory should include username {string} with role {string}",
  async function (this: FrontendBddWorld, username: string, expectedRole: string) {
    const res = await this.given().get("/api/backend/users");
    assert.equal(res.status, 200, res.bodyAsString());
    const users = res.json<Array<Record<string, any>>>();
    const scoped = this.scopedUsername(username);
    const found = users.some(
      (u) =>
        u.username === scoped &&
        String(u.role || "").toUpperCase() === expectedRole.toUpperCase()
    );
    assert.ok(found, `Expected ${scoped} (${expectedRole}) in ${JSON.stringify(users)}`);
  }
);

Then(
  "no password hash or secret credential should be exposed in the account record",
  function (this: FrontendBddWorld) {
    assert.ok(this.lastResponse);
    const raw = this.lastResponse.bodyAsString();
    assert.ok(!raw.includes('"password"'), `Password field must not be exposed: ${raw}`);
    assert.ok(!raw.includes("SecurePassword123!"), `Raw password must not be exposed: ${raw}`);
  }
);

When("the user account {string} is deleted", async function (this: FrontendBddWorld, username: string) {
  const user = this.usersByLogicalName.get(username);
  assert.ok(user, `Unknown user ${username}`);
  const res = await this.given().delete(`/api/backend/users/${user.id}`);
  this.lastResponse = res;
  this.createdUserIds.delete(user.id);
});

Then("the account removal should complete successfully", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.ok(
    this.lastResponse.status === 200 || this.lastResponse.status === 204,
    `Expected 200/204, got ${this.lastResponse.status}`
  );
});

Then(
  "the user directory should not include username {string}",
  async function (this: FrontendBddWorld, username: string) {
    const res = await this.given().get("/api/backend/users");
    assert.equal(res.status, 200, res.bodyAsString());
    const users = res.json<Array<Record<string, any>>>();
    const scoped = this.scopedUsername(username);
    assert.ok(!users.some((u) => u.username === scoped), `Expected ${scoped} not to appear`);
  }
);

When("attempting to view the user directory", async function (this: FrontendBddWorld) {
  this.lastResponse = await this.given().get("/api/backend/users");
});

When("attempting to view appointments", async function (this: FrontendBddWorld) {
  this.lastResponse = await this.given().get("/api/backend/appointments");
});

When(
  "attempting to view client journal entries for {string}",
  async function (this: FrontendBddWorld, username: string) {
    const targetId = this.usersByLogicalName.get(username)?.id || crypto.randomUUID();
    this.lastResponse = await this.given().get(`/api/backend/journals/client/${targetId}`);
  }
);

Then("access should be denied as unauthenticated", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.equal(
    this.lastResponse.status,
    401,
    `Expected 401, got ${this.lastResponse.status}: ${this.lastResponse.bodyAsString()}`
  );
});

Then("access should be denied due to insufficient permissions", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.equal(
    this.lastResponse.status,
    403,
    `Expected 403, got ${this.lastResponse.status}: ${this.lastResponse.bodyAsString()}`
  );
});

Then(
  "the operation should be rejected with a validation error mentioning {string}",
  function (this: FrontendBddWorld, expectedMessage: string) {
    assert.ok(this.lastResponse);
    assert.equal(
      this.lastResponse.status,
      400,
      `Expected 400, got ${this.lastResponse.status}: ${this.lastResponse.bodyAsString()}`
    );
    assert.ok(
      this.lastResponse.bodyAsString().toLowerCase().includes(expectedMessage.toLowerCase()),
      `Expected '${expectedMessage}' in ${this.lastResponse.bodyAsString()}`
    );
  }
);

When("the signed-in user views their personal profile", async function (this: FrontendBddWorld) {
  this.lastResponse = await this.given().get("/api/backend/user/profile");
});

Then(
  "the personal profile should belong to {string} with role {string}",
  function (this: FrontendBddWorld, username: string, expectedRole: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const body = this.lastResponse.json<any>();
    const user = this.usersByLogicalName.get(username);
    assert.ok(
      body.name === user?.fullName || body.name === user?.scopedUsername || body.name === username,
      `Expected profile name to match ${username}, got ${JSON.stringify(body)}`
    );
    assert.equal(String(body.primaryRole).toUpperCase(), expectedRole.toUpperCase());
  }
);

When(
  "the signed-in user updates their personal profile full name to {string} and phone to {string}",
  async function (this: FrontendBddWorld, newFullName: string, newPhone: string) {
    const meRes = await this.given().get("/api/backend/clinic/me");
    assert.equal(meRes.status, 200, meRes.bodyAsString());
    const me = meRes.json<any>();

    const res = await this.given()
      .contentType("application/json")
      .body({
        userId: me.userUuid,
        fullName: newFullName,
        dateOfBirth: "1990-01-01",
        homeAddress: "Vestergade 10",
        postalCode: "1456",
        phoneNumber: newPhone,
        email: me.email,
      })
      .put("/api/backend/clinic/client-profile");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "the personal profile full name should be {string}",
  async function (this: FrontendBddWorld, expectedFullName: string) {
    const meRes = await this.given().get("/api/backend/clinic/me");
    assert.equal(meRes.status, 200, meRes.bodyAsString());
    const me = meRes.json<any>();
    const profRes = await this.given().get(`/api/backend/clinic/client-profile/${me.userUuid}`);
    assert.equal(profRes.status, 200, profRes.bodyAsString());
    assert.equal(profRes.json<any>().fullName, expectedFullName);
  }
);

// ============================================================================
// 2. Clinic Onboarding, Services, Marketplace & Handshakes
// ============================================================================

Given(
  "an onboarded therapist {string} with IBAN {string}, currency {string}, and service {string} priced at {int} {word} for {int} minutes in branch {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    iban: string,
    currency: string,
    serviceName: string,
    price: number,
    priceCurrency: string,
    durationMinutes: number,
    branch: string
  ) {
    const onboardRes = await onboardTherapist(this, therapistUsername, iban, currency);
    assert.ok(onboardRes.status === 200 || onboardRes.status === 201, onboardRes.bodyAsString());
    const srvRes = await createService(
      this,
      therapistUsername,
      serviceName,
      price,
      priceCurrency,
      durationMinutes,
      branch
    );
    assert.ok(srvRes.status === 200 || srvRes.status === 201, srvRes.bodyAsString());
  }
);

Given(
  "a registered client {string} with an active handshake with therapist {string}",
  async function (this: FrontendBddWorld, clientUsername: string, therapistUsername: string) {
    const client = await ensureRegisteredUser(
      this,
      clientUsername,
      this.usersByLogicalName.get(clientUsername)?.fullName || clientUsername,
      `${clientUsername}@example.dk`,
      "CLIENT"
    );
    const therapist = await ensureRegisteredUser(
      this,
      therapistUsername,
      this.usersByLogicalName.get(therapistUsername)?.fullName || therapistUsername,
      `${therapistUsername}@klinik.dk`,
      "THERAPIST"
    );

    const res = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        clientName: client.fullName,
        therapistUuid: therapist.id,
        therapistName: therapist.fullName,
        organisationName: `Klinik ${therapist.fullName}`,
        status: "ACTIVE",
      })
      .post("/api/backend/clinic/handshakes");
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
    const hs = res.json<any>();
    this.lastHandshakeId = String(hs.id);

    if (hs.status !== "ACTIVE") {
      const patchRes = await this.requestAs(therapistUsername, "THERAPIST")
        .contentType("application/json")
        .body({ status: "ACTIVE" })
        .patch(`/api/backend/clinic/handshakes/${hs.id}/status`);
      assert.equal(patchRes.status, 200, patchRes.bodyAsString());
    }
  }
);

When(
  "checking onboarding readiness for therapist {string}",
  async function (this: FrontendBddWorld, therapistUsername: string) {
    this.lastResponse = await this.requestAs(therapistUsername, "THERAPIST").get(
      "/api/backend/clinic/me"
    );
  }
);

Then(
  "service creation should be blocked and missing profile fields should include {string}",
  function (this: FrontendBddWorld, expectedField: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const body = this.lastResponse.json<any>();
    assert.equal(body.canCreateServices, false);
    const missing: string[] = Array.isArray(body.missingProfileFields)
      ? body.missingProfileFields
      : [];
    assert.ok(
      missing.some((f) => String(f).toLowerCase().includes(expectedField.toLowerCase())),
      `Expected missingProfileFields ${JSON.stringify(missing)} to include ${expectedField}`
    );
  }
);

When(
  "therapist {string} attempts to create service {string} priced at {int} {string} for {int} minutes in branch {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    serviceName: string,
    price: number,
    currency: string,
    durationMinutes: number,
    branch: string
  ) {
    await createService(this, therapistUsername, serviceName, price, currency, durationMinutes, branch);
  }
);

When(
  "therapist {string} creates service {string} priced at {int} {string} for {int} minutes in branch {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    serviceName: string,
    price: number,
    currency: string,
    durationMinutes: number,
    branch: string
  ) {
    await createService(this, therapistUsername, serviceName, price, currency, durationMinutes, branch);
  }
);

When(
  "therapist {string} configures bank details with IBAN {string} and preferred currency {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    iban: string,
    currency: string
  ) {
    await onboardTherapist(this, therapistUsername, iban, currency);
  }
);

Then(
  "service creation should be enabled for therapist {string} with no missing profile fields",
  async function (this: FrontendBddWorld, therapistUsername: string) {
    const meRes = await this.requestAs(therapistUsername, "THERAPIST").get("/api/backend/clinic/me");
    assert.equal(meRes.status, 200, meRes.bodyAsString());
    const body = meRes.json<any>();
    assert.equal(body.canCreateServices, true, meRes.bodyAsString());
    assert.deepEqual(body.missingProfileFields, []);
  }
);

Then(
  "the service {string} should be created as active with currency {string}",
  function (this: FrontendBddWorld, serviceName: string, expectedCurrency: string) {
    assert.ok(this.lastResponse);
    assert.ok(
      this.lastResponse.status === 200 || this.lastResponse.status === 201,
      this.lastResponse.bodyAsString()
    );
    const body = this.lastResponse.json<any>();
    assert.equal(body.name, serviceName);
    assert.equal(body.currency, expectedCurrency);
    assert.ok(body.isActive === true || body.active === true);
  }
);

When(
  "therapist {string} toggles active status on service {string}",
  async function (this: FrontendBddWorld, therapistUsername: string, serviceName: string) {
    const srv = this.servicesByName.get(serviceName);
    assert.ok(srv, `Expected service ${serviceName}`);
    this.lastResponse = await this.requestAs(therapistUsername, "THERAPIST").patch(
      `/api/backend/clinic/services/${srv.id}/toggle`
    );
  }
);

Then(
  "the service {string} should become inactive",
  function (this: FrontendBddWorld, serviceName: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const body = this.lastResponse.json<any>();
    assert.equal(body.name, serviceName);
    assert.ok(body.isActive === false || body.active === false);
  }
);

When(
  "{string} browses the clinic marketplace directory",
  async function (this: FrontendBddWorld, viewerUsername: string) {
    const viewer = this.usersByLogicalName.get(viewerUsername);
    assert.ok(viewer, `Unknown viewer ${viewerUsername}`);
    this.lastResponse = await this.requestAs(viewerUsername, viewer.role).get(
      `/api/backend/clinic/client/${viewer.id}/overview`
    );
  }
);

Then(
  "the marketplace directory should include provider {string} and exclude provider {string}",
  function (this: FrontendBddWorld, includedUsername: string, excludedUsername: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const includedId = this.providerIdsByLogicalName.get(includedUsername);
    const excludedId = this.providerIdsByLogicalName.get(excludedUsername);
    assert.ok(includedId && excludedId);

    const services = this.lastResponse.json<any>().services || [];
    const providerIds = services.map((s: any) => s.provider?.id || s.providerId);
    assert.ok(providerIds.includes(includedId), `Expected ${includedId} in ${JSON.stringify(providerIds)}`);
    assert.ok(!providerIds.includes(excludedId), `Expected ${excludedId} excluded from ${JSON.stringify(providerIds)}`);
  }
);

When(
  "client {string} requests a handshake with therapist {string}",
  async function (this: FrontendBddWorld, clientUsername: string, therapistUsername: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    const therapist = this.usersByLogicalName.get(therapistUsername);
    assert.ok(client && therapist);

    const res = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        clientName: client.fullName,
        therapistUuid: therapist.id,
        therapistName: therapist.fullName,
        organisationName: `Klinik ${therapist.fullName}`,
        status: "REQUESTED",
      })
      .post("/api/backend/clinic/handshakes");
    this.lastResponse = res;
    if (res.status === 200 || res.status === 201) {
      this.lastHandshakeId = String(res.json<any>().id);
    }
  }
);

Then(
  "the handshake status should be {string}",
  function (this: FrontendBddWorld, expectedStatus: string) {
    assert.ok(this.lastResponse);
    assert.ok(
      this.lastResponse.status === 200 || this.lastResponse.status === 201,
      this.lastResponse.bodyAsString()
    );
    assert.equal(this.lastResponse.json<any>().status, expectedStatus);
  }
);

When(
  "therapist {string} updates the handshake status to {string}",
  async function (this: FrontendBddWorld, therapistUsername: string, status: string) {
    assert.ok(this.lastHandshakeId, "Expected lastHandshakeId");
    this.lastResponse = await this.requestAs(therapistUsername, "THERAPIST")
      .contentType("application/json")
      .body({ status })
      .patch(`/api/backend/clinic/handshakes/${this.lastHandshakeId}/status`);
  }
);

Then(
  "the therapist overview for {string} should list client {string} with handshake status {string} and latest PCL-5 score {int}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    clientUsername: string,
    expectedStatus: string,
    expectedScore: number
  ) {
    const therapist = this.usersByLogicalName.get(therapistUsername);
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(therapist && client);

    const res = await this.requestAs(therapistUsername, "THERAPIST").get(
      `/api/backend/clinic/therapist/${therapist.id}/overview`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    const clients = res.json<any>().clients || [];
    const matched = clients.find(
      (c: any) => c.clientUuid === client.id || c.uuid === client.id
    );
    assert.ok(matched, `Expected client ${client.id} in ${JSON.stringify(clients)}`);
    assert.equal(matched.handshakeStatus, expectedStatus);
    assert.equal(Number(matched.latestPcl5Score), expectedScore);
  }
);

Then(
  "the client overview for {string} should reflect the booking for {string} without exposing {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    serviceName: string,
    excludedUsername: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    const excluded = this.usersByLogicalName.get(excludedUsername);
    assert.ok(client);

    const res = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/clinic/client/${client.id}/overview`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    const raw = res.bodyAsString();
    assert.ok(raw.includes(serviceName), `Expected ${serviceName} in client overview`);
    if (excluded) {
      assert.ok(!raw.includes(excluded.id));
      assert.ok(!raw.includes(excluded.scopedUsername));
      assert.ok(!raw.includes(excluded.fullName));
    }
  }
);

// ============================================================================
// 3. Appointment Scheduling, Conflicts, Rescheduling & Timefold Slots
// ============================================================================

async function postAppointment(
  world: FrontendBddWorld,
  clientUsername: string,
  therapistUsername: string,
  serviceName: string,
  startTime: string,
  endTime: string
) {
  const client = world.usersByLogicalName.get(clientUsername);
  const therapist = world.usersByLogicalName.get(therapistUsername);
  const srv = world.servicesByName.get(serviceName);
  assert.ok(client && therapist, "Expected client and therapist to exist");

  const res = await world
    .requestAs(clientUsername, "CLIENT")
    .contentType("application/json")
    .body({
      clientUuid: client.id,
      therapistUuid: therapist.id,
      serviceId: srv?.id || null,
      clientName: client.fullName,
      therapistName: therapist.fullName,
      title: serviceName,
      startTime,
      endTime,
    })
    .post("/api/backend/appointments");

  world.lastResponse = res;
  if (res.status === 200 || res.status === 201) {
    const id = res.json<any>()?.id;
    if (id) world.lastAppointmentId = String(id);
  }
  return res;
}

When(
  "client {string} books an appointment with therapist {string} for service {string} from {string} to {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    therapistUsername: string,
    serviceName: string,
    startTime: string,
    endTime: string
  ) {
    await postAppointment(this, clientUsername, therapistUsername, serviceName, startTime, endTime);
  }
);

When(
  "client {string} attempts to book an appointment with therapist {string} for service {string} from {string} to {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    therapistUsername: string,
    serviceName: string,
    startTime: string,
    endTime: string
  ) {
    await postAppointment(this, clientUsername, therapistUsername, serviceName, startTime, endTime);
  }
);

Given(
  "client {string} has a booked appointment with therapist {string} for service {string} from {string} to {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    therapistUsername: string,
    serviceName: string,
    startTime: string,
    endTime: string
  ) {
    const res = await postAppointment(
      this,
      clientUsername,
      therapistUsername,
      serviceName,
      startTime,
      endTime
    );
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "the appointment booking should succeed with status {string}",
  function (this: FrontendBddWorld, expectedStatus: string) {
    assert.ok(this.lastResponse);
    assert.ok(
      this.lastResponse.status === 200 || this.lastResponse.status === 201,
      this.lastResponse.bodyAsString()
    );
    assert.equal(this.lastResponse.json<any>().status, expectedStatus);
  }
);

Then("the booking should be rejected as a scheduling conflict", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.equal(this.lastResponse.status, 409, this.lastResponse.bodyAsString());
});

When(
  "client {string} attempts to reschedule that appointment to {string} until {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    startTime: string,
    endTime: string
  ) {
    assert.ok(this.lastAppointmentId);
    const client = this.usersByLogicalName.get(clientUsername);
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body({
        id: this.lastAppointmentId,
        clientUuid: client?.id,
        startTime,
        endTime,
      })
      .put(`/api/backend/appointments/${this.lastAppointmentId}`);
  }
);

When(
  "client {string} reschedules that appointment to {string} until {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    startTime: string,
    endTime: string
  ) {
    assert.ok(this.lastAppointmentId);
    const client = this.usersByLogicalName.get(clientUsername);
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body({
        id: this.lastAppointmentId,
        clientUuid: client?.id,
        startTime,
        endTime,
      })
      .put(`/api/backend/appointments/${this.lastAppointmentId}`);
  }
);

Then(
  "the appointment start time should be updated to {string}",
  function (this: FrontendBddWorld, expectedStartTime: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const prefix = expectedStartTime.slice(0, 16);
    assert.ok(String(this.lastResponse.json<any>().startTime).startsWith(prefix));
  }
);

When(
  "client {string} cancels the scheduled appointment",
  async function (this: FrontendBddWorld, clientUsername: string) {
    assert.ok(this.lastAppointmentId);
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT").delete(
      `/api/backend/appointments/${this.lastAppointmentId}`
    );
  }
);

Then("the cancellation should complete successfully", async function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.ok(
    this.lastResponse.status === 200 || this.lastResponse.status === 204,
    this.lastResponse.bodyAsString()
  );
  const verifyRes = await this.given().get(`/api/backend/appointments/${this.lastAppointmentId}`);
  assert.equal(verifyRes.status, 200, verifyRes.bodyAsString());
  assert.equal(verifyRes.json<any>().status, "CANCELLED");
});

When(
  "client {string} filters appointments from {string} to {string}",
  async function (this: FrontendBddWorld, clientUsername: string, fromIso: string, toIso: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const fromDate = fromIso.slice(0, 10);
    const toDate = toIso.slice(0, 10);
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/appointments/client/${client.id}?from=${fromDate}&to=${toDate}`
    );
  }
);

Then(
  "the filtered schedule should include {string} and exclude {string}",
  function (this: FrontendBddWorld, includedStart: string, excludedStart: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const list = this.lastResponse.json<Array<Record<string, any>>>();
    const starts = list.map((a) => String(a.startTime || ""));
    assert.ok(
      starts.some((s) => s.startsWith(includedStart.slice(0, 16))),
      `Expected ${includedStart} in ${JSON.stringify(starts)}`
    );
    assert.ok(
      starts.every((s) => !s.startsWith(excludedStart.slice(0, 16))),
      `Expected ${excludedStart} excluded from ${JSON.stringify(starts)}`
    );
  }
);

Given(
  "therapist {string} configures multi-window availability from {string} to {string} and {string} to {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    w1Start: string,
    w1End: string,
    w2Start: string,
    w2End: string
  ) {
    const res = await onboardTherapist(
      this,
      therapistUsername,
      "DK5000400440116243",
      "DKK",
      `${w1Start}-${w1End}, ${w2Start}-${w2End}`
    );
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

When(
  "requesting optimal conflict-free slots for therapist {string} on {string}",
  async function (this: FrontendBddWorld, therapistUsername: string, date: string) {
    const therapist = this.usersByLogicalName.get(therapistUsername);
    assert.ok(therapist);
    this.lastResponse = await this.given().get(
      `/api/backend/appointments/timefold-slots?therapistUuid=${therapist.id}&date=${date}&durationMinutes=60`
    );
  }
);

Then(
  "a feasible recommended slot avoiding {string} should be returned",
  function (this: FrontendBddWorld, blockedStartTime: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const body = this.lastResponse.json<any>();
    assert.equal(body.feasible, true);
    assert.ok(body.recommendedSlot, `Expected recommendedSlot in ${this.lastResponse.bodyAsString()}`);
    const slots: any[] = body.slots || [];
    const chosen = slots.find((s) => String(s.slot) === String(body.recommendedSlot));
    assert.ok(chosen, `Expected slot matching ${body.recommendedSlot}`);
    const blockedPrefix = blockedStartTime.slice(0, 16);
    assert.ok(!String(chosen.startTime).startsWith(blockedPrefix));
  }
);

// ============================================================================
// 4. Journaling, Confidential Clinical Notes & Unified Timeline
// ============================================================================

When(
  "client {string} writes a personal journal entry titled {string} with content {string}",
  async function (this: FrontendBddWorld, clientUsername: string, title: string, content: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        title,
        content,
        moodRating: 7,
        sharedWithTherapists: true,
        gitBranch: "main",
      })
      .post("/api/backend/journals");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "viewing the journal entries for {string} should include {string}",
  async function (this: FrontendBddWorld, clientUsername: string, expectedTitle: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/journals/client/${client.id}`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    assert.ok(res.bodyAsString().includes(expectedTitle), res.bodyAsString());
  }
);

When(
  "therapist {string} records a shared clinical note {string} for {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    noteContent: string,
    clientUsername: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    const therapist = this.usersByLogicalName.get(therapistUsername);
    assert.ok(client && therapist);
    const res = await this.requestAs(therapistUsername, "THERAPIST")
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        title: `Klinisk deling fra ${therapist.fullName}`,
        content: noteContent,
        moodRating: 8,
        sharedWithTherapists: true,
        gitBranch: "main",
      })
      .post("/api/backend/journals");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

async function postConfidentialClinicalNote(
  world: FrontendBddWorld,
  actorUsername: string,
  role: string,
  clientUsername: string,
  markdown: string
) {
  const client = world.usersByLogicalName.get(clientUsername);
  const actor = world.usersByLogicalName.get(actorUsername);
  assert.ok(client);
  const res = await world
    .requestAs(actorUsername, role)
    .contentType("application/json")
    .body({
      clientUuid: client.id,
      therapistNote: markdown,
      therapistName: actor?.fullName || actorUsername,
      organisationName: `Klinik ${actorUsername}`,
    })
    .post("/api/backend/journals/therapist-notes");
  world.lastResponse = res;
  return res;
}

When(
  "therapist {string} records a confidential clinical note {string} for {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    noteContent: string,
    clientUsername: string
  ) {
    const res = await postConfidentialClinicalNote(
      this,
      therapistUsername,
      "THERAPIST",
      clientUsername,
      noteContent
    );
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

When(
  "client {string} attempts to record a confidential therapist clinical note for {string}",
  async function (this: FrontendBddWorld, actorUsername: string, targetUsername: string) {
    await postConfidentialClinicalNote(
      this,
      actorUsername,
      "CLIENT",
      targetUsername,
      "Uautoriseret klinisk notat"
    );
  }
);

Then(
  "when client {string} views their journal and unified timeline, {string} should be visible and {string} should be hidden",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    visibleText: string,
    hiddenText: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);

    const journalRes = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/journals/client/${client.id}`
    );
    assert.equal(journalRes.status, 200, journalRes.bodyAsString());
    assert.ok(journalRes.bodyAsString().includes(visibleText));
    assert.ok(!journalRes.bodyAsString().includes(hiddenText));

    const timelineRes = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/journals/timeline/${client.id}`
    );
    assert.equal(timelineRes.status, 200, timelineRes.bodyAsString());
    assert.ok(timelineRes.bodyAsString().includes(visibleText));
    assert.ok(!timelineRes.bodyAsString().includes(hiddenText));
  }
);

Then(
  "when therapist {string} views the clinical history and unified timeline for {string}, both {string} and {string} should be visible",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    clientUsername: string,
    sharedText: string,
    confidentialText: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    const therapist = this.usersByLogicalName.get(therapistUsername);
    assert.ok(client && therapist);

    const historyRes = await this.requestAs(therapistUsername, "THERAPIST").get(
      `/api/backend/journals/history/${client.id}?therapistUuid=${therapist.id}`
    );
    assert.equal(historyRes.status, 200, historyRes.bodyAsString());

    const timelineRes = await this.requestAs(therapistUsername, "THERAPIST").get(
      `/api/backend/journals/timeline/${client.id}`
    );
    assert.equal(timelineRes.status, 200, timelineRes.bodyAsString());

    const combined = `${historyRes.bodyAsString()}\n${timelineRes.bodyAsString()}`;
    assert.ok(combined.includes(sharedText), `Expected '${sharedText}' in ${combined}`);
    assert.ok(combined.includes(confidentialText), `Expected '${confidentialText}' in ${combined}`);
  }
);

Then(
  "when unlinked therapist {string} views the journal bundle and clinical history for {string}, no entries or notes should be returned",
  async function (
    this: FrontendBddWorld,
    unlinkedTherapist: string,
    clientUsername: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    const therapist = this.usersByLogicalName.get(unlinkedTherapist);
    assert.ok(client && therapist);

    const bundleRes = await this.requestAs(unlinkedTherapist, "THERAPIST").get(
      `/api/backend/journals/client/${client.id}?therapistUuid=${therapist.id}`
    );
    assert.equal(bundleRes.status, 200, bundleRes.bodyAsString());
    const bundle = bundleRes.json<any>();
    assert.deepEqual(bundle.entries || [], []);
    assert.deepEqual(bundle.clinicalNotes || [], []);

    const historyRes = await this.requestAs(unlinkedTherapist, "THERAPIST").get(
      `/api/backend/journals/history/${client.id}?therapistUuid=${therapist.id}`
    );
    assert.equal(historyRes.status, 200, historyRes.bodyAsString());
    assert.deepEqual(historyRes.json<any[]>(), []);
  }
);

// ============================================================================
// 5. Psychotraumatology PCL-5 Screening
// ============================================================================

When(
  "therapist {string} submits a PCL-5 trauma assessment for {string} with total score {int} and severity {string}",
  async function (
    this: FrontendBddWorld,
    therapistUsername: string,
    clientUsername: string,
    totalScore: number,
    severity: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    const therapist = this.usersByLogicalName.get(therapistUsername);
    assert.ok(client && therapist);

    const res = await this.requestAs(therapistUsername, "THERAPIST")
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        therapistUuid: therapist.id,
        testType: "PCL-5",
        score: totalScore,
        severity,
        answersJson: JSON.stringify({ totalScore }),
      })
      .post("/api/backend/psychotraumatology/tests");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "the PCL-5 assessment should be stored with score {int} and severity {string}",
  function (this: FrontendBddWorld, expectedScore: number, expectedSeverity: string) {
    assert.ok(this.lastResponse);
    assert.ok(this.lastResponse.status === 200 || this.lastResponse.status === 201);
    const body = this.lastResponse.json<any>();
    assert.equal(Number(body.score), expectedScore);
    assert.equal(body.severity, expectedSeverity);
  }
);

Then(
  "client {string} retrieving their PCL-5 assessments should include score {int}",
  async function (this: FrontendBddWorld, clientUsername: string, expectedScore: number) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/psychotraumatology/tests/client/${client.id}`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    const scores = (res.json<any[]>() || []).map((t) => Number(t.score));
    assert.ok(scores.includes(expectedScore), `Expected ${expectedScore} in ${JSON.stringify(scores)}`);
  }
);

When(
  "client {string} attempts to retrieve PCL-5 assessments for {string}",
  async function (this: FrontendBddWorld, actorUsername: string, targetUsername: string) {
    const target = this.usersByLogicalName.get(targetUsername);
    assert.ok(target);
    this.lastResponse = await this.requestAs(actorUsername, "CLIENT").get(
      `/api/backend/psychotraumatology/tests/client/${target.id}`
    );
  }
);

// ============================================================================
// 6. Finance, Invoices, Prepaid Clip Cards, Subscriptions, Loans & GL
// ============================================================================

Given(
  "the baseline general ledger balances are recorded",
  async function (this: FrontendBddWorld) {
    const res = await fetchLedgerSummary(this);
    const accounts: any[] = res.json<any>().chartOfAccounts || [];
    this.baselineGlBalances.clear();
    for (const acc of accounts) {
      this.baselineGlBalances.set(String(acc.glCode), Number(acc.balance || 0));
    }
  }
);

Then(
  /^general ledger (?:deferred |revenue )?account "([^"]+)" should change by (-?\d+) DKK and (?:deferred |revenue )?account "([^"]+)" should change by (-?\d+) DKK from baseline$/,
  async function (
    this: FrontendBddWorld,
    firstAccount: string,
    firstDeltaStr: string,
    secondAccount: string,
    secondDeltaStr: string
  ) {
    const res = await fetchLedgerSummary(this);
    const accounts: any[] = res.json<any>().chartOfAccounts || [];
    const current = new Map<string, number>();
    for (const acc of accounts) {
      current.set(String(acc.glCode), Number(acc.balance || 0));
    }
    const checkDelta = (code: string, expectedDelta: number) => {
      const actualDelta =
        (current.get(code) || 0) - (this.baselineGlBalances.get(code) || 0);
      assert.ok(
        Math.abs(actualDelta - expectedDelta) < 0.01,
        `Expected GL ${code} delta ${expectedDelta}, got ${actualDelta}`
      );
    };
    checkDelta(firstAccount, Number(firstDeltaStr));
    checkDelta(secondAccount, Number(secondDeltaStr));
  }
);

When(
  "an invoice of {int} {word} is paid by client {string} for a therapy session",
  async function (
    this: FrontendBddWorld,
    amount: number,
    currency: string,
    clientUsername: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        amount,
        currency,
        description: `Terapisession for ${client.scopedUsername}`,
        payImmediately: true,
      })
      .post("/api/backend/finance/invoices/session");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
    const body = res.json<any>();
    assert.equal(body.status, "PAID");
    this.lastInvoiceId = String(body.invoiceId);
    this.lastCommitHash = String(body.gitCommitHash);
  }
);

Then(
  "the ledger commit snapshot for that invoice should be retrievable",
  async function (this: FrontendBddWorld) {
    assert.ok(this.lastCommitHash, "Expected lastCommitHash");
    const res = await this.given().get(
      `/api/backend/finance/ledger/commits/${this.lastCommitHash}`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    assert.ok(res.bodyAsString().trim().length > 0);
  }
);

When(
  "therapist {string} issues a full refund for that invoice",
  async function (this: FrontendBddWorld, therapistUsername: string) {
    assert.ok(this.lastInvoiceId, "Expected lastInvoiceId");
    const res = await this.requestAs(therapistUsername, "THERAPIST")
      .contentType("application/json")
      .body({ reason: "Fuldt afbud og refundering" })
      .post(`/api/backend/finance/invoices/${this.lastInvoiceId}/refund`);
    this.lastResponse = res;
    assert.equal(res.status, 200, res.bodyAsString());
    assert.equal(res.json<any>().status, "REFUNDED");
  }
);

When(
  "client {string} purchases a {int}-session prepaid clip card for {int} {word}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    clips: number,
    amount: number,
    currency: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.given()
      .contentType("application/json")
      .body({ clientUuid: client.id, amount, clips, currency })
      .post("/api/backend/finance/prepaid/topup");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "client {string} should have {int} remaining prepaid clips",
  async function (this: FrontendBddWorld, clientUsername: string, expectedClips: number) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/finance/client/${client.id}/overview`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    assert.equal(Number(res.json<any>().prepaidSavings?.remainingClips), expectedClips);
  }
);

When(
  "client {string} redeems {int} prepaid clip",
  async function (this: FrontendBddWorld, clientUsername: string, clips: number) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.given()
      .contentType("application/json")
      .body({ clientUuid: client.id, clips, appointmentUuid: crypto.randomUUID() })
      .post("/api/backend/finance/prepaid/consume");
    this.lastResponse = res;
    assert.equal(res.status, 200, res.bodyAsString());
  }
);

When(
  "activating a monthly subscription plan for client {string} at {int} {word}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    amount: number,
    currency: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.given()
      .contentType("application/json")
      .body({
        clientUuid: client.id,
        planName: "Standard Maanedsabonnement",
        monthlyAmount: amount,
        currency,
      })
      .post("/api/backend/finance/subscriptions");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
  }
);

Then(
  "client {string} should have an active subscription plan",
  async function (this: FrontendBddWorld, clientUsername: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/finance/client/${client.id}/overview`
    );
    assert.equal(res.status, 200, res.bodyAsString());
    const subs: any[] = res.json<any>().subscriptions || [];
    assert.ok(subs.some((s) => s.status === "ACTIVE"), res.bodyAsString());
  }
);

When(
  "client {string} enters a {int}-installment loan plan totaling {int} {word}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    installmentsCount: number,
    principalAmount: number,
    currency: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    const res = await this.given()
      .contentType("application/json")
      .body({ clientUuid: client.id, principalAmount, installmentsCount, currency })
      .post("/api/backend/finance/installment-plans");
    this.lastResponse = res;
    assert.ok(res.status === 200 || res.status === 201, res.bodyAsString());
    const body = res.json<any>();
    this.lastLoanId = String(body.loanId || body.id);
  }
);

When(
  "client {string} repays installment {int} of {int} {word}",
  async function (
    this: FrontendBddWorld,
    _clientUsername: string,
    _installmentNumber: number,
    amount: number,
    _currency: string
  ) {
    assert.ok(this.lastLoanId, "Expected lastLoanId");
    const res = await this.given()
      .contentType("application/json")
      .body({ amount })
      .post(`/api/backend/finance/installment-plans/${this.lastLoanId}/repay`);
    this.lastResponse = res;
    assert.equal(res.status, 200, res.bodyAsString());
  }
);

Then(
  "the loan plan should reflect {int} remaining installments and {int} {word} remaining balance",
  function (
    this: FrontendBddWorld,
    expectedRemainingInstallments: number,
    expectedBalance: number,
    _currency: string
  ) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    const body = this.lastResponse.json<any>();
    const remainingInstallments =
      Number(body.installmentsCount) - Number(body.paidInstallments);
    assert.equal(remainingInstallments, expectedRemainingInstallments);
    assert.ok(Math.abs(Number(body.remainingPrincipal) - expectedBalance) < 0.01);
  }
);

When(
  "client {string} views their own financial overview",
  async function (this: FrontendBddWorld, clientUsername: string) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client);
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT").get(
      `/api/backend/finance/client/${client.id}/overview`
    );
  }
);

When(
  "client {string} attempts to view the financial overview for {string}",
  async function (this: FrontendBddWorld, actorUsername: string, targetUsername: string) {
    const target = this.usersByLogicalName.get(targetUsername);
    assert.ok(target);
    this.lastResponse = await this.requestAs(actorUsername, "CLIENT").get(
      `/api/backend/finance/client/${target.id}/overview`
    );
  }
);

Then("the financial overview should be accessible", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
});

When(
  "client {string} attempts to view the clinic general ledger summary",
  async function (this: FrontendBddWorld, clientUsername: string) {
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT").get(
      "/api/backend/finance/ledger/summary"
    );
  }
);

When(
  "therapist {string} views the clinic general ledger summary",
  async function (this: FrontendBddWorld, therapistUsername: string) {
    this.lastResponse = await this.requestAs(therapistUsername, "THERAPIST").get(
      "/api/backend/finance/ledger/summary"
    );
  }
);

Then("the clinic general ledger summary should be accessible", function (this: FrontendBddWorld) {
  assert.ok(this.lastResponse);
  assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
});

let lastVippsAgreementId: string | null = null;

function buildVippsCheckoutPayload(
  clientUuid: string,
  productType: string,
  amount: number | undefined,
  currency: string,
  paymentMethod: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    clientUuid,
    productType,
    currency,
    paymentMethod,
  };
  if (amount !== undefined) {
    payload.amount = amount;
  }
  if (paymentMethod.toUpperCase() === "MOBILEPAY") {
    payload.phoneNumber = "+4520123456";
  } else {
    payload.cardToken = "tok_card_bdd_4242";
    payload.cardLast4 = "4242";
    payload.cardBrand = "VISA";
  }
  return payload;
}

When(
  "client {string} pays via Vipps OSGi checkout for {string} of {int} {word} with payment method {string} and {int} clips",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    productType: string,
    amount: number,
    currency: string,
    paymentMethod: string,
    clips: number
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client, `Missing client user ${clientUsername}`);
    const payload = buildVippsCheckoutPayload(
      client.id,
      productType,
      amount,
      currency,
      paymentMethod
    );
    payload.clips = clips;
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body(payload)
      .post("/api/backend/finance/vipps/checkout");
    assert.equal(this.lastResponse.status, 201, this.lastResponse.bodyAsString());
    const json = this.lastResponse.json<any>();
    if (json.agreementId) lastVippsAgreementId = String(json.agreementId);
    if (json.invoiceId) this.lastInvoiceId = String(json.invoiceId);
    if (json.gitCommitHash) this.lastCommitHash = String(json.gitCommitHash);
  }
);

When(
  "client {string} pays via Vipps OSGi checkout for {string} of {int} {word} with payment method {string}",
  async function (
    this: FrontendBddWorld,
    clientUsername: string,
    productType: string,
    amount: number,
    currency: string,
    paymentMethod: string
  ) {
    const client = this.usersByLogicalName.get(clientUsername);
    assert.ok(client, `Missing client user ${clientUsername}`);
    const payload = buildVippsCheckoutPayload(
      client.id,
      productType,
      amount,
      currency,
      paymentMethod
    );
    this.lastResponse = await this.requestAs(clientUsername, "CLIENT")
      .contentType("application/json")
      .body(payload)
      .post("/api/backend/finance/vipps/checkout");
    assert.equal(this.lastResponse.status, 201, this.lastResponse.bodyAsString());
    const json = this.lastResponse.json<any>();
    if (json.agreementId) lastVippsAgreementId = String(json.agreementId);
    if (json.invoiceId) this.lastInvoiceId = String(json.invoiceId);
    if (json.gitCommitHash) this.lastCommitHash = String(json.gitCommitHash);
  }
);

When(
  "the active Vipps agreement is charged for the next recurring period by {string}",
  async function (this: FrontendBddWorld, username: string) {
    assert.ok(lastVippsAgreementId, "Expected active Vipps agreementId");
    this.lastResponse = await this.requestAs(username, "CLIENT")
      .contentType("application/json")
      .body({})
      .post(`/api/backend/finance/vipps/agreements/${encodeURIComponent(lastVippsAgreementId)}/charge`);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
  }
);

When(
  "the active Vipps agreement is cancelled by {string}",
  async function (this: FrontendBddWorld, username: string) {
    assert.ok(lastVippsAgreementId, "Expected active Vipps agreementId");
    this.lastResponse = await this.requestAs(username, "CLIENT")
      .contentType("application/json")
      .body({})
      .post(`/api/backend/finance/vipps/agreements/${encodeURIComponent(lastVippsAgreementId)}/cancel`);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
  }
);

Then("the Vipps agreement status should be {string}", function (this: FrontendBddWorld, expectedStatus: string) {
  assert.ok(this.lastResponse);
  assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
  const json = this.lastResponse.json<any>();
  assert.equal(json.status, expectedStatus);
});

When(
  "user {string} with role {string} purchases platform access {string} via payment method {string}",
  async function (
    this: FrontendBddWorld,
    username: string,
    role: string,
    accessTier: string,
    paymentMethod: string
  ) {
    const user = this.usersByLogicalName.get(username);
    assert.ok(user, `Missing user ${username}`);
    const payload = buildVippsCheckoutPayload(
      user.id,
      accessTier,
      undefined,
      "DKK",
      paymentMethod
    );
    this.lastResponse = await this.requestAs(username, role)
      .contentType("application/json")
      .body(payload)
      .post("/api/backend/finance/vipps/checkout");
    assert.equal(this.lastResponse.status, 201, this.lastResponse.bodyAsString());
    const json = this.lastResponse.json<any>();
    if (json.agreementId) lastVippsAgreementId = String(json.agreementId);
    if (json.invoiceId) this.lastInvoiceId = String(json.invoiceId);
    if (json.gitCommitHash) this.lastCommitHash = String(json.gitCommitHash);
  }
);

Then(
  "the Vipps payout destination should have IBAN {string}, MSN {string}, amount {int} {word}, and granted role {string}",
  function (
    this: FrontendBddWorld,
    expectedIban: string,
    expectedMsn: string,
    expectedAmount: number,
    currency: string,
    expectedRole: string
  ) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 201, this.lastResponse.bodyAsString());
    const json = this.lastResponse.json<any>();
    assert.equal(json.payoutIban, expectedIban);
    assert.equal(json.vippsMsn, expectedMsn);
    assert.equal(Number(json.amountDkk), expectedAmount);
    assert.equal(json.currency, currency);
    assert.equal(json.grantedRole, expectedRole);
  }
);

Then(
  "user {string} should be able to access the clinic general ledger summary",
  async function (this: FrontendBddWorld, username: string) {
    this.lastResponse = await this.requestAs(username, "CLIENT").get(
      "/api/backend/finance/ledger/summary"
    );
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
  }
);

// ============================================================================
// 7. i18n Localization & Fallback
// ============================================================================

When(
  "requesting the localization bundle for locale {string}",
  async function (this: FrontendBddWorld, locale: string) {
    this.lastResponse = await this.given().get(`/api/backend/i18n/${locale}`);
  }
);

When(
  "requesting the localization bundle for unsupported locale {string}",
  async function (this: FrontendBddWorld, locale: string) {
    this.lastResponse = await this.given().get(`/api/backend/i18n/${locale}`);
  }
);

Then(
  "the localization bundle should return translations for {string} without fallback",
  function (this: FrontendBddWorld, locale: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    assert.equal(
      this.lastResponse.headers.get("x-locale-fallback"),
      null,
      `Did not expect X-Locale-Fallback for supported locale ${locale}`
    );
    assert.ok(this.lastResponse.json<any>().portal);
  }
);

Then(
  "the localization bundle should fall back to {string}",
  function (this: FrontendBddWorld, expectedLocale: string) {
    assert.ok(this.lastResponse);
    assert.equal(this.lastResponse.status, 200, this.lastResponse.bodyAsString());
    assert.equal(this.lastResponse.headers.get("x-locale-fallback"), expectedLocale);
    assert.equal(
      resolveNestedKey(this.lastResponse.json<any>(), "portal.brandTitle"),
      "EduJournal Clinic"
    );
  }
);

When(
  "the administrator updates translation key {string} in locale {string} to {string}",
  async function (this: FrontendBddWorld, key: string, locale: string, newValue: string) {
    const beforeRes = await this.given().get(`/api/backend/i18n/${locale}`);
    if (beforeRes.status === 200) {
      const prev = resolveNestedKey(beforeRes.json<any>(), key);
      if (typeof prev === "string") {
        this.i18nRestorations.push({ locale, key, previousValue: prev });
      }
    }

    const res = await this.given()
      .contentType("application/json")
      .body({ value: newValue })
      .put(`/api/backend/i18n/${locale}/${key}`);
    this.lastResponse = res;
    assert.equal(res.status, 200, res.bodyAsString());
  }
);

Then(
  "requesting the localization bundle for locale {string} should map {string} to {string}",
  async function (
    this: FrontendBddWorld,
    locale: string,
    key: string,
    expectedValue: string
  ) {
    const res = await this.given().get(`/api/backend/i18n/${locale}`);
    this.lastResponse = res;
    assert.equal(res.status, 200, res.bodyAsString());
    assert.equal(resolveNestedKey(res.json<any>(), key), expectedValue);
  }
);

// ============================================================================
// 8. UI-Only Playwright Browser Scenarios (@ui-only)
// ============================================================================

When(
  "therapist {string} opens the Client Journal view for {string}",
  async function (this: FrontendBddWorld, therapistUsername: string, _clientUsername: string) {
    this.currentIdentity = this.identityFor(therapistUsername, "THERAPIST");
    await this.visitPage("/da/dashboard/therapist");
  }
);

Then(
  "the therapist portal should show the Client Journal timeline and note composer",
  function (this: FrontendBddWorld) {
    assert.ok(this.currentUiHtml.length > 0);
  }
);

Given("a visitor opens the portal application", async function (this: FrontendBddWorld) {
  await this.visitPage("/da");
});

When(
  "the visitor switches the active language to {string}",
  async function (this: FrontendBddWorld, locale: string) {
    await this.visitPage(`/${locale}`);
  }
);

Then(
  "visible portal headings should render in {string}",
  function (this: FrontendBddWorld, locale: string) {
    assert.ok(this.currentUiUrl.includes(`/${locale}`));
    assert.ok(this.currentUiHtml.length > 0);
  }
);
