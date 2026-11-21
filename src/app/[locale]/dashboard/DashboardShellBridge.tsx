"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
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
import { resolveUiLocale, SupportedUiLocale } from "@/features/i18n/I18nFeature";

interface DashboardBannerCopy {
  emailVerifiedTitle: string;
  emailVerifiedBody: string;
  welcomeTitle: string;
  welcomeBody: string;
  dismissAriaLabel: string;
}

const DASHBOARD_BANNER_COPY: Record<SupportedUiLocale, DashboardBannerCopy> = {
  da: {
    emailVerifiedTitle: "Din e-mail er nu bekræftet!",
    emailVerifiedBody: "Din konto er verificeret og klar til sikker klinisk brug.",
    welcomeTitle: "Velkommen til EduJournal!",
    welcomeBody:
      "Din konto er klar. Vi har også sendt en bekræftelsesmail til din indbakke.",
    dismissAriaLabel: "Luk besked",
  },
  en: {
    emailVerifiedTitle: "Your email is now verified!",
    emailVerifiedBody: "Your account is confirmed and ready for secure portal use.",
    welcomeTitle: "Welcome to EduJournal!",
    welcomeBody:
      "Your account is ready. We also sent a verification email to your inbox.",
    dismissAriaLabel: "Dismiss message",
  },
  fr: {
    emailVerifiedTitle: "Votre e-mail est maintenant vérifié !",
    emailVerifiedBody:
      "Votre compte est confirmé et prêt pour un usage sécurisé du portail.",
    welcomeTitle: "Bienvenue sur EduJournal !",
    welcomeBody:
      "Votre compte est prêt. Un e-mail de vérification a également été envoyé à votre boîte de réception.",
    dismissAriaLabel: "Fermer le message",
  },
  es: {
    emailVerifiedTitle: "¡Tu correo ya está verificado!",
    emailVerifiedBody:
      "Tu cuenta está confirmada y lista para un uso seguro del portal.",
    welcomeTitle: "¡Bienvenido a EduJournal!",
    welcomeBody:
      "Tu cuenta está lista. También hemos enviado un correo de verificación a tu bandeja de entrada.",
    dismissAriaLabel: "Cerrar mensaje",
  },
  de: {
    emailVerifiedTitle: "Ihre E-Mail-Adresse ist jetzt bestätigt!",
    emailVerifiedBody:
      "Ihr Konto ist verifiziert und bereit für die sichere Portalnutzung.",
    welcomeTitle: "Willkommen bei EduJournal!",
    welcomeBody:
      "Ihr Konto ist bereit. Wir haben außerdem eine Bestätigungs-E-Mail an Ihr Postfach gesendet.",
    dismissAriaLabel: "Nachricht schließen",
  },
};

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
  searchParams: ReadonlyURLSearchParams | string | null,
  nextTab: string,
  defaultTab: string
): string {
  const rawQuery =
    typeof searchParams === "string"
      ? searchParams
      : searchParams?.toString() || "";
  const params = new URLSearchParams(rawQuery);
  params.delete("welcome");
  params.delete("emailVerified");
  if (nextTab === defaultTab) {
    params.delete("tab");
  } else {
    params.set("tab", nextTab);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

const TabSearchParamObserver: React.FC<{
  onParamsChange: (tab: string | null, query: string) => void;
}> = ({ onParamsChange }) => {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParamsChange(searchParams?.get("tab") ?? null, searchParams?.toString() ?? "");
  }, [searchParams, onParamsChange]);
  return null;
};

interface DashboardShellBridgeProps {
  locale?: string;
  initialUserName?: string;
  initialUserEmail?: string;
  children: React.ReactNode;
}

const DashboardSearchParamsObserver: React.FC<{
  onSearchParamsChange: (tab: string | null, query: string, banner: "emailVerified" | "welcome" | null) => void;
}> = ({ onSearchParamsChange }) => {
  const searchParams = useSearchParams();
  useEffect(() => {
    const tab = searchParams?.get("tab") ?? null;
    const query = searchParams?.toString() ?? "";
    const banner =
      searchParams?.get("emailVerified") === "1"
        ? "emailVerified"
        : searchParams?.get("welcome") === "1"
          ? "welcome"
          : null;
    onSearchParamsChange(tab, query, banner);
  }, [searchParams, onSearchParamsChange]);
  return null;
};

