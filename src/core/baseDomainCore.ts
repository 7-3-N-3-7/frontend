/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: baseDomainCore.ts (Del 1 af 2-File Core Architecture)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/core/BaseDomainCore.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Denne fil udgør det 1:1 arkitektoniske modstykke til [Class: BaseDomainCore] på backenden.
 * Den samler alle rene TypeScript-domænekontrakter på tværs af de 10 vertikale slices:
 *
 * ARKITEKTONISK OVERBLIK (4 KERNEBYGGESTENE):
 *   1. [Interface: HasId<ID>], [Interface: PageResponse<DTO>] & [Interface: AuthenticatedUser]
 *      Fælles identitets-, paginerings- og RBAC-kontrakter samt #expandRoleAliases(role)
 *      og #matchesAnyRole(userRoles, allowedRoles).
 *   2. [Enum: ErrorCode] & [Interface: ProblemDetail]
 *      Standardiseret RFC 7807 fejlmodel, der spejler [Enum: ErrorCode] og
 *      [Class: GlobalExceptionHandler] i `BaseWebCore.java`.
 *   3. [Class: FrontendDomainException] & [Class: DomainGuard]
 *      Klient-side Design-by-Contract validering (#require, #requireNotBlank, #requirePositive),
 *      som spejler `ErrorCode#require(condition, details)` i Java.
 *   4. [AbstractClass: BaseApiService<DTO, ID>]
 *      Generisk REST-superklasse (Layer Supertype), som benytter Template Method Pattern
 *      via #validateBeforeCreate(dto) og #validateBeforeUpdate(id, dto) hooks — præcis
 *      som [AbstractClass: BaseService<Entity, DTO>] i Java.
 *
 * ARKITEKTONISK INVARIANT (Zero-React Boundary):
 * Denne fil må ALDRIG importere `react`, `react-dom` eller JSX-komponenter. Det sikrer, at
 * domænevalidering og API-kommunikation kan enhedstestes isoleret uden DOM-afhængigheder.
 * ============================================================================
 */

// ============================================================================
// 1. IDENTIFIABLE & RBAC ROLE CONTRACTS (Mirrors BaseDomainCore & Keycloak JWT)
// ============================================================================

/**
 * [Interface: HasId<ID>]
 * Universel identitetskontrakt for alle frontend [Record/DTO] typer.
 * @Spejler: BaseDomainCore.HasId
 */
export interface HasId<ID = string> {
  readonly id?: ID;
}

/**
 * [Interface: PageResponse<DTO>]
 * Kontrakt for paginerede svar fra Spring Data `Page<DTO>` (`/paged`).
 */
export interface PageResponse<DTO> {
  content: DTO[];
  totalElements: number;
  totalPages: number;
  size: number;
  number?: number;
  page?: number;
}

/**
 * Forenet RBAC-rollevokabular, der bygger bro mellem Frontend SoC-rollerne
 * (`CLIENT`, `PROVIDER`, `MANAGEMENT`) og Backend/Keycloak-rollerne
 * (`CLIENT`, `THERAPIST`, `ADMIN`).
 */
export type UserRole =
  | "CLIENT"
  | "PROVIDER"
  | "THERAPIST"
  | "MANAGEMENT"
  | "ADMIN";

/**
 * [Interface: AuthenticatedUser]
 * Repræsenterer den aktuelt indloggede bruger i portalen med tilknyttede `roles`.
 */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
}

/**
 * Eksplicit synonym-kort mellem Frontend SoC-roller og Keycloak/Backend-roller:
 *   - `PROVIDER` <-> `THERAPIST` (Klinisk behandler)
 *   - `MANAGEMENT` <-> `ADMIN`   (Klinikledelse & B2B administration)
 */
export const ROLE_SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<UserRole>> = [
  ["PROVIDER", "THERAPIST"],
  ["MANAGEMENT", "ADMIN"],
];

/**
 * #expandRoleAliases(role) — Udvider en `role` med dens kendte synonymer fra `ROLE_SYNONYM_GROUPS`.
 */
