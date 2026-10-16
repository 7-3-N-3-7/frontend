"use client";

import React, { useEffect, useState } from "react";
import { usePathname, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import UserDropdown from "@/app/[locale]/dashboard/UserDropdown";
import { useI18nCache } from "@/components/CachedI18nProvider";

export default function PortalWorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const i18nCache = useI18nCache();
  const [me, setMe] = useState<any>(null);

  const isTherapistRoute = pathname.startsWith("/dashboard/therapist") || pathname.startsWith("/dashboard/clinic");
  const isAdminMode = pathname.startsWith("/dashboard/admin");
  const isSettingsMode = pathname.startsWith("/dashboard/settings");

  const tr = (key: string, fallback: string) => {
    try {
      return t.has(key as any) ? t(key as any) : fallback;
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    const loader = i18nCache?.getCachedMe
      ? i18nCache.getCachedMe()
      : fetch("/api/backend/clinic/me").then((r) => (r.ok ? r.json() : null));
    loader
      .then((data) => {
        if (data) setMe(data);
      })
      .catch(() => {});
  }, [i18nCache]);

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ backgroundColor: "#f4f7f9" }}>
      {/* Clean Bootstrap 5 Top Navigation Header */}
      <header className="navbar navbar-expand-lg bg-white border-bottom shadow-xs px-3 px-lg-4 py-2 sticky-top">
        <div className="container-fluid px-0 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-4">
            <Link
              href={isTherapistRoute ? "/dashboard/therapist" : "/dashboard/personal"}
              className="d-flex align-items-center text-decoration-none gap-2"
            >
              <div
                className="rounded-3 d-flex align-items-center justify-content-center text-white shadow-xs"
                style={{
                  width: "38px",
                  height: "38px",
                  backgroundColor: isTherapistRoute
                    ? "#0f766e"
                    : isAdminMode
                    ? "#4338ca"
                    : "#2563eb",
                }}
              >
                <i
                  className={`bi ${
                    isTherapistRoute
                      ? "bi-hospital-fill"
                      : isAdminMode
                      ? "bi-translate"
                      : "bi-journal-medical"
                  } fs-5`}
                ></i>
              </div>
              <div>
                <div className="fw-bold text-dark" style={{ fontSize: "1.05rem", letterSpacing: "-0.3px" }}>
                  {tr("portal.brandTitle", tr("landing.nav.title", "EduJournal"))}
                </div>
                <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                  {isTherapistRoute
                    ? me?.providerProfile?.organisation?.name
                      ? `${me.providerProfile.organisation.name} (CVR: ${me.providerProfile.organisation.cvrNumber})`
                      : tr("portal.therapistPortalSub", "Therapist & Clinic Portal")
                    : isAdminMode
                    ? tr("portal.adminPortalSub", "Platform Administration (i18n)")
                    : tr("portal.clientPortalSub", tr("dashboard.personal.title", "Personal Client Portal"))}
                </div>
              </div>
            </Link>

            {/* Role-Specific Navigation Links */}
            <nav className="d-none d-md-flex align-items-center gap-1 ms-2">
              {!isTherapistRoute && !isAdminMode && isSettingsMode && (
                <Link
                  href="/dashboard/personal"
                  className="btn btn-sm rounded-pill px-3 fw-medium btn-light text-secondary"
                >
                  <i className="bi bi-grid-1x2 me-1"></i>{" "}
                  {tr("portal.navClientOverview", tr("dashboard.layout.home", "My Overview"))}
                </Link>
              )}
            </nav>
          </div>

          <div className="d-flex align-items-center gap-3">
            <LanguageSwitcher />
            <UserDropdown />
          </div>
        </div>
      </header>

      {/* Main Content Container (Full 8/8 Browser Width for 1/8 Left Sidebar + 7/8 Workspace) */}
      <main className="flex-grow-1 container-fluid py-3 px-2 px-lg-3">
        {children}
      </main>
    </div>
  );
}