const DashboardShellInner: React.FC<DashboardShellBridgeProps> = ({
  locale: fallbackLocale = "da",
  initialUserName,
  initialUserEmail,
  children,
}) => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || `/${fallbackLocale}/dashboard/personal`;

  const locale =
    typeof params?.locale === "string" && params.locale
      ? params.locale
      : fallbackLocale;
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusBanner, setStatusBanner] = useState<"emailVerified" | "welcome" | null>(
    null
  );
  const bannerCopy = DASHBOARD_BANNER_COPY[resolveUiLocale(locale)];

  const handleSearchParamsChange = React.useCallback(
    (tab: string | null, query: string, banner: "emailVerified" | "welcome" | null) => {
      setActiveTab(tab);
      setSearchQuery(query);
      if (banner) {
        setStatusBanner(banner);
      }
    },
    []
  );

  const handleDismissBanner = () => {
    setStatusBanner(null);
    if (typeof window !== "undefined") {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("emailVerified");
      nextParams.delete("welcome");
      const query = nextParams.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }
  };

  const handleLocaleNavigate = (nextLocale: string) => {
    const restOfPath = pathname.startsWith(`/${locale}`)
      ? pathname.slice(locale.length + 1)
      : pathname;
    const normalizedRest = restOfPath.startsWith("/")
      ? restOfPath
      : `/${restOfPath}`;
    const target = `/${nextLocale}${normalizedRest}${searchQuery ? `?${searchQuery}` : ""}`;
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
      userName={initialUserName}
      userEmail={initialUserEmail}
      onNavigate={(href) => router.push(href)}
      onLocaleNavigate={handleLocaleNavigate}
      onLogout={() => void handleLogout()}
    >
      <Suspense fallback={null}>
        <DashboardSearchParamsObserver onSearchParamsChange={handleSearchParamsChange} />
      </Suspense>
      {statusBanner === "emailVerified" && (
        <div
          data-testid="email-verified-banner"
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-xs"
        >
          <div className="flex items-start gap-2.5">
            <i
              className="bi bi-check-circle-fill mt-0.5 text-base text-emerald-700"
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold">{bannerCopy.emailVerifiedTitle}</div>
              <div className="text-xs text-emerald-800">{bannerCopy.emailVerifiedBody}</div>
            </div>
          </div>
          <button
            type="button"
            aria-label={bannerCopy.dismissAriaLabel}
            onClick={handleDismissBanner}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
      )}
      {statusBanner === "welcome" && (
        <div
          data-testid="welcome-verify-email-banner"
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950 shadow-xs"
        >
          <div className="flex items-start gap-2.5">
            <i
              className="bi bi-envelope-check mt-0.5 text-base text-teal-700"
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold">{bannerCopy.welcomeTitle}</div>
              <div className="text-xs text-teal-800">{bannerCopy.welcomeBody}</div>
            </div>
          </div>
          <button
            type="button"
            aria-label={bannerCopy.dismissAriaLabel}
            onClick={handleDismissBanner}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-teal-200 bg-white text-teal-900 hover:bg-teal-100"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
      )}
      {children}
    </ConnectedPortalWorkspaceShell>
  );
};

export const DashboardShellBridge: React.FC<DashboardShellBridgeProps> = ({
  locale = "da",
  initialUserName,
  initialUserEmail,
  children,
}) => {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <DashboardShellInner
        locale={locale}
        initialUserName={initialUserName}
        initialUserEmail={initialUserEmail}
      >
        {children}
      </DashboardShellInner>
    </SessionProvider>
  );
};

interface SyncedClientPortalWorkspaceProps {
  locale?: string;
  userName?: string;
  secureStatus?: string | null;
  defaultTab?: ClientTab;
}

export const SyncedClientPortalWorkspace: React.FC<
  SyncedClientPortalWorkspaceProps
> = ({ locale, userName, secureStatus, defaultTab = "overview" }) => {
  const { update } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/personal";
  const [activeTab, setActiveTab] = useState<ClientTab>(defaultTab);
  const [currentQuery, setCurrentQuery] = useState<string>("");
  const activeLocale =
    (typeof params?.locale === "string" && params.locale) || locale;
  const routeDefaultTab: ClientTab = "overview";

  const handleParamsChange = useCallback(
    (rawTab: string | null, query: string) => {
      setCurrentQuery(query);
      setActiveTab(
        rawTab && VALID_CLIENT_TABS.has(rawTab)
          ? (rawTab as ClientTab)
          : routeDefaultTab
      );
    },
    []
  );

  return (
    <>
      <Suspense fallback={null}>
        <TabSearchParamObserver onParamsChange={handleParamsChange} />
      </Suspense>
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
          setActiveTab(nextTab);
          router.replace(
            buildTabHref(pathname, currentQuery, nextTab, routeDefaultTab),
            { scroll: false }
          );
        }}
      />
    </>
  );
};

interface SyncedTherapistWorkspaceProps {
  locale?: string;
  therapistName?: string;
  defaultTab?: TherapistTab;
}

export const SyncedTherapistWorkspace: React.FC<
  SyncedTherapistWorkspaceProps
> = ({ locale, therapistName, defaultTab = "overview" }) => {
  const { update } = useSession();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || "/da/dashboard/therapist";
  const [activeTab, setActiveTab] = useState<TherapistTab>(defaultTab);
  const [currentQuery, setCurrentQuery] = useState<string>("");
  const activeLocale =
    (typeof params?.locale === "string" && params.locale) || locale;
  const routeDefaultTab: TherapistTab = pathname
    .replace(/\/+$/, "")
    .endsWith("/clinic")
    ? "clinic_cvr"
    : "overview";

  const handleParamsChange = useCallback(
    (rawTab: string | null, query: string) => {
      setCurrentQuery(query);
      setActiveTab(
        rawTab && VALID_THERAPIST_TABS.has(rawTab)
          ? (rawTab as TherapistTab)
          : routeDefaultTab
      );
    },
    [routeDefaultTab]
  );

  return (
    <>
      <Suspense fallback={null}>
        <TabSearchParamObserver onParamsChange={handleParamsChange} />
      </Suspense>
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
          setActiveTab(nextTab);
          router.replace(
            buildTabHref(pathname, currentQuery, nextTab, routeDefaultTab),
            { scroll: false }
          );
        }}
      />
    </>
  );
};