export function expandRoleAliases(role: UserRole): UserRole[] {
  for (const synonymGroup of ROLE_SYNONYM_GROUPS) {
    if (synonymGroup.includes(role)) {
      return [...synonymGroup];
    }
  }
  return ["CLIENT"];
}

/**
 * #matchesAnyRole(userRoles, allowedRoles) — Afprøver om brugerens `userRoles`
 * (inkl. synonymer) matcher mindst én rolle i `allowedRoles`.
 */
export function matchesAnyRole(
  userRoles: readonly UserRole[],
  allowedRoles: readonly UserRole[]
): boolean {
  const expandedUserRoles = new Set<UserRole>();
  for (const role of userRoles) {
    for (const alias of expandRoleAliases(role)) {
      expandedUserRoles.add(alias);
    }
  }
  return allowedRoles.some((allowed) => expandedUserRoles.has(allowed));
}

// ============================================================================
// 2. FUNCTIONAL ERROR CODE & RFC 7807 PROBLEM DETAIL (Mirrors ErrorCode & GlobalExceptionHandler)
// ============================================================================

/**
 * [Enum: ErrorCode]
 * Maskinlæsbare fejlkoder, der matcher [Enum: BaseDomainCore.ErrorCode] 1:1.
 */
export const ErrorCode = {
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  BAD_REQUEST: "BAD_REQUEST",
  ACCESS_DENIED: "ACCESS_DENIED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * [Interface: ProblemDetail]
 * Nøjagtig 1:1 JSON-kontrakt, der matcher IETF RFC 7807 `org.springframework.http.ProblemDetail`
 * fra [Class: BaseWebCore.GlobalExceptionHandler].
 */
export interface ProblemDetail {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errorCode: ErrorCode;
  timestamp: string;
  fieldErrors?: Record<string, string>;
  fields?: Record<string, string>;
}

/**
 * [Class: FrontendDomainException]
 * Struktureret domæne-exception i frontenden, der bærer et fuldt [Interface: ProblemDetail]-objekt.
 * Kan oprettes enten lokalt af [Class: DomainGuard] (før netværkskald) eller ved HTTP-fejl fra backend.
 * @Spejler: BaseDomainCore.DomainException
 */
export class FrontendDomainException extends Error {
  public readonly problem: ProblemDetail;

  constructor(
    problemOrMessage: ProblemDetail | string,
    errorCode: ErrorCode = ErrorCode.VALIDATION_FAILED,
    status = 400,
    field?: string
  ) {
    if (typeof problemOrMessage === "string") {
      super(problemOrMessage);
      const fieldMap = field ? { [field]: problemOrMessage } : undefined;
      this.problem = {
        type: "about:blank",
        title: "Client Domain Validation Error",
        status,
        detail: problemOrMessage,
        errorCode,
        timestamp: new Date().toISOString(),
        fieldErrors: fieldMap,
        fields: fieldMap,
      };
    } else {
      super(problemOrMessage.detail || problemOrMessage.title);
      const mergedFields =
        problemOrMessage.fieldErrors ?? problemOrMessage.fields;
      this.problem = {
        type: problemOrMessage.type || "about:blank",
        ...problemOrMessage,
        fieldErrors: mergedFields,
        fields: mergedFields,
      };
    }
    this.name = "FrontendDomainException";
    Object.setPrototypeOf(this, FrontendDomainException.prototype);
  }

  public get status(): number {
    return this.problem.status;
  }

  public get errorCode(): ErrorCode {
    return this.problem.errorCode;
  }

  public is(code: ErrorCode): boolean {
    return this.problem.errorCode === code;
  }
}

/**
 * [Class: DomainGuard]
 * Funktionel klient-side precondition-validering (Design by Contract).
 * Kaster en [Class: FrontendDomainException] øjeblikkeligt, hvis en domæneregel brydes,
 * så ugyldige requests stoppes inden de rammer netværket.
 * @Spejler: BaseDomainCore.ErrorCode#require
 */
export const DomainGuard = {
  /** #require(condition, errorCode, detail, status, field) — Kaster [Class: FrontendDomainException] hvis `condition` er `false`. */
  require(
    condition: boolean,
    errorCode: ErrorCode,
    detail: string,
    status = 400,
    field?: string
  ): void {
    if (!condition) {
      throw new FrontendDomainException(detail, errorCode, status, field);
    }
  },

  /** #requireNotBlank(value, fieldName, fieldKey) — Sikrer at en tekstværdi `value` ikke er tom eller kun whitespace. */
  requireNotBlank(
    value: string | null | undefined,
    fieldName: string,
    fieldKey?: string
  ): void {
    if (!value || value.trim().length === 0) {
      throw new FrontendDomainException(
        `${fieldName} must not be blank`,
        ErrorCode.VALIDATION_FAILED,
        400,
        fieldKey ?? fieldName
      );
    }
  },

  /** #check(condition, message, errorCode, fieldKey) — Kortform til generel invariant-validering. */
  check(
    condition: boolean,
    message: string,
    errorCode: ErrorCode = ErrorCode.VALIDATION_FAILED,
    fieldKey?: string
  ): void {
    if (!condition) {
      throw new FrontendDomainException(message, errorCode, 400, fieldKey);
    }
  },

  /** #requirePositive(value, fieldName, fieldKey) — Sikrer at et numerisk beløb/tal `value` er skarpt større end 0. */
  requirePositive(
    value: number | null | undefined,
    fieldName: string,
    fieldKey?: string
  ): void {
    if (value === null || value === undefined || Number.isNaN(value) || value <= 0) {
      throw new FrontendDomainException(
        `${fieldName} must be greater than zero`,
        ErrorCode.VALIDATION_FAILED,
        400,
        fieldKey ?? fieldName
      );
    }
  },
};

// ============================================================================
// 3. BASE API SERVICE (Layer Supertype mirroring BaseService / BaseController)
// ============================================================================

/**
 * [AbstractClass: BaseApiService<DTO, ID>]
 * Generisk HTTP/REST-klient (Layer Supertype) for alle vertikale feature-slices.
 * Implementerer Template Method Pattern for #create(dto) og #update(id, dto)
 * og oversætter automatisk HTTP-fejlsvar til [Class: FrontendDomainException].
 *
 * @template DTO Datakontrakten for slicen (implementerer [Interface: HasId<ID>])
 * @template ID  Primærnøgletypen (standard `string` / UUID)
 * @Spejler: BaseDomainCore.BaseService & BaseWebCore.BaseController
 */
export abstract class BaseApiService<DTO extends HasId<ID>, ID = string> {
  protected constructor(protected readonly basePath: string) {}

  /** #validateBeforeCreate(dto) — Template Method hook før `POST` (overskrives i vertikale slices). */
  protected validateBeforeCreate(_dto: Partial<DTO>): void {}

  /** #validateBeforeUpdate(id, dto) — Template Method hook før `PUT` (overskrives i vertikale slices). */
  protected validateBeforeUpdate(_id: ID, _dto: Partial<DTO>): void {}

  /** #getAuthHeaders() — Tilføjer `Authorization: Bearer <token>` hvis et token findes i `sessionStorage`. */
  protected getAuthHeaders(): HeadersInit {
    if (typeof sessionStorage !== "undefined") {
      const token = sessionStorage.getItem("access_token");
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    }
    return {};
  }

  /**
   * #request(subPath, options) — Udfører HTTP-kald mod `basePath` og håndterer RFC 7807 `ProblemDetail`.
   */
  protected async request<ResponseType>(
    subPath: string = "",
    options: RequestInit = {}
  ): Promise<ResponseType> {
    // Trin 1: Send HTTP-request med JSON- og RFC 7807 `application/problem+json` Accept-headers
    const response = await fetch(`${this.basePath}${subPath}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/problem+json",
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });

    // Trin 2: Ved HTTP-fejlstatus (!response.ok) parses svaret som RFC 7807 [Interface: ProblemDetail]
    if (!response.ok) {
      let problem: ProblemDetail;
      try {
        const rawProblem = (await response.json()) as Partial<ProblemDetail>;
        const mergedFields = rawProblem.fieldErrors ?? rawProblem.fields;
        problem = {
          type: rawProblem.type || "about:blank",
          title: rawProblem.title || response.statusText || "Request Error",
          status: rawProblem.status ?? response.status,
          detail:
            rawProblem.detail ||
            rawProblem.title ||
            `Unexpected server error (HTTP ${response.status})`,
          errorCode: rawProblem.errorCode || ErrorCode.INTERNAL_ERROR,
          timestamp: rawProblem.timestamp || new Date().toISOString(),
          fieldErrors: mergedFields,
          fields: mergedFields,
        };
      } catch {
        problem = {
          type: "about:blank",
          title: response.statusText || "Network Error",
          status: response.status,
          detail: "An unexpected network or server error occurred.",
          errorCode: ErrorCode.INTERNAL_ERROR,
          timestamp: new Date().toISOString(),
        };
      }
      throw new FrontendDomainException(problem);
    }

    // Trin 3: Returner `undefined` ved HTTP 204 No Content eller tom 2xx body; ellers parse JSON-payload
    if (response.status === 204) {
      return undefined as ResponseType;
    }

    if (typeof response.text === 'function') {
      const rawText = await response.text();
      if (!rawText || !rawText.trim()) {
        return undefined as ResponseType;
      }
      return JSON.parse(rawText) as ResponseType;
    }

    try {
      return (await response.json()) as ResponseType;
    } catch {
      return undefined as ResponseType;
    }
  }

  /** #getAll() — Henter alle ressourcer (`GET`). */
  public getAll(): Promise<DTO[]> {
    return this.request<DTO[]>();
  }

  /** #getPage(page, size) — Henter en pagineret side (`GET ?page=...&size=...`). */
  public getPage(page = 0, size = 20): Promise<PageResponse<DTO>> {
    return this.request<PageResponse<DTO>>(`?page=${page}&size=${size}`);
  }

  /** #getAllPaged(page, size) — Alias for #getPage(page, size) som matcher `BaseController#getAllPaged`. */
  public getAllPaged(page = 0, size = 20): Promise<PageResponse<DTO>> {
    return this.getPage(page, size);
  }

  /** #getById(id) — Henter én ressource ud fra `id` (`GET /{id}`). */
  public getById(id: ID): Promise<DTO> {
    DomainGuard.requireNotBlank(String(id), "ID", "id");
    return this.request<DTO>(`/${encodeURIComponent(String(id))}`);
  }

  /** #create(dto) — Kører #validateBeforeCreate(dto) og sender `POST` med `dto`. */
  public async create(dto: Partial<DTO>): Promise<DTO> {
    this.validateBeforeCreate(dto);
    return this.request<DTO>("", {
      method: "POST",
      body: JSON.stringify(dto),
    });
  }

  /** #update(id, dto) — Kører #validateBeforeUpdate(id, dto) og sender `PUT /{id}` med `dto`. */
  public async update(id: ID, dto: Partial<DTO>): Promise<DTO> {
    DomainGuard.requireNotBlank(String(id), "ID", "id");
    this.validateBeforeUpdate(id, dto);
    return this.request<DTO>(`/${encodeURIComponent(String(id))}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
  }

  /** #delete(id) — Sletter ressourcen med `id` (`DELETE /{id}`). */
  public async delete(id: ID): Promise<void> {
    DomainGuard.requireNotBlank(String(id), "ID", "id");
    return this.request<void>(`/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
    });
  }

  /** #deleteById(id) — Alias for #delete(id) som matcher `BaseService#deleteById`. */
  public deleteById(id: ID): Promise<void> {
    return this.delete(id);
  }
}
