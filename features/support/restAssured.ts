import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

export interface KeycloakTestIdentity {
  userUuid: string;
  username: string;
  fullName?: string;
  email?: string;
  roles: string[];
  accessToken?: string;
}

export class RestAssuredResponse {
  public status: number;
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

  private _suppressThenable = false;

  public get then(): () => RestAssuredAssertion {
    if (this._suppressThenable) {
      return undefined as any;
    }
    return ((onFulfilled?: (value: any) => any) => {
      if (typeof onFulfilled === "function") {
        this._suppressThenable = true;
        try {
          return onFulfilled(this);
        } finally {
          this._suppressThenable = false;
        }
      }
      return new RestAssuredAssertion(this);
    }) as any;
  }

  public json<T = any>(): T {
    return this.parsedJson as T;
  }

  public bodyAsJson<T = any>(): T {
    return this.parsedJson as T;
  }

  public bodyAsString(): string {
    return this.rawBody;
  }
}

export class RestAssuredAssertion {
  private readonly response: RestAssuredResponse;

  constructor(response: RestAssuredResponse) {
    this.response = response;
  }

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
    if (identity.accessToken) {
      this.reqHeaders["Authorization"] = `Bearer ${identity.accessToken}`;
    }
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
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const fullUrl = path.startsWith("http")
      ? path
      : `${this.baseUrl}${normalizedPath}`;
    const parsedUrl = new URL(fullUrl);
    const bodyStr =
      method === "GET" || method === "HEAD" ? undefined : this.reqBody;

    const headers: Record<string, string> = {
      ...this.reqHeaders,
      Connection: "close",
    };
    if (bodyStr !== undefined) {
      headers["Content-Length"] = String(Buffer.byteLength(bodyStr, "utf8"));
    }

    const client = parsedUrl.protocol === "https:" ? https : http;

    return new Promise<RestAssuredResponse>((resolve, reject) => {
      const req = client.request(
        parsedUrl,
        {
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const rawText = Buffer.concat(chunks).toString("utf8");
            const respHeaders = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (Array.isArray(v)) {
                respHeaders.set(k, v.join(", "));
              } else if (typeof v === "string") {
                respHeaders.set(k, v);
              }
            }
            resolve(
              new RestAssuredResponse(
                res.statusCode || 500,
                respHeaders,
                rawText
              )
            );
          });
        }
      );

      req.on("error", reject);
      if (bodyStr !== undefined) {
        req.write(bodyStr);
      }
      req.end();
    });
  }
}

export function given(
  baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000"
): RestAssuredRequestSpecification {
  return new RestAssuredRequestSpecification(baseUrl);
}
