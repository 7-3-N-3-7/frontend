"use client";

import React, { useState, useEffect } from "react";
import { Dropdown } from "react-bootstrap";
import { Dialog } from "@base-ui/react/dialog";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useI18nCache } from "@/components/CachedI18nProvider";

interface MeContext {
  userUuid: string;
  username: string;
  fullName: string;
  email: string;
  isTherapist: boolean;
  isAdmin: boolean;
  providerProfile?: {
    id: string;
    displayName: string;
    organisation?: {
      cvrNumber: string;
      name: string;
    };
  } | null;
}

export default function UserDropdown() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const i18nCache = useI18nCache();
  const [me, setMe] = useState<MeContext | null>(null);
  const [organisations, setOrganisations] = useState<Array<{ id: string; cvrNumber: string; name: string }>>([]);
  const [showOnboardDialog, setShowOnboardDialog] = useState(false);

  const [cvrMode, setCvrMode] = useState<"NEW" | "EXISTING">("NEW");
  const [cvrNumber, setCvrNumber] = useState("");
  const [organisationName, setOrganisationName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [biography, setBiography] = useState("");
  const [workingHoursJson, setWorkingHoursJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isTherapistView = pathname.startsWith("/dashboard/therapist");

  const tr = (key: string, fallback: string) => {
    try {
      return t.has(key as any) ? t(key as any) : fallback;
    } catch {
      return fallback;
    }
  };

  const loadMe = async (forceRefresh = false) => {
    try {
      const data = i18nCache?.getCachedMe
        ? await i18nCache.getCachedMe(forceRefresh)
        : await fetch("/api/backend/clinic/me").then((r) => (r.ok ? r.json() : null));
      if (data) {
        setMe(data);
        setDisplayName(data.fullName || data.username || "");
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMe(false);
  }, [i18nCache]);

  const openOnboardingModal = async () => {
    setErrorMsg("");
    setShowOnboardDialog(true);
    try {
      const res = await fetch("/api/backend/clinic/organisations", { cache: "no-store" });
      if (res.ok) {
        const orgs = await res.json();
        setOrganisations(Array.isArray(orgs) ? orgs : []);
      }
    } catch {
      // ignore
    }
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/backend/clinic/therapist-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUuid: me.userUuid,
          displayName: displayName || me.fullName,
          cvrNumber,
          organisationName,
          biography,
          workingHoursJson,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Kunne ikke oprette terapeutprofil");
      }

      // Force NextAuth to refresh the Keycloak access token so the new 'therapist' role from Keycloak is in the JWT
      try {
        const csrfRes = await fetch("/api/auth/csrf", { cache: "no-store" });
        if (csrfRes.ok) {
          const { csrfToken } = await csrfRes.json();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csrfToken, data: { refreshRoles: true } }),
          });
        }
      } catch {
        // ignore
      }

      await loadMe(true);
      setShowOnboardDialog(false);
      router.push("/dashboard/therapist");
    } catch (err: any) {
      setErrorMsg(err?.message || "Fejl ved oprettelse af terapeutprofil");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dropdown>
        <Dropdown.Toggle
          variant="light"
          id="user-profile-dropdown"
          className="d-flex align-items-center gap-2 border rounded-pill px-3 py-1.5 shadow-xs bg-white text-dark text-decoration-none"
        >
          <div
            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
            style={{
              width: "30px",
              height: "30px",
              fontSize: "0.8rem",
              backgroundColor: isTherapistView ? "#0f766e" : "#2563eb",
            }}
          >
            {(me?.fullName || "U").charAt(0).toUpperCase()}
          </div>
          <div className="d-flex flex-column text-start" style={{ lineHeight: 1.15 }}>
            <span className="fw-semibold" style={{ fontSize: "0.85rem" }}>
              {me?.fullName || tr("dashboard.dropdown.account", "Account")}
            </span>
            <span className="text-muted" style={{ fontSize: "0.7rem" }}>
              {isTherapistView
                ? `${tr("portal.therapistClinicProfile", "Therapist Profile")}${
                    me?.providerProfile?.organisation?.cvrNumber
                      ? ` • CVR ${me.providerProfile.organisation.cvrNumber}`
                      : ""
                  }`
                : tr("portal.personalClientProfile", "Personal Client Profile")}
            </span>
          </div>
        </Dropdown.Toggle>

        <Dropdown.Menu align="end" className="shadow border-0 rounded-4 p-2 mt-2" style={{ minWidth: "260px" }}>
          <div className="px-3 py-2 border-bottom mb-1">
            <div className="fw-bold text-dark" style={{ fontSize: "0.9rem" }}>
              {me?.fullName || me?.username}
            </div>
            <div className="text-muted small text-truncate">{me?.email}</div>
          </div>

          {/* Role-based Profile Switcher inside User Menu (Answer A1) */}
          {me?.isTherapist ? (
            isTherapistView ? (
              <Dropdown.Item
                onClick={() => router.push("/dashboard/personal")}
                className="rounded-3 py-2 fw-medium text-primary"
              >
                <i className="bi bi-person-heart me-2"></i>{" "}
                {tr("portal.switchToClient", "Switch to Personal Client Profile")}
              </Dropdown.Item>
            ) : (
              <Dropdown.Item
                onClick={() => router.push("/dashboard/therapist")}
                className="rounded-3 py-2 fw-medium text-success"
              >
                <i className="bi bi-hospital me-2"></i>{" "}
                {tr("portal.switchToTherapist", "Switch to Therapist Clinic Profile")}
              </Dropdown.Item>
            )
          ) : (
            <Dropdown.Item
              onClick={openOnboardingModal}
              className="rounded-3 py-2 fw-medium text-teal"
              style={{ color: "#0f766e" }}
            >
              <i className="bi bi-building-add me-2"></i>{" "}
              {tr("portal.registerAsTherapistBtn", "Register as Therapist (CVR)")}
            </Dropdown.Item>
          )}

          {me?.isAdmin && (
            <Dropdown.Item
              onClick={() => router.push("/dashboard/admin")}
              className="rounded-3 py-2 fw-medium"
            >
              <i className="bi bi-translate me-2"></i>{" "}
              {tr("portal.adminI18nBtn", "Admin Language & i18n Manager")}
            </Dropdown.Item>
          )}

          <Dropdown.Item
            onClick={() => router.push("/dashboard/settings")}
            className="rounded-3 py-2"
          >
            <i className="bi bi-gear me-2"></i>{" "}
            {tr("portal.profileSettingsBtn", tr("dashboard.dropdown.settings", "Account Settings"))}
          </Dropdown.Item>

          <Dropdown.Divider />

          <Dropdown.Item
            onClick={(e) => {
              e.preventDefault();
              signOut({ callbackUrl: "/" });
            }}
            className="rounded-3 py-2 text-danger fw-medium"
          >
            <i className="bi bi-box-arrow-right me-2"></i>{" "}
            {tr("portal.signOutBtn", tr("dashboard.dropdown.signOut", "Sign out"))}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      {/* Base UI + Bootstrap 5 Modal for Therapist CVR Registration (Bilag 5.1.2) */}
      <Dialog.Root open={showOnboardDialog} onOpenChange={setShowOnboardDialog}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup className="base-dialog-popup p-4">
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <div>
                <span className="badge bg-success-subtle text-success mb-1">Bilag 5.1.2 • CVR Onboarding</span>
                <Dialog.Title className="h5 fw-bold mb-0">
                  Opret Terapeut- &amp; Klinikprofil
                </Dialog.Title>
              </div>
              <Dialog.Close className="btn-close" aria-label="Luk" />
            </div>

            {errorMsg && <div className="alert alert-danger py-2 small">{errorMsg}</div>}

            <form onSubmit={handleOnboardSubmit}>
              <div className="btn-group w-100 mb-3" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${cvrMode === "NEW" ? "btn-dark" : "btn-outline-secondary"}`}
                  onClick={() => {
                    setCvrMode("NEW");
                    setCvrNumber("");
                    setOrganisationName("");
                  }}
                >
                  Opret Ny Klinik (CVR)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${cvrMode === "EXISTING" ? "btn-dark" : "btn-outline-secondary"}`}
                  onClick={() => setCvrMode("EXISTING")}
                >
                  Tilknyt Eksisterende Klinik (CVR)
                </button>
              </div>

              {cvrMode === "EXISTING" && organisations.length > 0 && (
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Vælg registreret klinik fra databasen</label>
                  <select
                    className="form-select form-select-sm"
                    value={cvrNumber}
                    onChange={(e) => {
                      const selected = organisations.find((o) => o.cvrNumber === e.target.value);
                      setCvrNumber(e.target.value);
                      if (selected) setOrganisationName(selected.name);
                    }}
                  >
                    <option value="">-- Vælg Klinik --</option>
                    {organisations.map((org) => (
                      <option key={org.id} value={org.cvrNumber}>
                        {org.name} (CVR: {org.cvrNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="row g-3 mb-3">
                <div className="col-md-5">
                  <label className="form-label small fw-semibold">CVR-nummer (8 cifre)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    maxLength={8}
                    placeholder="f.eks. 39485712"
                    value={cvrNumber}
                    onChange={(e) => setCvrNumber(e.target.value)}
                  />
                </div>
                <div className="col-md-7">
                  <label className="form-label small fw-semibold">Klinik / Organisationsnavn</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="f.eks. Nordic Mind & Trauma Kbh"
                    value={organisationName}
                    onChange={(e) => setOrganisationName(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold">Visningsnavn &amp; Titel</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="f.eks. Aut. Psykolog"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold">Arbejdstider</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={workingHoursJson}
                    onChange={(e) => setWorkingHoursJson(e.target.value)}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold">Klinisk Biografi &amp; Specialer</label>
                  <textarea
                    rows={3}
                    className="form-control"
                    required
                    placeholder="Beskriv dine kliniske specialer og terapiformer..."
                    value={biography}
                    onChange={(e) => setBiography(e.target.value)}
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                <Dialog.Close className="btn btn-light">Annuller</Dialog.Close>
                <button type="submit" className="btn btn-success px-4" disabled={submitting}>
                  {submitting ? "Gemmer i databasen..." : "Aktivér Terapeut-Profil"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
