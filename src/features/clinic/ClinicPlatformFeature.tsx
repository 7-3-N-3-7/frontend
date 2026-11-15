"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: ClinicPlatformFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/clinic/ClinicPlatformFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: ClinicPlatformFeature]. Samler
 * klient- og behandlerprofiler, CVR-validering, klinik-onboarding og
 * rolleopdelte portal-arbejdsområder i én vertikal slice:
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: OrganisationDto], [Record/DTO: ClientProfileDto],
 *      [Record/DTO: ProviderProfileDto], [Record/DTO: ServiceDto] &
 *      [Record/DTO: ClientTherapistHandshakeDto]
 *   2. Klient-side Domænevalidering (#isValidDanishCvr(cvr))
 *      Kontrollerer dansk 8-cifret CVR-format før klinik-onboarding.
 *   3. [Service: ClinicPlatformApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<ClientProfileDto, string>] og
 *      validerer `fullName` og `email` i #validateBeforeCreate(dto) via [Class: DomainGuard].
 *   4. [Hook: useBaseCrud<ClientProfileDto, string>(clinicPlatformApi)]
 *      Binder `clinicPlatformApi` til reaktiv React-tilstand.
 *   5. [Component: <ClinicPlatformFeatureView />], [Component: <ConnectedPortalWorkspaceShell />],
 *      [Component: <TherapistMultiWindowWorkspace />] & [Component: <ClientPortalWorkspace />]
 * ============================================================================
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AuthenticatedUser,
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
  UserRole,
} from "../../core/baseDomainCore";
import {
  AuthProvider,
  PortalArea,
  PortalSwitcherOption,
  PortalUpgradeAction,
  PortalWorkspaceNavItem,
  PortalWorkspaceShell,
  PortalWorkspaceShellProps,
  ProblemAlert,
  useBaseCrud,
} from "../../core/baseUiCore";
import { JournalFeatureView } from "../journal/JournalFeature";
import { AppointmentFeatureView } from "../appointment/AppointmentFeature";
import { BookingFeatureView } from "../booking/BookingFeature";
import { PsychotraumatologyFeatureView } from "../psychotraumatology/PsychotraumatologyFeature";
import { FinanceFeatureView } from "../finance/FinanceFeature";
import { UserFeatureView } from "../user/UserFeature";
import { LanguageSwitcher } from "../i18n/I18nFeature";

// ==========================================
// 1. DTOs & DOMAIN MODELS (1:1 with ClinicPlatformFeature.java)
// ==========================================

export interface OrganisationDto extends HasId<string> {
  id?: string;
  name: string;
  cvrNumber: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt?: string;
}

export interface ClientProfileDto extends HasId<string> {
  id?: string;
  userId?: string;
  fullName: string;
  email: string;
  phone?: string;
  cprOrIdentifier?: string;
  notes?: string;
  createdAt?: string;
}

export interface ProviderProfileDto extends HasId<string> {
  id?: string;
  userId?: string;
  organisationId?: string;
  fullName: string;
  title?: string;
  specialty?: string;
  bio?: string;
  weeklyScheduleJson?: string;
  createdAt?: string;
}

export interface ServiceDto extends HasId<string> {
  id?: string;
  organisationId?: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceDkk: number;
  active?: boolean;
}

export type HandshakeStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface ClientTherapistHandshakeDto extends HasId<string> {
  id?: string;
  clientId: string;
  therapistId: string;
  clientName?: string;
  therapistName?: string;
  status: HandshakeStatus;
  sharedJournalAccess: boolean;
  requestedAt?: string;
  respondedAt?: string;
}

export interface OnboardingRequestDto {
  organisationName: string;
  cvrNumber: string;
  fullName: string;
  title?: string;
  specialty?: string;
}

export interface HandshakeRequestDto {
  clientId: string;
  therapistId: string;
  clientName?: string;
  therapistName?: string;
  sharedJournalAccess: boolean;
}

/**
 * Validerer at et dansk CVR-nummer består af præcis 8 cifre (Erhvervsstyrelsens format).
 */
export function isValidDanishCvr(cvr: string): boolean {
  return /^\d{8}$/.test((cvr || "").trim());
}

// ==========================================
// 2. INFRASTRUCTURE / API SERVICE (Module-Private)
// Notice: NO 'export' keyword! Strictly encapsulated.
// ==========================================

