"use client";

import React, { Suspense } from "react";
import {
  ReadonlyURLSearchParams,
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { SessionProvider, signOut, useSession } from "next-auth/react";
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
  "journal",
  "marketplace",
  "consents",
  "pcl5",
  "finance",
]);

const VALID_THERAPIST_TABS: ReadonlySet<string> = new Set([
  "overview",
  "timeline",
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

  const handleLogout = async () => {
    const targetUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/${locale}`
        : `/${locale}`;
    await signOut({ callbackUrl: targetUrl, redirect: false });
    if (typeof window !== "undefined") {
      window.location.assign(targetUrl);
    }
  };

  return (
    <ConnectedPortalWorkspaceShell
      locale={locale}
      pathname={pathname}
      activeTab={activeTab}
      onNavigate={(href) => router.push(href)}
      onLocaleNavigate={handleLocaleNavigate}
      onLogout={() => void handleLogout()}
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
    <SessionProvider refetchOnWindowFocus={false}>
      <Suspense
        fallback={
          <ConnectedPortalWorkspaceShell locale={locale}>
            {children}
          </ConnectedPortalWorkspaceShell>
        }
      >
        <DashboardShellInner locale={locale}>{children}</DashboardShellInner>
      </Suspense>
    </SessionProvider>
  );
};

interface SyncedClientPortalWorkspaceProps {
  locale?: string;
  userName?: string;
  secureStatus?: string | null;
}

const SyncedClientPortalInner: React.FC<SyncedClientPortalWorkspaceProps> = ({
  locale,
  userName,
  secureStatus,
}) => {
  const { update } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/personal";
  const searchParams = useSearchParams();
  const activeLocale =
    (typeof params?.locale === "string" && params.locale) || locale;
  const rawTab = searchParams?.get("tab");
  const activeTab: ClientTab =
    rawTab && VALID_CLIENT_TABS.has(rawTab)
      ? (rawTab as ClientTab)
      : "overview";

  return (
    <ClientPortalWorkspace
      locale={activeLocale}
      userName={userName}
      secureStatus={secureStatus}
      activeTab={activeTab}
      onRoleUpgraded={async () => {
        await update();
        router.refresh();
      }}
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
> = ({ locale, userName, secureStatus }) => {
  return (
    <Suspense
      fallback={
        <ClientPortalWorkspace
          locale={locale}
          userName={userName}
          secureStatus={secureStatus}
        />
      }
    >
      <SyncedClientPortalInner
        locale={locale}
        userName={userName}
        secureStatus={secureStatus}
      />
    </Suspense>
  );
};

interface SyncedTherapistWorkspaceProps {
  locale?: string;
  therapistName?: string;
  defaultTab?: TherapistTab;
}

const SyncedTherapistWorkspaceInner: React.FC<
  SyncedTherapistWorkspaceProps
> = ({ locale, therapistName, defaultTab = "overview" }) => {
  const { update } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/therapist";
  const searchParams = useSearchParams();
  const activeLocale =
    (typeof params?.locale === "string" && params.locale) || locale;
  const rawTab = searchParams?.get("tab");
  const activeTab: TherapistTab =
    rawTab && VALID_THERAPIST_TABS.has(rawTab)
      ? (rawTab as TherapistTab)
      : defaultTab;

  return (
    <TherapistMultiWindowWorkspace
      locale={activeLocale}
      therapistName={therapistName}
      initialTab={defaultTab}
      activeTab={activeTab}
      onRoleUpgraded={async () => {
        await update();
        router.refresh();
      }}
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
> = ({ locale, therapistName, defaultTab = "overview" }) => {
  return (
    <Suspense
      fallback={
        <TherapistMultiWindowWorkspace
          locale={locale}
          therapistName={therapistName}
          initialTab={defaultTab}
        />
      }
    >
      <SyncedTherapistWorkspaceInner
        locale={locale}
        therapistName={therapistName}
        defaultTab={defaultTab}
      />
    </Suspense>
  );
};
