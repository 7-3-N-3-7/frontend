"use client";

import React, { Suspense } from "react";
import {
  ReadonlyURLSearchParams,
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ClientPortalWorkspace,
  ClientTab,
  ConnectedPortalWorkspaceShell,
  TherapistMultiWindowWorkspace,
  TherapistTab,
} from "@/features/clinic/ClinicPlatformFeature";

const VALID_CLIENT_TABS: ReadonlySet<string> = new Set([
  "overview",
  "appointments",
  "marketplace",
  "consents",
  "pcl5",
  "finance",
]);

const VALID_THERAPIST_TABS: ReadonlySet<string> = new Set([
  "overview",
  "calendar",
  "clinic_cvr",
  "pcl5",
  "finance",
]);

function buildTabHref(
  pathname: string,
  searchParams: ReadonlyURLSearchParams | null,
  nextTab: string,
  defaultTab: string
): string {
  const params = new URLSearchParams(searchParams?.toString() || "");
  if (nextTab === defaultTab) {
    params.delete("tab");
  } else {
    params.set("tab", nextTab);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

interface DashboardShellBridgeProps {
  locale?: string;
  children: React.ReactNode;
}

const DashboardShellInner: React.FC<DashboardShellBridgeProps> = ({
  locale: fallbackLocale = "da",
  children,
}) => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || `/${fallbackLocale}/dashboard/personal`;
  const searchParams = useSearchParams();

  const locale =
    typeof params?.locale === "string" && params.locale
      ? params.locale
      : fallbackLocale;
  const activeTab = searchParams?.get("tab") ?? null;

  const handleLocaleNavigate = (nextLocale: string) => {
    const restOfPath = pathname.startsWith(`/${locale}`)
      ? pathname.slice(locale.length + 1)
      : pathname;
    const normalizedRest = restOfPath.startsWith("/")
      ? restOfPath
      : `/${restOfPath}`;
    const query = searchParams?.toString();
    const target = `/${nextLocale}${normalizedRest}${query ? `?${query}` : ""}`;
    router.push(target);
    router.refresh();
  };

  const handleLogout = () => {
    void signOut({ callbackUrl: `/${locale}` });
  };

  return (
    <ConnectedPortalWorkspaceShell
      locale={locale}
      pathname={pathname}
      activeTab={activeTab}
      onNavigate={(href) => router.push(href)}
      onLocaleNavigate={handleLocaleNavigate}
      onLogout={handleLogout}
    >
      {children}
    </ConnectedPortalWorkspaceShell>
  );
};

export const DashboardShellBridge: React.FC<DashboardShellBridgeProps> = ({
  locale = "da",
  children,
}) => {
  return (
    <Suspense
      fallback={
        <ConnectedPortalWorkspaceShell locale={locale}>
          {children}
        </ConnectedPortalWorkspaceShell>
      }
    >
      <DashboardShellInner locale={locale}>{children}</DashboardShellInner>
    </Suspense>
  );
};

interface SyncedClientPortalWorkspaceProps {
  userName?: string;
  secureStatus?: string | null;
}

const SyncedClientPortalInner: React.FC<SyncedClientPortalWorkspaceProps> = ({
  userName,
  secureStatus,
}) => {
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/personal";
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get("tab");
  const activeTab: ClientTab =
    rawTab && VALID_CLIENT_TABS.has(rawTab)
      ? (rawTab as ClientTab)
      : "overview";

  return (
    <ClientPortalWorkspace
      userName={userName}
      secureStatus={secureStatus}
      activeTab={activeTab}
      onTabChange={(nextTab) => {
        router.replace(buildTabHref(pathname, searchParams, nextTab, "overview"), {
          scroll: false,
        });
      }}
    />
  );
};

export const SyncedClientPortalWorkspace: React.FC<
  SyncedClientPortalWorkspaceProps
> = ({ userName, secureStatus }) => {
  return (
    <Suspense
      fallback={
        <ClientPortalWorkspace userName={userName} secureStatus={secureStatus} />
      }
    >
      <SyncedClientPortalInner userName={userName} secureStatus={secureStatus} />
    </Suspense>
  );
};

interface SyncedTherapistWorkspaceProps {
  therapistName?: string;
  defaultTab?: TherapistTab;
}

const SyncedTherapistWorkspaceInner: React.FC<
  SyncedTherapistWorkspaceProps
> = ({ therapistName, defaultTab = "overview" }) => {
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/therapist";
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get("tab");
  const activeTab: TherapistTab =
    rawTab && VALID_THERAPIST_TABS.has(rawTab)
      ? (rawTab as TherapistTab)
      : defaultTab;

  return (
    <TherapistMultiWindowWorkspace
      therapistName={therapistName}
      initialTab={defaultTab}
      activeTab={activeTab}
      onTabChange={(nextTab) => {
        router.replace(buildTabHref(pathname, searchParams, nextTab, defaultTab), {
          scroll: false,
        });
      }}
    />
  );
};

export const SyncedTherapistWorkspace: React.FC<
  SyncedTherapistWorkspaceProps
> = ({ therapistName, defaultTab = "overview" }) => {
  return (
    <Suspense
      fallback={
        <TherapistMultiWindowWorkspace
          therapistName={therapistName}
          initialTab={defaultTab}
        />
      }
    >
      <SyncedTherapistWorkspaceInner
        therapistName={therapistName}
        defaultTab={defaultTab}
      />
    </Suspense>
  );
};
