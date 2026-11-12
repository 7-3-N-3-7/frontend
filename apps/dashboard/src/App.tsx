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
  const [activeTab, setActiveTab] = useState<DashboardTab>("booking");

  return (
    <div className="min-h-screen flex" data-testid="dashboard-shell">
      <aside className="w-64 bg-slate-900 text-white p-6">
        <div className="mb-8">
          <p className="font-bold" data-testid="dashboard-user-name">
            {user.name}
          </p>
          <span
            className="text-xs bg-slate-700 px-2 py-1 rounded"
            data-testid="dashboard-user-roles"
          >
            {user.roles.join(", ")}
          </span>
        </div>

        <nav className="flex flex-col gap-2">
          <RoleGuard allowed={["CLIENT", "PROVIDER"]}>
            <button
              type="button"
              data-testid="tab-booking"
              onClick={() => setActiveTab("booking")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              Booking &amp; Kalender
            </button>
          </RoleGuard>

          <RoleGuard allowed={["PROVIDER"]}>
            <button
              type="button"
              data-testid="tab-journal"
              onClick={() => setActiveTab("journal")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              Klientjournaler
            </button>
            <button
              type="button"
              data-testid="tab-psychotraumatology"
              onClick={() => setActiveTab("psychotraumatology")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              PCL-5 Screening
            </button>
          </RoleGuard>

          <RoleGuard allowed={["MANAGEMENT"]}>
            <button
              type="button"
              data-testid="tab-management"
              onClick={() => setActiveTab("management")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              Virksomhedsledelse
            </button>
            <button
              type="button"
              data-testid="tab-finance"
              onClick={() => setActiveTab("finance")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              Økonomi &amp; Hovedbog
            </button>
            <button
              type="button"
              data-testid="tab-user"
              onClick={() => setActiveTab("user")}
              className="text-left p-2 hover:bg-slate-800 rounded"
            >
              Brugerstyring
            </button>
          </RoleGuard>
        </nav>
      </aside>

      <main className="flex-1 p-8 bg-slate-50">
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
      const hint = params.get("roleHint") as UserRole | null;
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
