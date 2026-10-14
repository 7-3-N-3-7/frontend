"use client";

import React, { useEffect, useState } from "react";
import { usePathname, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import UserDropdown from "@/app/[locale]/dashboard/UserDropdown";

export default function PortalWorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const [me, setMe] = useState<any>(null);

  const isTherapistMode = pathname.startsWith("/dashboard/therapist");
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
    fetch("/api/backend/clinic/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMe(data);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ backgroundColor: "#f4f7f9" }}>
      {/* Clean Bootstrap 5 Top Navigation Header */}
      <header className="navbar navbar-expand-lg bg-white border-bottom shadow-xs px-3 px-lg-4 py-2 sticky-top">
        <div className="container-fluid px-0 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-4">
            <Link
              href={isTherapistMode ? "/dashboard/therapist" : "/dashboard/personal"}
              className="d-flex align-items-center text-decoration-none gap-2"
            >
              <div
                className="rounded-3 d-flex align-items-center justify-content-center text-white shadow-xs"
                style={{
                  width: "38px",
                  height: "38px",
                  backgroundColor: isTherapistMode
                    ? "#0f766e"
                    : isAdminMode
                    ? "#4338ca"
                    : "#2563eb",
                }}
              >
                <i
                  className={`bi ${
                    isTherapistMode
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
                  {isTherapistMode
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
              {!isTherapistMode && !isAdminMode && (
                <>
                  <Link
                    href="/dashboard/personal"
                    className={`btn btn-sm rounded-pill px-3 fw-medium ${
                      pathname === "/dashboard/personal"
                        ? "btn-primary"
                        : "btn-light text-secondary"
                    }`}
                  >
                    <i className="bi bi-grid-1x2 me-1"></i>{" "}
                    {tr("portal.navClientOverview", tr("dashboard.layout.home", "My Overview"))}
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className={`btn btn-sm rounded-pill px-3 fw-medium ${
                      isSettingsMode ? "btn-primary" : "btn-light text-secondary"
                    }`}
                  >
                    <i className="bi bi-person-vcard me-1"></i>{" "}
                    {tr("portal.navClientSettings", tr("dashboard.dropdown.settings", "Settings"))}
                  </Link>
                </>
              )}

              {isTherapistMode && (
                <>
                  <Link
                    href="/dashboard/therapist"
                    className="btn btn-sm rounded-pill px-3 fw-medium text-white"
                    style={{ backgroundColor: "#0f766e" }}
                  >
                    <i className="bi bi-calendar3 me-1"></i>{" "}
                    {tr("portal.navTherapistCalendar", "Clinic Calendar & Client Workspaces")}
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className={`btn btn-sm rounded-pill px-3 fw-medium ${
                      isSettingsMode ? "btn-dark" : "btn-light text-secondary"
                    }`}
                  >
                    <i className="bi bi-building-gear me-1"></i>{" "}
                    {tr("portal.navTherapistSettings", tr("dashboard.dropdown.settings", "Clinic Settings"))}
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="d-flex align-items-center gap-3">
            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-1.5 d-none d-lg-inline-flex align-items-center gap-1">
              <i className="bi bi-database-check"></i>{" "}
              {tr("portal.dbLiveBadge", "PostgreSQL & JGit Live")}
            </span>
            <LanguageSwitcher />
            <UserDropdown />
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-grow-1 container-fluid py-4 px-3 px-lg-4" style={{ maxWidth: "1600px" }}>
        {children}
      </main>
    </div>
  );
}

