"use client";

import React, { useState, useEffect } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { useTranslations } from "next-intl";

export default function ProfileAndClinicSettingsPage() {
  const t = useTranslations();
  const tr = (key: string, fallback: string) => {
    try {
      return t.has(key as any) ? t(key as any) : fallback;
    } catch {
      return fallback;
    }
  };
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  const [clientProfile, setClientProfile] = useState({
    userId: "",
    fullName: "",
    dateOfBirth: "",
    homeAddress: "",
    postalCode: "",
    phoneNumber: "",
    email: "",
  });

  const [therapistProfile, setTherapistProfile] = useState({
    userUuid: "",
    displayName: "",
    cvrNumber: "",
    organisationName: "",
    biography: "",
    workingHoursJson: "",
  });

  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backend/clinic/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setMe(data);
          const cp = data.clientProfile || {};
          setClientProfile({
            userId: data.userUuid || cp.userId || "",
            fullName: cp.fullName || data.fullName || "",
            dateOfBirth: cp.dateOfBirth || "",
            homeAddress: cp.homeAddress || "",
            postalCode: cp.postalCode || "",
            phoneNumber: cp.phoneNumber || "",
            email: cp.email || data.email || "",
          });

          const pp = data.providerProfile || {};
          setTherapistProfile({
            userUuid: data.userUuid || "",
            displayName: pp.displayName || data.fullName || "",
            cvrNumber: pp.organisation?.cvrNumber || "",
            organisationName: pp.organisation?.name || "",
            biography: pp.biography || "",
            workingHoursJson: pp.workingHoursJson || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveClientProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/backend/clinic/client-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientProfile),
    });
    if (res.ok) {
      setSavedBanner("Dine personlige stamdata (Bilag 5.1.1) er opdateret i PostgreSQL.");
      setTimeout(() => setSavedBanner(null), 4000);
    }
  };

  const handleSaveTherapistProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/backend/clinic/therapist-onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(therapistProfile),
    });
    if (res.ok) {
      setSavedBanner("Klinik- & CVR-indstillinger (Bilag 5.1.2) er gemt i PostgreSQL.");
      setTimeout(() => setSavedBanner(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5 text-muted">
        <div className="spinner-border text-primary mb-2" role="status" />
        <div>Loading PostgreSQL profile data...</div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-4">
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-body p-4">
          <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-1 mb-2">
            Bilag 5.1.1 &amp; 5.1.2 • PostgreSQL
          </span>
          <h1 className="h3 fw-bold text-dark mb-1">
            {tr("portal.profileSettingsBtn", tr("dashboard.dropdown.settings", "My Profile & Settings"))}
          </h1>
          <p className="text-muted small mb-0">
            PostgreSQL (`client_profiles`, `provider_profiles` &amp; `organisations`).
          </p>
        </div>
      </div>

      {savedBanner && (
        <div className="alert alert-success rounded-4 shadow-xs mb-0">{savedBanner}</div>
      )}

      <Tabs.Root defaultValue="client_details">
        <div className="card border-0 shadow-xs rounded-4 bg-white">
          <div className="card-header bg-white border-bottom px-4 py-3">
            <Tabs.List className="d-flex flex-wrap gap-2">
              <Tabs.Tab value="client_details" className="base-tab-btn">
                <i className="bi bi-person-vcard"></i>{" "}
                {tr("portal.navClientSettings", "Personal Profile (Bilag 5.1.1)")}
              </Tabs.Tab>
              {me?.isTherapist && (
                <Tabs.Tab value="therapist_details" className="base-tab-btn">
                  <i className="bi bi-hospital"></i>{" "}
                  {tr("portal.navTherapistSettings", "Clinic CVR & Working Hours (Bilag 5.1.2)")}
                </Tabs.Tab>
              )}
            </Tabs.List>
          </div>

          <div className="card-body p-4">
            <Tabs.Panel value="client_details">
              <form onSubmit={handleSaveClientProfile} style={{ maxWidth: "720px" }}>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Fulde Navn</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={clientProfile.fullName}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, fullName: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Fødselsdato</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={clientProfile.dateOfBirth}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, dateOfBirth: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-8">
                    <label className="form-label small fw-semibold">Hjemmeadresse</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={clientProfile.homeAddress}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, homeAddress: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Postnummer</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={clientProfile.postalCode}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, postalCode: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Telefonnummer</label>
                    <input
                      type="tel"
                      className="form-control"
                      required
                      value={clientProfile.phoneNumber}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, phoneNumber: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      required
                      value={clientProfile.email}
                      onChange={(e) =>
                        setClientProfile({ ...clientProfile, email: e.target.value })
                      }
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary rounded-pill px-4 py-2 fw-semibold">
                  Gem Personlige Stamdata i PostgreSQL
                </button>
              </form>
            </Tabs.Panel>

            {me?.isTherapist && (
              <Tabs.Panel value="therapist_details">
                <form onSubmit={handleSaveTherapistProfile} style={{ maxWidth: "720px" }}>
                  <div className="row g-3 mb-4">
                    <div className="col-md-4">
                      <label className="form-label small fw-semibold">CVR-nummer (8 cifre)</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        maxLength={8}
                        value={therapistProfile.cvrNumber}
                        onChange={(e) =>
                          setTherapistProfile({
                            ...therapistProfile,
                            cvrNumber: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label small fw-semibold">Klinik / Organisationsnavn</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={therapistProfile.organisationName}
                        onChange={(e) =>
                          setTherapistProfile({
                            ...therapistProfile,
                            organisationName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold">Visningsnavn &amp; Titel</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={therapistProfile.displayName}
                        onChange={(e) =>
                          setTherapistProfile({
                            ...therapistProfile,
                            displayName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold">Arbejdstider</label>
                      <input
                        type="text"
                        className="form-control"
                        value={therapistProfile.workingHoursJson}
                        onChange={(e) =>
                          setTherapistProfile({
                            ...therapistProfile,
                            workingHoursJson: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-semibold">Klinisk Biografi</label>
                      <textarea
                        rows={3}
                        className="form-control"
                        value={therapistProfile.biography}
                        onChange={(e) =>
                          setTherapistProfile({
                            ...therapistProfile,
                            biography: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-success rounded-pill px-4 py-2 fw-semibold">
                    Gem Klinik- &amp; CVR-Indstillinger i PostgreSQL
                  </button>
                </form>
              </Tabs.Panel>
            )}
          </div>
        </div>
      </Tabs.Root>
    </div>
  );
}