class ClinicPlatformApiService extends BaseApiService<
  ClientProfileDto,
  string
> {
  constructor() {
    super("/api/backend/clinic/clients");
  }

  /**
   * Pre-condition hook (Template Method):
   * Validerer klientens navn og e-mail på klient-siden før netværkskald til Spring Boot.
   */
  protected override validateBeforeCreate(
    dto: Partial<ClientProfileDto>
  ): void {
    DomainGuard.requireNotBlank(dto.fullName, "Client full name", "fullName");
    DomainGuard.requireNotBlank(dto.email, "Client email", "email");
    DomainGuard.check(
      dto.email!.includes("@"),
      "Client email must be a valid email address",
      ErrorCode.VALIDATION_FAILED,
      "email"
    );
  }
}

const clinicPlatformApi = new ClinicPlatformApiService();

// ==========================================
// 3. PRESENTATION / UI COMPONENT (Exported)
// ==========================================

export const ClinicPlatformFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(clinicPlatformApi);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      fullName,
      email,
      phone: phone || undefined,
    });
    if (created) {
      setFullName("");
      setEmail("");
      setPhone("");
    }
  };

  return (
    <div
      className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5"
      data-testid="clinic-platform-feature-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 mb-1.5">
            <i className="bi bi-people-fill" aria-hidden="true" />
            Klientregister
          </span>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Clinic Platform — Client Profiles & Handshakes
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
          {items.length} profiler
        </span>
      </div>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Navn
          </label>
          <input
            type="text"
            placeholder="Client Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-fullName"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            E-mail
          </label>
          <input
            type="email"
            placeholder="Client Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-email"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Telefon
          </label>
          <input
            type="text"
            placeholder="Phone (Optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-phone"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          data-testid="submit-clinic-client"
        >
          <i className="bi bi-person-plus" aria-hidden="true" />
          Register Client
        </button>
      </form>

      {loading && (
        <p
          className="text-sm text-slate-500 flex items-center gap-2"
          data-testid="loading-indicator"
        >
          <i className="bi bi-hourglass-split animate-pulse" aria-hidden="true" />
          Loading...
        </p>
      )}

      <ul className="space-y-2.5" data-testid="clinic-client-list">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm flex flex-wrap justify-between items-center gap-3 hover:border-teal-200 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-sm flex items-center justify-center shrink-0">
                {(item.fullName || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  <strong>{item.fullName}</strong>{" "}
                  <span className="font-normal text-slate-500">({item.email})</span>
                </div>
                {item.phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                    <i className="bi bi-telephone" aria-hidden="true" />
                    {item.phone}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => item.id && remove(item.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 text-xs font-semibold transition-colors"
              data-testid={`delete-clinic-client-${item.id}`}
            >
              <i className="bi bi-trash3" aria-hidden="true" />
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ==========================================
// 4. PORTAL WORKSPACE WRAPPERS (Next.js App Router Integration)
// ==========================================

export interface MeUserContext {
  userUuid?: string;
  username?: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  isTherapist?: boolean;
  isAdmin?: boolean;
  clientProfile?: ClientProfileDto | null;
  providerProfile?: ProviderProfileDto | null;
  canCreateServices?: boolean;
  missingProfileFields?: string[];
}

export interface ResolvePortalShellInput {
  locale: string;
  pathname: string;
  tab?: string | null;
  me: MeUserContext | null;
}

export interface ResolvedPortalShellConfig {
  activeArea: PortalArea;
  brandTitle: string;
  brandSubtitle: string;
  pageTitle: string;
  roleLabel: string;
  roleBadge: UserRole;
  navItems: PortalWorkspaceNavItem[];
  portalOptions: PortalSwitcherOption[];
  upgradeAction?: PortalUpgradeAction;
  defaultSidebarCollapsed: boolean;
  settingsHref: string;
  profileSubtext?: string;
}

/**
 * Konverterer `/api/backend/clinic/me` payload til frontendens RBAC-brugerkontrakt.
 */
export function mapMeToAuthenticatedUser(me: MeUserContext): AuthenticatedUser {
  const normalized = new Set<UserRole>();
  const rawRoles = (me.roles || []).map((role) => role.toUpperCase());

  if (
    me.isTherapist ||
    rawRoles.includes("THERAPIST") ||
    rawRoles.includes("PROVIDER")
  ) {
    normalized.add("PROVIDER");
    normalized.add("THERAPIST");
  }

  if (
    me.isAdmin ||
    rawRoles.includes("ADMIN") ||
    rawRoles.includes("MANAGEMENT")
  ) {
    normalized.add("MANAGEMENT");
    normalized.add("ADMIN");
  }

  if (
    rawRoles.includes("CLIENT") ||
    Boolean(me.clientProfile) ||
    normalized.size === 0
  ) {
    normalized.add("CLIENT");
  }

  return {
    id: me.userUuid || me.username || "anonymous",
    name: me.fullName || me.username || "Bruger",
    email: me.email || "",
    roles: Array.from(normalized),
  };
}

/**
 * Beregner navigation, aktiv portal, rolle-skifter og auto-collapse for App Shell.
 */
export function resolvePortalShellConfig({
  locale,
  pathname,
  tab,
  me,
}: ResolvePortalShellInput): ResolvedPortalShellConfig {
  const base = `/${locale}/dashboard`;
  const currentTab = tab || "overview";
  const rawRoles = (me?.roles || []).map((role) => role.toUpperCase());
  const hasTherapistAccess = Boolean(
    me?.isTherapist ||
      rawRoles.includes("THERAPIST") ||
      rawRoles.includes("PROVIDER")
  );
  const hasAdminAccess = Boolean(
    me?.isAdmin ||
      rawRoles.includes("ADMIN") ||
      rawRoles.includes("MANAGEMENT")
  );

  let activeArea: PortalArea = "client";
  if (pathname.includes("/dashboard/admin")) {
    activeArea = "admin";
  } else if (
    pathname.includes("/dashboard/therapist") ||
    pathname.includes("/dashboard/clinic")
  ) {
    activeArea = "therapist";
  }

  const portalOptions: PortalSwitcherOption[] = [
    {
      area: "client",
      href: `${base}/personal`,
      label: "Klientportal",
      icon: "bi-person-heart",
      active: activeArea === "client",
    },
  ];

  if (hasTherapistAccess || activeArea === "therapist") {
    portalOptions.push({
      area: "therapist",
      href: `${base}/therapist`,
      label: "Behandlerportal",
      icon: "bi-heart-pulse",
      active: activeArea === "therapist",
    });
  }

  if (hasAdminAccess || activeArea === "admin") {
    portalOptions.push({
      area: "admin",
      href: `${base}/admin`,
      label: "Admin",
      icon: "bi-sliders2",
      active: activeArea === "admin",
    });
  }

  const isSettings = pathname.includes("/dashboard/settings");
  const isClinic = pathname.includes("/dashboard/clinic");

  let navItems: PortalWorkspaceNavItem[];
  let brandSubtitle: string;
  let pageTitle: string;
  let roleLabel: string;
  let roleBadge: UserRole;

  if (activeArea === "admin") {
    brandSubtitle = "Admin & Governance Portal";
    pageTitle = "System & i18n Administration";
    roleLabel = "Administrator";
    roleBadge = "ADMIN";
    navItems = [
      {
        href: `${base}/admin`,
        label: "Sprog & i18n",
        icon: "bi-translate",
        active: !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/admin?tab=management`,
        label: "KPI & Ledelse",
        icon: "bi-graph-up-arrow",
        active: !isSettings && currentTab === "management",
      },
      {
        href: `${base}/clinic`,
        label: "Klinik & CVR",
        icon: "bi-building",
        active: false,
      },
      {
        href: `${base}/settings`,
        label: "Indstillinger",
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  } else if (activeArea === "therapist") {
    brandSubtitle = "Clinical Therapist Workspace";
    pageTitle = isClinic
      ? "Klinik & CVR-Administration"
      : "Behandler-Workspace";
    roleLabel = "Behandler";
    roleBadge = "PROVIDER";
    navItems = [
      {
        href: `${base}/therapist`,
        label: "Multi-Window",
        icon: "bi-window-stack",
        active: !isClinic && !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/therapist?tab=calendar`,
        label: "Kalender",
        icon: "bi-calendar3",
        active: !isClinic && !isSettings && currentTab === "calendar",
      },
      {
        href: `${base}/clinic`,
        label: "CVR & Praksis",
        icon: "bi-building",
        active: isClinic || currentTab === "clinic_cvr",
      },
      {
        href: `${base}/therapist?tab=pcl5`,
        label: "PCL-5 Screener",
        icon: "bi-clipboard2-pulse",
        active: currentTab === "pcl5",
      },
      {
        href: `${base}/therapist?tab=finance`,
        label: "Økonomi & Faktura",
        icon: "bi-cash-stack",
        active: currentTab === "finance",
      },
      {
        href: `${base}/settings`,
        label: "Indstillinger",
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  } else {
    brandSubtitle = "Personal Client Portal";
    pageTitle = isSettings
      ? "Profil- & Klinikindstillinger"
      : "Min Klientportal";
    roleLabel = "Klient";
    roleBadge = "CLIENT";
    navItems = [
      {
        href: `${base}/personal`,
        label: "Overblik",
        icon: "bi-grid-1x2",
        active: !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/personal?tab=appointments`,
        label: "Aftaler",
        icon: "bi-calendar-check",
        active: !isSettings && currentTab === "appointments",
      },
      {
        href: `${base}/personal?tab=marketplace`,
        label: "Klinik & Praksis",
        icon: "bi-shop",
        active: currentTab === "marketplace",
      },
      {
        href: `${base}/personal?tab=consents`,
        label: "Samtykke & Profil",
        icon: "bi-shield-check",
        active: currentTab === "consents",
      },
      {
        href: `${base}/personal?tab=pcl5`,
        label: "PCL-5 Test",
        icon: "bi-clipboard2-pulse",
        active: currentTab === "pcl5",
      },
      {
        href: `${base}/personal?tab=finance`,
        label: "Faktura & Betaling",
        icon: "bi-receipt",
        active: currentTab === "finance",
      },
      {
        href: `${base}/settings`,
        label: "Indstillinger",
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  }

  const upgradeAction: PortalUpgradeAction | undefined =
    !hasTherapistAccess && !hasAdminAccess
      ? {
          label: "Bliv behandler",
          href: `${base}/clinic`,
          icon: "bi-briefcase-fill",
          description: "Opret klinikprofil med CVR",
        }
      : undefined;

  let profileSubtext: string | undefined;
  if (me?.missingProfileFields && me.missingProfileFields.length > 0) {
    profileSubtext = `Mangler: ${me.missingProfileFields.join(", ")}`;
  } else if (hasTherapistAccess) {
    profileSubtext = "Verificeret behandler";
  } else if (hasAdminAccess) {
    profileSubtext = "Systemadministrator";
  }

  return {
    activeArea,
    brandTitle: "EduJournal",
    brandSubtitle,
    pageTitle,
    roleLabel,
    roleBadge,
    navItems,
    portalOptions,
    upgradeAction,
    defaultSidebarCollapsed:
      activeArea === "therapist" &&
      pathname.includes("/dashboard/therapist") &&
      currentTab === "overview",
    settingsHref: `${base}/settings`,
    profileSubtext,
  };
}

export interface ConnectedPortalWorkspaceShellProps
  extends Partial<PortalWorkspaceShellProps> {
  locale?: string;
  pathname?: string;
  activeTab?: string | null;
  initialMe?: MeUserContext | null;
  onLocaleNavigate?: (nextLocale: string) => void;
  children: React.ReactNode;
}

/**
 * Forbinder `PortalWorkspaceShell` fra `baseUiCore.tsx` med `/api/backend/clinic/me`,
 * RBAC `<AuthProvider />`, sprogvælger og App Router navigation.
 */
export const ConnectedPortalWorkspaceShell: React.FC<
  ConnectedPortalWorkspaceShellProps
> = ({
  title,
  locale = "da",
  pathname = `/${locale}/dashboard/personal`,
  activeTab = null,
  initialMe,
  onLocaleNavigate,
  onNavigate,
  onLogout,
  headerActions,
  children,
  ...rest
}) => {
  const [me, setMe] = useState<MeUserContext | null>(initialMe ?? null);

  useEffect(() => {
    if (initialMe !== undefined) {
      setMe(initialMe);
      return;
    }

    let cancelled = false;
    fetch("/api/backend/clinic/me", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (
          !cancelled &&
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          (data.userUuid || data.username || Array.isArray(data.roles))
        ) {
          setMe(data as MeUserContext);
        }
      })
      .catch(() => {
        // Fallback gracefully when running frontend standalone or offline
      });

    return () => {
      cancelled = true;
    };
  }, [initialMe]);

  const shellConfig = useMemo(
    () =>
      resolvePortalShellConfig({
        locale,
        pathname,
        tab: activeTab,
        me,
      }),
    [locale, pathname, activeTab, me]
  );

  const authenticatedUser = useMemo(
    () => (me ? mapMeToAuthenticatedUser(me) : null),
    [me]
  );

  const effectiveUserName =
    rest.userName || me?.fullName || me?.username || "Bruger";
  const effectiveUserEmail = rest.userEmail ?? me?.email;

  return (
    <PortalWorkspaceShell
      brandTitle={title ?? rest.brandTitle ?? shellConfig.brandTitle}
      brandSubtitle={rest.brandSubtitle ?? shellConfig.brandSubtitle}
      pageTitle={rest.pageTitle ?? shellConfig.pageTitle}
      roleLabel={rest.roleLabel ?? shellConfig.roleLabel}
      roleBadge={rest.roleBadge ?? shellConfig.roleBadge}
      userName={effectiveUserName}
      userEmail={effectiveUserEmail}
      profileSubtext={rest.profileSubtext ?? shellConfig.profileSubtext}
      settingsHref={rest.settingsHref ?? shellConfig.settingsHref}
      navItems={rest.navItems ?? shellConfig.navItems}
      portalOptions={rest.portalOptions ?? shellConfig.portalOptions}
      upgradeAction={rest.upgradeAction ?? shellConfig.upgradeAction}
      defaultSidebarCollapsed={
        rest.defaultSidebarCollapsed ?? shellConfig.defaultSidebarCollapsed
      }
      onNavigate={onNavigate}
      onLogout={onLogout}
      shellError={rest.shellError}
      onDismissShellError={rest.onDismissShellError}
      headerNav={rest.headerNav}
      headerActions={
        <>
          {headerActions}
          <LanguageSwitcher
            currentLocale={locale}
            onLocaleNavigate={onLocaleNavigate}
          />
        </>
      }
    >
      <AuthProvider user={authenticatedUser}>{children}</AuthProvider>
    </PortalWorkspaceShell>
  );
};

export type TherapistTab =
  | "overview"
  | "calendar"
  | "clinic_cvr"
  | "pcl5"
  | "finance";

export interface TherapistMultiWindowWorkspaceProps {
  therapistName?: string;
  initialTab?: TherapistTab;
  activeTab?: TherapistTab;
  onTabChange?: (tab: TherapistTab) => void;
}

const THERAPIST_TABS: ReadonlyArray<{
  id: TherapistTab;
  label: string;
  testId: string;
}> = [
  { id: "overview", label: "Klinik & Journal", testId: "tab-btn-overview" },
  { id: "calendar", label: "Kalender", testId: "tab-btn-calendar" },
  { id: "clinic_cvr", label: "CVR & Praksis", testId: "tab-btn-clinic-cvr" },
  { id: "pcl5", label: "PCL-5 Screener", testId: "tab-btn-pcl5" },
  { id: "finance", label: "Økonomi & Faktura", testId: "tab-btn-finance" },
];

/**
 * Samlet arbejdsområde for behandlere (`PROVIDER`), der kombinerer Klientprofiler,
 * Journaler (JGit), Aftalekalender (Timefold), PCL-5 og Økonomi i ét overskueligt workspace.
 */
export const TherapistMultiWindowWorkspace: React.FC<
  TherapistMultiWindowWorkspaceProps
> = ({
  therapistName = "Behandler",
  initialTab = "overview",
  activeTab: controlledActiveTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<TherapistTab>(initialTab);

  useEffect(() => {
    setInternalTab(initialTab);
  }, [initialTab]);

  const activeTab = controlledActiveTab ?? internalTab;

  const selectTab = (next: TherapistTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  return (
    <div
      className="space-y-6"
      data-testid="therapist-multi-window-workspace"
      data-active-tab={activeTab}
    >
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
            <i className="bi bi-heart-pulse" aria-hidden="true" />
            Behandler-Workspace
          </span>
          <h1
            className="mt-2 text-2xl font-bold tracking-tight text-slate-900"
            data-testid="therapist-greeting"
          >
            Behandler-Workspace: {therapistName}
          </h1>
          <p className="mt-1 mb-0 text-sm text-slate-600">
            1:1 Vertical Slice overblik over klienter, JGit-journaler,
            Timefold-aftaler og praksisdrift
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {THERAPIST_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              data-testid={tab.testId}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-700 text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-12">
            <ClinicPlatformFeatureView />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <JournalFeatureView />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <AppointmentFeatureView />
          </div>
        </div>
      )}

      {activeTab === "calendar" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-calendar-panel"
        >
          <AppointmentFeatureView />
        </section>
      )}

      {activeTab === "clinic_cvr" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="clinic-cvr-panel"
        >
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Klinik & CVR-Administration
          </h2>
          <ClinicPlatformFeatureView />
        </section>
      )}

      {activeTab === "pcl5" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-pcl5-panel"
        >
          <PsychotraumatologyFeatureView />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-finance-panel"
        >
          <FinanceFeatureView />
        </section>
      )}
    </div>
  );
};

export type ClientTab =
  | "overview"
  | "appointments"
  | "marketplace"
  | "consents"
  | "pcl5"
  | "finance";

export interface ClientPortalWorkspaceProps {
  userName?: string;
  secureStatus?: string | null;
  initialTab?: ClientTab;
  activeTab?: ClientTab;
  onTabChange?: (tab: ClientTab) => void;
}

const CLIENT_TABS: ReadonlyArray<{
  id: ClientTab;
  label: string;
  icon: string;
}> = [
  { id: "overview", label: "Overblik", icon: "bi-grid-1x2" },
  { id: "appointments", label: "Aftaler", icon: "bi-calendar-check" },
  { id: "marketplace", label: "Klinik & Praksis", icon: "bi-shop" },
  { id: "consents", label: "Samtykke & Profil", icon: "bi-shield-check" },
  { id: "pcl5", label: "PCL-5 Test", icon: "bi-clipboard2-pulse" },
  { id: "finance", label: "Faktura & Betaling", icon: "bi-receipt" },
];

/**
 * Borger/Klient-arbejdsområde (`CLIENT`), der giver adgang til selvbetjent booking,
 * markedsplads, samtykke, PCL-5 screening og fakturaer i en moderne Nordic HealthTech-skal.
 */
export const ClientPortalWorkspace: React.FC<ClientPortalWorkspaceProps> = ({
  userName = "Klient",
  secureStatus = null,
  initialTab = "overview",
  activeTab: controlledActiveTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<ClientTab>(initialTab);

  useEffect(() => {
    setInternalTab(initialTab);
  }, [initialTab]);

  const activeTab = controlledActiveTab ?? internalTab;

  const selectTab = (next: ClientTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  return (
    <div
      className="space-y-6"
      data-testid="client-portal-workspace"
      data-active-tab={activeTab}
    >
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <i className="bi bi-shield-lock" aria-hidden="true" />
              Sikker Klientportal
            </span>
            <h1
              className="mt-2 text-2xl font-bold tracking-tight text-slate-900"
              data-testid="client-greeting"
            >
              Velkommen, {userName}
            </h1>
            {secureStatus && (
              <p
                className="mt-1 mb-0 text-xs font-medium text-emerald-700"
                data-testid="client-secure-status"
              >
                Sikkerhedstjek: {secureStatus}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
            >
              <i className="bi bi-calendar-plus" aria-hidden="true" />
              Book ny session
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {CLIENT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              data-testid={`client-tab-${tab.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-50 text-teal-800 border border-teal-200 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <i className={`bi ${tab.icon}`} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <i className="bi bi-calendar-check text-lg" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Mine Aftaler
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Se kommende sessioner eller book en ny tid
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectTab("consents")}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <i className="bi bi-shield-check text-lg" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Samtykke & Profil
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Administrer din profil og datadeling
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectTab("pcl5")}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <i
                  className="bi bi-clipboard2-pulse text-lg"
                  aria-hidden="true"
                />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  PCL-5 Screening
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Udfyld og følg dine kliniske besvarelser
                </div>
              </div>
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <BookingFeatureView />
          </section>
        </div>
      )}

      {activeTab === "appointments" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-appointments-panel"
        >
          <BookingFeatureView />
        </section>
      )}

      {activeTab === "marketplace" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-marketplace-panel"
        >
          <ClinicPlatformFeatureView />
        </section>
      )}

      {activeTab === "consents" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-consents-panel"
        >
          <UserFeatureView />
        </section>
      )}

      {activeTab === "pcl5" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-pcl5-panel"
        >
          <PsychotraumatologyFeatureView />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-finance-panel"
        >
          <FinanceFeatureView />
        </section>
      )}
    </div>
  );
};

export default ClinicPlatformFeatureView;

