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
  user: AuthenticatedUser | null;
  children: React.ReactNode;
}> = ({ user, children }) => {
  const hasRole = useCallback(
    (...allowedRoles: UserRole[]) =>
      matchesAnyRole(user!.roles, allowedRoles),
    [user]
  );

  return (
    <AuthContext.Provider value={user ? { user, hasRole } : null}>
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
 * [Hook: useOptionalAuth()]
 * Returnerer aktiv [Interface: AuthContextValue] hvis komponenten er wrappet i
 * [Component: <AuthProvider />], ellers null (nyttig til standalone feature-tests).
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
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
      className="mb-4 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-950 shadow-xs"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <i
              className="bi bi-exclamation-triangle-fill text-sm"
              aria-hidden="true"
            />
          </span>
          <div>
            <strong
              data-testid="error-title"
              className="block text-sm font-semibold text-rose-950"
            >
              {activeProblem.title} ({activeProblem.status})
            </strong>
            <p
              data-testid="error-detail"
              className="mt-1 mb-0 text-sm text-rose-800"
            >
              {activeProblem.detail}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Luk fejlbesked"
            data-testid="dismiss-error"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
            <span>Dismiss</span>
          </button>
        )}
      </div>

      {fieldErrors && Object.keys(fieldErrors).length > 0 && (
        <ul
          data-testid="field-errors"
          className="mt-3 mb-0 list-disc space-y-1 rounded-lg bg-white/75 px-4 py-2.5 pl-7 text-xs text-rose-900"
        >
          {Object.entries(fieldErrors).map(([field, message]) => (
            <li key={field} data-testid={`field-error-${field}`}>
              <strong className="font-semibold">{field}:</strong> {message}
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

export type PortalArea = "client" | "therapist" | "admin";

/**
 * [Interface: PortalWorkspaceNavItem]
 * Repræsenterer et menupunkt i sidepanel-navigationen i [Component: <PortalWorkspaceShell />].
 */
export interface PortalWorkspaceNavItem {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
}

/**
 * [Interface: PortalSwitcherOption]
 * Repræsenterer en rolle-/portalindgang i toppen af sidepanelet.
 */
export interface PortalSwitcherOption {
  area: PortalArea;
  href: string;
  label: string;
  icon: string;
  active: boolean;
}

/**
 * [Interface: PortalUpgradeAction]
 * Valgfri CTA i sidepanelets bund (f.eks. "Bliv behandler" for klienter).
 */
export interface PortalUpgradeAction {
  label: string;
  href: string;
  icon?: string;
  description?: string;
}

export interface PortalWorkspaceShellProps {
  title?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  subtitle?: string;
  pageTitle?: string;
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
  portalOptions?: PortalSwitcherOption[];
  upgradeAction?: PortalUpgradeAction;
  defaultSidebarCollapsed?: boolean;
  onNavigate?: (href: string) => void;
  onLogout?: () => void;
  shellError?: ProblemDetail | null;
  onDismissShellError?: () => void;
  headerNav?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * [Component: <PortalWorkspaceShell />]
 * Fælles Nordic HealthTech SaaS app-shell med kollapsbart sidepanel,
 * portalvælger, sticky topbar, brugermenu og standardiseret RFC 7807-fejlvisning.
 */
export const PortalWorkspaceShell: React.FC<PortalWorkspaceShellProps> = ({
  title,
  brandTitle = "EduJournal",
  brandSubtitle,
  subtitle = "Personal Client Portal",
  pageTitle,
  accentColor = "#0f766e",
  iconClass = "bi-journal-medical",
  userName = "Bruger",
  userEmail,
  avatarInitial,
  settingsHref,
  settingsLabel = "Indstillinger",
  logoutLabel = "Log ud",
  accountSettingsHeader = "Konto",
  profileSubtext,
  roleBadge,
  roleLabel,
  navItems,
  portalOptions,
  upgradeAction,
  defaultSidebarCollapsed = false,
  onNavigate,
  onLogout,
  shellError,
  onDismissShellError,
  headerNav,
  headerActions,
  children,
}) => {
  const effectiveBrandTitle = title ?? brandTitle;
  const effectiveSubtitle = brandSubtitle ?? subtitle;
  const effectiveInitial =
    avatarInitial || userName.trim().charAt(0).toUpperCase() || "B";

  const [collapsed, setCollapsed] = useState<boolean>(defaultSidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    setCollapsed(defaultSidebarCollapsed);
  }, [defaultSidebarCollapsed]);

  const handleNavigation = (
    href: string,
    event: React.MouseEvent<HTMLElement>
  ) => {
    setMobileOpen(false);
    if (!onNavigate) {
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  };

  const renderSidebarBody = (isCollapsed: boolean, keyPrefix: string) => (
    <div className="flex h-full flex-col">
      {portalOptions && portalOptions.length > 0 && (
        <div
          data-testid={keyPrefix === "desktop" ? "role-switcher" : "mobile-role-switcher"}
          className="border-b border-slate-100 px-3 py-3"
        >
          {!isCollapsed && (
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Skift arbejdsområde
            </div>
          )}
          <div className="space-y-1">
            {portalOptions.map((option) => (
              <a
                key={`${keyPrefix}-${option.area}`}
                href={option.href}
                title={option.label}
                aria-current={option.active ? "page" : undefined}
                data-testid={
                  keyPrefix === "desktop"
                    ? `portal-switch-${option.area}`
                    : `mobile-portal-switch-${option.area}`
                }
                onClick={(e) => handleNavigation(option.href, e)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold no-underline transition-colors ${
                  isCollapsed ? "justify-center" : ""
                } ${
                  option.active
                    ? "bg-teal-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <i className={`bi ${option.icon} text-sm`} aria-hidden="true" />
                {!isCollapsed && <span className="truncate">{option.label}</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      {navItems && navItems.length > 0 && (
        <nav
          aria-label="Portalnavigation"
          className="flex-1 space-y-1 overflow-y-auto px-3 py-3"
        >
          {!isCollapsed && (
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Funktioner
            </div>
          )}
          {navItems.map((item, idx) => (
            <a
              key={`${keyPrefix}-${item.href}-${idx}`}
              href={item.href}
              title={item.label}
              aria-current={item.active ? "page" : undefined}
              data-testid={
                keyPrefix === "desktop"
                  ? `sidebar-nav-${idx}`
                  : `mobile-sidebar-nav-${idx}`
              }
              onClick={(e) => handleNavigation(item.href, e)}
              className={`flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium no-underline transition-colors ${
                isCollapsed ? "justify-center" : ""
              } ${
                item.active
                  ? "border border-teal-200 bg-teal-50 text-teal-800 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span
                className={`flex min-w-0 items-center gap-2.5 ${
                  isCollapsed ? "justify-center" : ""
                }`}
              >
                <i className={`bi ${item.icon} text-base`} aria-hidden="true" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </span>
              {!isCollapsed && item.badge && (
                <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>
      )}

      {!navItems?.length && <div className="flex-1" />}

      {upgradeAction && (
        <div className="border-t border-slate-100 p-3">
          <a
            href={upgradeAction.href}
            title={upgradeAction.label}
            data-testid={
              keyPrefix === "desktop"
                ? "upgrade-therapist-cta"
                : "mobile-upgrade-therapist-cta"
            }
            onClick={(e) => handleNavigation(upgradeAction.href, e)}
            className={`flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50/80 p-2.5 text-teal-900 no-underline transition-colors hover:bg-teal-100/80 ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white">
              <i
                className={`bi ${upgradeAction.icon || "bi-briefcase-fill"} text-sm`}
                aria-hidden="true"
              />
            </span>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-teal-950">
                  {upgradeAction.label}
                </div>
                {upgradeAction.description && (
                  <div className="truncate text-[11px] text-teal-700">
                    {upgradeAction.description}
                  </div>
                )}
              </div>
            )}
          </a>
        </div>
      )}
    </div>
  );

  return (
    <div
      data-testid="portal-workspace-shell"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      className="flex min-h-screen bg-slate-50 text-slate-900"
    >
      {/* Desktop Sidebar */}
      <aside
        aria-label="Hovedsidepanel"
        data-testid="desktop-sidebar"
        className={`hidden md:flex md:shrink-0 md:flex-col border-r border-slate-200/80 bg-white transition-all duration-200 ${
          collapsed ? "md:w-20" : "md:w-64"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-xs"
              style={{ backgroundColor: accentColor }}
            >
              <i className={`bi ${iconClass} text-base`} aria-hidden="true" />
            </div>
            <div className={collapsed ? "sr-only" : "min-w-0"}>
              <div
                data-testid="shell-brand-title"
                className="truncate text-sm font-bold tracking-tight text-slate-900"
              >
                {effectiveBrandTitle}
              </div>
              <div
                data-testid="shell-subtitle"
                className="truncate text-[11px] font-medium text-slate-500"
              >
                {effectiveSubtitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Udvid sidepanel" : "Minimer sidepanel"}
            data-testid="sidebar-collapse-toggle"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <i
              className={`bi ${
                collapsed ? "bi-chevron-right" : "bi-chevron-left"
              } text-xs`}
              aria-hidden="true"
            />
          </button>
        </div>

        {renderSidebarBody(collapsed, "desktop")}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          data-testid="mobile-sidebar-drawer"
        >
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  <i className={`bi ${iconClass} text-base`} aria-hidden="true" />
                </div>
                <span className="text-sm font-bold text-slate-900">
                  {effectiveBrandTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Luk menu"
                data-testid="mobile-menu-close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <i className="bi bi-x-lg text-sm" aria-hidden="true" />
              </button>
            </div>
            {renderSidebarBody(false, "mobile")}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-sm lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Åbn menu"
              data-testid="mobile-menu-toggle"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 md:hidden"
            >
              <i className="bi bi-list text-lg" aria-hidden="true" />
            </button>

            {pageTitle && (
              <span
                data-testid="shell-page-title"
                className="truncate text-sm font-semibold text-slate-900 lg:text-base"
              >
                {pageTitle}
              </span>
            )}

            {roleLabel && (
              <span
                data-role-badge={roleBadge}
                className="inline-flex shrink-0 items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800"
              >
                {roleLabel}
              </span>
            )}

            {headerNav && (
              <nav className="hidden lg:flex items-center gap-1.5 ml-2">
                {headerNav}
              </nav>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {headerActions && (
              <div className="flex items-center gap-2">{headerActions}</div>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                data-testid="user-menu-trigger"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {effectiveInitial}
                </span>
                <span className="hidden max-w-32 truncate sm:inline">
                  {userName}
                </span>
                <i
                  className="bi bi-chevron-down text-[10px] text-slate-400"
                  aria-hidden="true"
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  data-testid="user-menu-dropdown"
                  className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                  <div className="border-b border-slate-100 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {accountSettingsHeader}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {userName}
                    </div>
                    {userEmail && (
                      <div className="truncate text-xs text-slate-500">
                        {userEmail}
                      </div>
                    )}
                    {profileSubtext && (
                      <div className="mt-1 truncate text-[11px] font-medium text-teal-700">
                        {profileSubtext}
                      </div>
                    )}
                  </div>

                  {settingsHref && (
                    <a
                      href={settingsHref}
                      role="menuitem"
                      data-testid="user-menu-settings"
                      onClick={(e) => {
                        setUserMenuOpen(false);
                        handleNavigation(settingsHref, e);
                      }}
                      className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 no-underline transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      <i className="bi bi-gear text-sm" aria-hidden="true" />
                      <span>{settingsLabel}</span>
                    </a>
                  )}

                  {onLogout && (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="user-menu-logout"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      <i
                        className="bi bi-box-arrow-right text-sm"
                        aria-hidden="true"
                      />
                      <span>{logoutLabel}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-7xl space-y-5">
            {shellError && (
              <ProblemAlert
                error={shellError}
                onDismiss={onDismissShellError}
              />
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
