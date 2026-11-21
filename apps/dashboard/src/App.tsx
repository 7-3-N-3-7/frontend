/**
 * @file apps/dashboard/src/App.tsx
 * @description Rod-komponent for det beskyttede Multi-Role Dashboard (`@platform/dashboard`, Port 5174).
 *
 * FORMÅL (Til Censor, Vejleder & Udviklere):
 * Samler platformens beskyttede Vertical Feature Slices bag `AuthProvider` og `<RoleGuard />`:
 * - `CLIENT` + `PROVIDER`: Adgang til `BookingFeatureView`.
 * - `PROVIDER` (Terapeut): Adgang til `JournalFeatureView` (JGit) og `PsychotraumatologyFeatureView` (PCL-5).
 * - `MANAGEMENT` (Ledelse): Adgang til `ManagementFeatureView`, `FinanceFeatureView` og `UserFeatureView`.
 */

import React, { useState } from "react";
import { AuthenticatedUser, UserRole } from "./core/baseDomainCore";
import { AuthProvider, RoleGuard, useAuth } from "./core/baseUiCore";
import { BookingFeatureView } from "./features/booking/BookingFeature";
import { JournalFeatureView } from "./features/journal/JournalFeature";
import { ManagementFeatureView } from "./features/management/ManagementFeature";
import { FinanceFeatureView } from "./features/finance/FinanceFeature";
import { PsychotraumatologyFeatureView } from "./features/psychotraumatology/PsychotraumatologyFeature";
import { UserFeatureView } from "./features/user/UserFeature";

export type DashboardTab =
  | "booking"
  | "journal"
  | "management"
  | "finance"
  | "psychotraumatology"
  | "user";

export const DashboardNavigation: React.FC = () => {
  const { user } = useAuth();
  const initialTab: DashboardTab =
    user.roles.includes("MANAGEMENT") &&
    !user.roles.includes("CLIENT") &&
    !user.roles.includes("PROVIDER")
      ? "management"
      : "booking";
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const selectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  const navBtnClass = (tab: DashboardTab) =>
    `min-h-11 text-left px-3 py-2 rounded font-medium transition-colors ${
      activeTab === tab
        ? "bg-teal-700 text-white"
        : "text-slate-100 hover:bg-slate-800"
    }`;

  const renderSidebarNav = () => (
    <nav className="flex flex-col gap-2">
      <RoleGuard allowed={["CLIENT", "PROVIDER"]}>
        <button
          type="button"
          data-testid="tab-booking"
          onClick={() => selectTab("booking")}
          className={navBtnClass("booking")}
        >
          Booking &amp; Kalender
        </button>
      </RoleGuard>

      <RoleGuard allowed={["PROVIDER"]}>
        <button
          type="button"
          data-testid="tab-journal"
          onClick={() => selectTab("journal")}
          className={navBtnClass("journal")}
        >
          Klientjournaler
        </button>
        <button
          type="button"
          data-testid="tab-psychotraumatology"
          onClick={() => selectTab("psychotraumatology")}
          className={navBtnClass("psychotraumatology")}
        >
          PCL-5 Screening
        </button>
      </RoleGuard>

      <RoleGuard allowed={["MANAGEMENT"]}>
        <button
          type="button"
          data-testid="tab-management"
          onClick={() => selectTab("management")}
          className={navBtnClass("management")}
        >
          Virksomhedsledelse
        </button>
        <button
          type="button"
          data-testid="tab-finance"
          onClick={() => selectTab("finance")}
          className={navBtnClass("finance")}
        >
          Økonomi &amp; Hovedbog
        </button>
        <button
          type="button"
          data-testid="tab-user"
          onClick={() => selectTab("user")}
          className={navBtnClass("user")}
        >
          Brugerstyring
        </button>
      </RoleGuard>
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row" data-testid="dashboard-shell">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white md:hidden">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate m-0">{user.name}</p>
          <span className="text-[11px] text-slate-300">{user.roles.join(", ")}</span>
        </div>
        <button
          type="button"
          data-testid="vite-mobile-menu-toggle"
          aria-label={mobileNavOpen ? "Luk navigation" : "Åbn navigation"}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((prev) => !prev)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-white"
        >
          <i className={`bi ${mobileNavOpen ? "bi-x-lg" : "bi-list"} text-lg`} aria-hidden="true" />
        </button>
      </header>

      {mobileNavOpen && (
        <aside
          data-testid="vite-mobile-drawer"
          className="md:hidden bg-slate-900 text-white p-4 border-t border-slate-800"
        >
          {renderSidebarNav()}
        </aside>
      )}

      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-slate-900 text-white p-6">
        <div className="mb-8">
          <p className="font-bold" data-testid="dashboard-user-name">
            {user.name}
          </p>
          <span
            className="inline-block mt-1 text-xs bg-slate-700 px-2 py-1 rounded"
            data-testid="dashboard-user-roles"
          >
            {user.roles.join(", ")}
          </span>
        </div>
        {renderSidebarNav()}
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-8 bg-slate-50 space-y-4">
        <div
          data-testid="vite-demo-session-banner"
          role="note"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950"
        >
          <span>
            <strong>Isoleret UAT / Demo-session:</strong> Port 5174 kører uden Keycloak SSO (simuleret{" "}
            <span className="font-semibold">{user.roles.join(", ")}</span>). API-kald returnerer{" "}
            <code>401</code> uden aktiv SSO-session — log ind via hovedportalen for fuld multi-tenant dataskilning.
          </span>
          <a
            href="http://localhost/da"
            className="inline-flex min-h-11 items-center rounded-lg bg-amber-900 px-3.5 py-2 font-semibold text-white no-underline hover:bg-amber-950"
          >
            Åbn EduJournal SSO
          </a>
        </div>
        {activeTab === "booking" && <BookingFeatureView />}
        {activeTab === "journal" && <JournalFeatureView />}
        {activeTab === "management" && <ManagementFeatureView />}
        {activeTab === "finance" && <FinanceFeatureView />}
        {activeTab === "psychotraumatology" && <PsychotraumatologyFeatureView />}
        {activeTab === "user" && <UserFeatureView />}
      </main>
    </div>
  );
};

const DEFAULT_DASHBOARD_USER: AuthenticatedUser = {
  id: "u-default",
  name: "Dr. Bo Jensen",
  email: "bo@clinic.dk",
  roles: ["CLIENT", "PROVIDER", "MANAGEMENT"],
};

export const App: React.FC<{ initialUser?: AuthenticatedUser }> = ({
  initialUser,
}) => {
  const resolvedUser: AuthenticatedUser = React.useMemo(() => {
    if (initialUser) return initialUser;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const rawHint = (params.get("roleHint") || "").toUpperCase();
      const hint = (rawHint === "THERAPIST" ? "PROVIDER" : rawHint) as UserRole | "";
      if (hint === "CLIENT" || hint === "PROVIDER" || hint === "MANAGEMENT") {
        return { ...DEFAULT_DASHBOARD_USER, roles: [hint] };
      }
    }
    return DEFAULT_DASHBOARD_USER;
  }, [initialUser]);

  return (
    <AuthProvider user={resolvedUser}>
      <DashboardNavigation />
    </AuthProvider>
  );
};

export default App;
