import assert from "node:assert/strict";

export interface KeycloakTestIdentity {
  userUuid: string;
  username: string;
  fullName?: string;
  email?: string;
  roles: string[];
}

export class RestAssuredResponse {
  public readonly status: number;
  public readonly headers: Headers;
  public readonly rawBody: string;
  private readonly parsedJson: any;

  constructor(status: number, headers: Headers, rawBody: string) {
    this.status = status;
    this.headers = headers;
    this.rawBody = rawBody;
    try {
      this.parsedJson = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      this.parsedJson = null;
    }
  }

  public then(): RestAssuredAssertion {
    return new RestAssuredAssertion(this);
  }

  public json<T = any>(): T {
    return this.parsedJson as T;
  }

  public bodyAsString(): string {
    return this.rawBody;
  }
}

export class RestAssuredAssertion {
  constructor(private readonly response: RestAssuredResponse) {}

  public statusCode(expectedStatus: number): this {
    assert.equal(
      this.response.status,
      expectedStatus,
      `Expected HTTP status <${expectedStatus}> but was <${this.response.status}>. Body: ${this.response.rawBody}`
    );
    return this;
  }

  public bodyContains(substring: string): this {
    assert.ok(
      this.response.rawBody.includes(substring),
      `Expected response body to contain "${substring}", but got:\n${this.response.rawBody}`
    );
    return this;
  }

  public bodyDoesNotContain(substring: string): this {
    assert.ok(
      !this.response.rawBody.includes(substring),
      `Expected response body NOT to contain "${substring}", but it was present:\n${this.response.rawBody}`
    );
    return this;
  }

  public jsonPath(path: string, expectedValue: any): this {
    const actual = this.resolvePath(this.response.json(), path);
    assert.deepEqual(
      actual,
      expectedValue,
      `Expected JSON path "${path}" to equal ${JSON.stringify(
        expectedValue
      )}, but got ${JSON.stringify(actual)}`
    );
    return this;
  }

  public extract(): RestAssuredResponse {
    return this.response;
  }

  private resolvePath(obj: any, path: string): any {
    if (!obj) return undefined;
    return path
      .split(".")
      .reduce((acc, part) => (acc != null ? acc[part] : undefined), obj);
  }
}

export class RestAssuredRequestSpecification {
  private baseUrl: string;
  private reqHeaders: Record<string, string> = {};
  private reqBody?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  public baseUri(uri: string): this {
    this.baseUrl = uri.replace(/\/$/, "");
    return this;
  }

  public header(name: string, value: string): this {
    this.reqHeaders[name] = value;
    return this;
  }

  public headers(map: Record<string, string>): this {
    Object.assign(this.reqHeaders, map);
    return this;
  }

  public contentType(type: string): this {
    this.reqHeaders["Content-Type"] = type;
    return this;
  }

  public authAsKeycloakUser(identity: KeycloakTestIdentity): this {
    this.reqHeaders["X-Auth-User-Uuid"] = identity.userUuid;
    this.reqHeaders["X-Auth-Username"] = identity.username;
    this.reqHeaders["X-Auth-Full-Name"] =
      identity.fullName || identity.username;
    this.reqHeaders["X-Auth-Email"] =
      identity.email || `${identity.username}@klinik.dk`;
    this.reqHeaders["X-Auth-Roles"] = identity.roles.join(", ");
    return this;
  }

  public body(payload: any): this {
    if (typeof payload === "string") {
      this.reqBody = payload;
    } else {
      this.reqBody = JSON.stringify(payload);
      if (!this.reqHeaders["Content-Type"]) {
        this.reqHeaders["Content-Type"] = "application/json";
      }
    }
    return this;
  }

  public when(): this {
    return this;
  }

  public async get(path: string): Promise<RestAssuredResponse> {
    return this.send("GET", path);
  }

  public async post(path: string): Promise<RestAssuredResponse> {
    return this.send("POST", path);
  }

  public async put(path: string): Promise<RestAssuredResponse> {
    return this.send("PUT", path);
  }

  public async patch(path: string): Promise<RestAssuredResponse> {
    return this.send("PATCH", path);
  }

  public async delete(path: string): Promise<RestAssuredResponse> {
    return this.send("DELETE", path);
  }

  private async send(
    method: string,
    path: string
  ): Promise<RestAssuredResponse> {
    const url = path.startsWith("http")
      ? path
      : `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const res = await fetch(url, {
      method,
      headers: this.reqHeaders,
      body:
        method === "GET" || method === "HEAD" ? undefined : this.reqBody,
      redirect: "manual",
    });

    const rawText = await res.text();
    return new RestAssuredResponse(res.status, res.headers, rawText);
  }
}

export function given(baseUrl = "http://localhost:3000"): RestAssuredRequestSpecification {
  return new RestAssuredRequestSpecification(baseUrl);
}
