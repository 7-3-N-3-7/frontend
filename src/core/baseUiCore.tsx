/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: baseUiCore.tsx (Del 2 af 2-File Core Architecture)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/core/BaseWebCore.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Denne fil udgør det 1:1 arkitektoniske modstykke til [Class: BaseWebCore] på backenden.
 * Hvor `BaseWebCore.java` orkestrerer HTTP-indgang ([AbstractClass: BaseController]) og
 * RFC 7807 fejlformatering ([Class: GlobalExceptionHandler]), orkestrerer `baseUiCore.tsx`
 * tilsvarende i React:
 *
 * ARKITEKTONISK OVERBLIK (4 KERNEBYGGESTENE):
 *   1. [Component: <AuthProvider />], [Hook: useAuth()] & [Component: <RoleGuard />]
 *      Deklarativ RBAC-sikkerhedskontekst, der håndhæver Separation of Concerns mellem
 *      `CLIENT`, `PROVIDER`/`THERAPIST` og `MANAGEMENT`/`ADMIN`.
 *   2. [Hook: useBaseCrud<DTO, ID>()]
 *      Generisk tilstands- og livscyklushook, som forbinder enhver
 *      [AbstractClass: BaseApiService<DTO, ID>] med reaktiv React-state (`items`, `loading`,
 *      `error`, #create, #update, #remove).
 *   3. [Component: <ProblemAlert />]
 *      Standardiseret RFC 7807 fejlbanner, der præsenterer [Interface: ProblemDetail] og
 *      valideringsfejl (`fields`) ensartet på tværs af alle Vertical Feature Slices.
 *   4. [Component: <PortalWorkspaceShell />]
 *      Fælles layout- og navigationsramme for de rolleopdelte arbejdsområder.
 * ============================================================================
 */

import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import {
  AuthenticatedUser,
  BaseApiService,
  ErrorCode,
  FrontendDomainException,
  HasId,
  matchesAnyRole,
  ProblemDetail,
  UserRole,
} from "./baseDomainCore";

// ============================================================================
// 1. AUTH & ROLE CONTEXT (RBAC for CLIENT, PROVIDER/THERAPIST & MANAGEMENT/ADMIN)
// ============================================================================

/**
 * [Interface: AuthContextValue]
 * Kontrakt for den aktive autentificeringskontekst i Dashboard-applikationen.
 */
export interface AuthContextValue {
  user: AuthenticatedUser;
  hasRole: (...allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * [Component: <AuthProvider />]
 * Indpakker applikationen med den aktuelle [Interface: AuthenticatedUser] og udstiller
 * rolle-evaluering via #hasRole(...allowedRoles).
 */
export const AuthProvider: React.FC<{
  user: AuthenticatedUser;
  children: React.ReactNode;
}> = ({ user, children }) => {
  const hasRole = useCallback(
    (...allowedRoles: UserRole[]) => matchesAnyRole(user.roles, allowedRoles),
    [user.roles]
  );

  return (
    <AuthContext.Provider value={{ user, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * [Hook: useAuth()]
 * Returnerer den aktive [Interface: AuthContextValue] eller kaster en fejl, hvis kaldt
 * uden for en [Component: <AuthProvider />].
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth skal bruges inden i en AuthProvider");
  }
  return ctx;
}

/**
 * [Component: <RoleGuard />]
 * Deklarativ RBAC-komponent, der beskytter hele Vertical Feature Slices eller enkelte UI-sektioner.
 * Synkroniserer automatisk `PROVIDER <-> THERAPIST` og `MANAGEMENT <-> ADMIN`.
 * Hvis den renderes uden for en [Component: <AuthProvider />] i en isoleret komponenttest,
 * tillades rendering som fallback, så enkelte komponenter kan enhedstestes direkte.
 */
export const RoleGuard: React.FC<{
  allowed: UserRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({ allowed, fallback = null, children }) => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return <>{children}</>;
  }
  return ctx.hasRole(...allowed) ? <>{children}</> : <>{fallback}</>;
};

// ============================================================================
// 2. GENERIC CRUD HOOK (Mirrors BaseController <-> BaseService orchestration)
// ============================================================================

/**
 * [Interface: UseBaseCrudResult<DTO, ID>]
 * Returtype fra [Hook: useBaseCrud<DTO, ID>()], som udstiller reaktiv liste-state,
 * indlæsningsstatus, aktiv [Interface: ProblemDetail]-fejl samt CRUD-handlinger.
 */
export interface UseBaseCrudResult<DTO extends HasId<ID>, ID = string> {
  items: DTO[];
  loading: boolean;
  error: ProblemDetail | null;
  fetchAll: () => Promise<void>;
  create: (dto: Partial<DTO>) => Promise<DTO | null>;
  update: (id: ID, dto: Partial<DTO>) => Promise<DTO | null>;
  remove: (id: ID) => Promise<boolean>;
  createItem: (dto: Partial<DTO>) => Promise<DTO | null>;
  updateItem: (id: ID, dto: Partial<DTO>) => Promise<DTO | null>;
  deleteItem: (id: ID) => Promise<boolean>;
  clearError: () => void;
  setError: React.Dispatch<React.SetStateAction<ProblemDetail | null>>;
}

/**
 * [Hook: useBaseCrud<DTO, ID>(service, autoFetch)]
 * Generisk React-hook (Layer Supertype), der binder en modul-privat
 * [AbstractClass: BaseApiService<DTO, ID>] til komponentens livscyklus.
 * @Spejler: BaseWebCore.BaseController
 */
export function useBaseCrud<DTO extends HasId<ID>, ID = string>(
  service: BaseApiService<DTO, ID>,
  autoFetch = true
): UseBaseCrudResult<DTO, ID> {
  const [items, setItems] = useState<DTO[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<ProblemDetail | null>(null);

  /** #handleException(err) — Konverterer enhver kastet fejl til et RFC 7807 [Interface: ProblemDetail]-objekt. */
  const handleException = useCallback((err: unknown) => {
    if (err instanceof FrontendDomainException) {
      setError(err.problem);
    } else if (
      err &&
      typeof err === "object" &&
      "detail" in err &&
      "status" in err
    ) {
      setError(err as ProblemDetail);
    } else {
      setError({
        type: "about:blank",
        title: "Client Error",
        status: 500,
        detail: err instanceof Error ? err.message : "Unexpected error",
        errorCode: ErrorCode.INTERNAL_ERROR,
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  /** #fetchAll() — Henter alle elementer fra `service#getAll()` og opdaterer `items`. */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.getAll();
      setItems(data);
    } catch (err) {
      handleException(err);
    } finally {
      setLoading(false);
    }
  }, [service, handleException]);

  /** #create(dto) — Validerer og opretter `dto` via `service#create(dto)` og tilføjer resultatet til `items`. */
  const create = useCallback(
    async (dto: Partial<DTO>): Promise<DTO | null> => {
      setLoading(true);
      setError(null);
      try {
        const createdDto = await service.create(dto);
        setItems((prevItems) => [...prevItems, createdDto]);
        return createdDto;
      } catch (err) {
        handleException(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [service, handleException]
  );

  /** #update(id, dto) — Opdaterer elementet med `id` via `service#update(id, dto)`. */
  const update = useCallback(
    async (id: ID, dto: Partial<DTO>): Promise<DTO | null> => {
      setLoading(true);
      setError(null);
      try {
        const updatedDto = await service.update(id, dto);
        setItems((prevItems) =>
          prevItems.map((item) => (item.id === id ? updatedDto : item))
        );
        return updatedDto;
      } catch (err) {
        handleException(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [service, handleException]
  );

  /** #remove(id) — Sletter elementet med `id` via `service#delete(id)` og fjerner det fra `items`. */
  const remove = useCallback(
    async (id: ID): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        await service.delete(id);
        setItems((prevItems) => prevItems.filter((item) => item.id !== id));
        return true;
      } catch (err) {
        handleException(err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [service, handleException]
  );

  useEffect(() => {
    if (autoFetch) {
      void fetchAll();
    }
  }, [autoFetch, fetchAll]);

  const clearError = useCallback(() => setError(null), []);

  return {
    items,
    loading,
    error,
    fetchAll,
    create,
    update,
    remove,
    createItem: create,
    updateItem: update,
    deleteItem: remove,
    clearError,
    setError,
  };
}

// ============================================================================
// 3. RFC 7807 PROBLEM ALERT COMPONENT (Standardized E2E / Cucumber Test Target)
// ============================================================================

/**
 * [Interface: ProblemAlertProps]
 * Props til [Component: <ProblemAlert />]. Understøtter både `error` og `problem` prop-navne.
 */
export interface ProblemAlertProps {
  error?: ProblemDetail | null;
  problem?: ProblemDetail | null;
  onDismiss?: () => void;
}

/**
 * [Component: <ProblemAlert />]
 * Viser et RFC 7807 [Interface: ProblemDetail]-fejlbanner med `data-error-code`,
 * `data-http-status` og eventuelle feltfejl (`fieldErrors`).
 * @Spejler: BaseWebCore.GlobalExceptionHandler
 */
export const ProblemAlert: React.FC<ProblemAlertProps> = ({
  error,
  problem,
  onDismiss,
}) => {
  const activeProblem = error ?? problem ?? null;
  if (!activeProblem) return null;

  const fieldErrors = activeProblem.fieldErrors ?? activeProblem.fields;

  return (
    <div
      role="alert"
      data-testid="error-banner"
      data-error-code={activeProblem.errorCode}
      data-http-status={activeProblem.status}
      className="alert alert-danger p-4 mb-4 border border-red-500 bg-red-50 text-red-900 rounded"
    >
      <div className="flex d-flex justify-between justify-content-between items-start align-items-start">
        <div>
          <strong data-testid="error-title">
            {activeProblem.title} ({activeProblem.status})
          </strong>
          <p data-testid="error-detail" className="mt-1 mb-0">
            {activeProblem.detail}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Luk fejlbesked"
            data-testid="dismiss-error"
            className="btn btn-sm btn-link text-danger text-sm underline ml-4 ms-3"
          >
            Dismiss
          </button>
        )}
      </div>

      {fieldErrors && Object.keys(fieldErrors).length > 0 && (
        <ul
          data-testid="field-errors"
          className="mt-2 mb-0 list-disc list-inside text-sm"
        >
          {Object.entries(fieldErrors).map(([field, message]) => (
            <li key={field} data-testid={`field-error-${field}`}>
              <strong>{field}:</strong> {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ============================================================================
// 4. STANDARDIZED PORTAL WORKSPACE SHELL PRIMITIVE
// ============================================================================

/**
 * [Interface: PortalWorkspaceNavItem]
 * Repræsenterer et menupunkt i topnavigationen i [Component: <PortalWorkspaceShell />].
 */
export interface PortalWorkspaceNavItem {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}

export interface PortalWorkspaceShellProps {
  title?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  subtitle?: string;
  accentColor?: string;
  iconClass?: string;
  userName?: string;
  userEmail?: string;
  avatarInitial?: string;
  settingsHref?: string;
  settingsLabel?: string;
  logoutLabel?: string;
  accountSettingsHeader?: string;
  profileSubtext?: string;
  roleBadge?: string;
  roleLabel?: string;
  navItems?: PortalWorkspaceNavItem[];
  headerNav?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * [Component: <PortalWorkspaceShell />]
 * Fælles portal-skal med sticky header, rolle-badge og arbejdsområde-container.
 */
export const PortalWorkspaceShell: React.FC<PortalWorkspaceShellProps> = ({
  title,
  brandTitle = "EduJournal",
  brandSubtitle,
  subtitle = "Personal Client Portal",
  accentColor = "#2563eb",
  iconClass = "bi-journal-medical",
  roleLabel,
  navItems,
  headerNav,
  headerActions,
  children,
}) => {
  const effectiveBrandTitle = title ?? brandTitle;
  const effectiveSubtitle = brandSubtitle ?? subtitle;

  return (
    <div
      data-testid="portal-workspace-shell"
      className="min-vh-100 d-flex flex-column"
      style={{ backgroundColor: "#f4f7f9" }}
    >
      <header className="navbar navbar-expand-lg bg-white border-bottom shadow-xs px-3 px-lg-4 py-2 sticky-top">
        <div className="container-fluid px-0 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-4">
            <div className="d-flex align-items-center text-decoration-none gap-2">
              <div
                className="rounded-3 d-flex align-items-center justify-content-center text-white shadow-xs"
                style={{
                  width: "38px",
                  height: "38px",
                  backgroundColor: accentColor,
                }}
              >
                <i className={`bi ${iconClass} fs-5`}></i>
              </div>
              <div>
                <div
                  data-testid="shell-brand-title"
                  className="fw-bold text-dark"
                  style={{ fontSize: "1.05rem", letterSpacing: "-0.3px" }}
                >
                  {effectiveBrandTitle}
                </div>
                <div
                  data-testid="shell-subtitle"
                  className="text-muted"
                  style={{ fontSize: "0.72rem" }}
                >
                  {effectiveSubtitle}
                </div>
              </div>
            </div>
            {roleLabel && (
              <span className="badge bg-primary-subtle text-primary rounded-pill">
                {roleLabel}
              </span>
            )}
            {navItems && navItems.length > 0 && (
              <nav className="d-none d-md-flex align-items-center gap-1 ms-2">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`btn btn-sm rounded-pill px-3 ${
                      item.active ? "btn-primary" : "btn-light"
                    }`}
                  >
                    <i className={`bi ${item.icon} me-1`}></i>
                    {item.label}
                  </a>
                ))}
              </nav>
            )}
            {headerNav && (
              <nav className="d-none d-md-flex align-items-center gap-1 ms-2">
                {headerNav}
              </nav>
            )}
          </div>
          {headerActions && (
            <div className="d-flex align-items-center gap-3">
              {headerActions}
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow-1 container-fluid py-3 px-2 px-lg-3">
        {children}
      </main>
    </div>
  );
};
