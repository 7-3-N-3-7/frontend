"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { useLocale, useTranslations } from "next-intl";
import JGitHistoryTimeline from "@/components/JGitHistoryTimeline";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

const PCL5_QUESTIONS = [
  "Gentagne, forstyrrende og uønskede erindringer om en belastende oplevelse?",
  "Gentagne, forstyrrende drømme eller søvnvanskeligheder relateret til belastning?",
  "Pludselig følelse af eller handling som om den belastende hændelse skete igen?",
  "Stærk følelsesmæssig uro eller fysiske reaktioner ved påmindelser?",
  "Undgåelse af bestemte tanker, følelser eller eksterne påmindelser?",
];

export default function ClientPortalWorkspace({
  userName,
  secureStatus,
}: {
  userName?: string;
  secureStatus?: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, any>) => {
    try {
      return t.has(key as any) ? t(key as any, values) : fallback;
    } catch {
      return fallback;
    }
  };
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [overview, setOverview] = useState<{
    clientProfile: any;
    providerProfile: any;
    appointments: any[];
    handshakes: any[];
    journals: any[];
    pcl5Tests: any[];
    providers: any[];
    services: any[];
  }>({
    clientProfile: null,
    providerProfile: null,
    appointments: [],
    handshakes: [],
    journals: [],
    pcl5Tests: [],
    providers: [],
    services: [],
  });

  const [statusAlert, setStatusAlert] = useState<{
    type: "success" | "danger" | "info";
    text: string;
  } | null>(null);

  // Search & Filter states
  const [timelineFilter, setTimelineFilter] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");

  // Booking Form State
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookingSlot, setBookingSlot] = useState("10:00");
  const [grantHandshakeOnBook, setGrantHandshakeOnBook] = useState(true);

  // Reschedule Dialog State
  const [rescheduleTarget, setRescheduleTarget] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("11:00");

  // Journal Composer State
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalMood, setJournalMood] = useState(7);
  const [sharedWithTherapists, setSharedWithTherapists] = useState(true);
  const [selectedTherapistUuids, setSelectedTherapistUuids] = useState<string[]>([]);
  const [initializedTherapistSelection, setInitializedTherapistSelection] = useState(false);

  // Per-entry Individual Access Editor State
  const [editingSharingEntryId, setEditingSharingEntryId] = useState<string | null>(null);
  const [savingSharingEntryId, setSavingSharingEntryId] = useState<string | null>(null);

  // JGit Version History Drawer State
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [gitHistory, setGitHistory] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);

  // PCL-5 Questionnaire State
  const [pclAnswers, setPclAnswers] = useState<number[]>([1, 1, 1, 1, 1]);

  const showMessage = (type: "success" | "danger" | "info", text: string) => {
    setStatusAlert({ type, text });
    setTimeout(() => setStatusAlert(null), 5000);
  };

  const fetchDatabaseData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const meRes = await fetch("/api/backend/clinic/me", { cache: "no-store" });
      if (!meRes.ok) {
        if (!silent) setLoading(false);
        return;
      }
      const meData = await meRes.json();
      setMe(meData);

      const [ovRes, bundleRes] = await Promise.all([
        fetch(`/api/backend/clinic/client/${meData.userUuid}/overview`, {
          cache: "no-store",
        }),
        fetch(`/api/backend/journals/client/${meData.userUuid}`, {
          cache: "no-store",
        }).catch(() => null),
      ]);

      let bundleEntries: any[] = [];
      if (bundleRes && bundleRes.ok) {
        const bData = await bundleRes.json().catch(() => null);
        if (bData && Array.isArray(bData.entries)) {
          bundleEntries = bData.entries;
        }
      }

      if (ovRes.ok) {
        const ovData = await ovRes.json();
        const ovJournals = Array.isArray(ovData.journals) ? ovData.journals : [];
        const mergedMap = new Map<string, any>();
        for (const j of [...bundleEntries, ...ovJournals]) {
          if (j && j.id) {
            mergedMap.set(String(j.id), j);
          }
        }
        const mergedJournals = Array.from(mergedMap.values()).sort((a, b) =>
          String(b.timestamp || "").localeCompare(String(a.timestamp || ""))
        );

        const loadedHandshakes = Array.isArray(ovData.handshakes) ? ovData.handshakes : [];
        setOverview({
          clientProfile: ovData.clientProfile || meData.clientProfile,
          providerProfile: ovData.providerProfile || meData.providerProfile,
          appointments: Array.isArray(ovData.appointments) ? ovData.appointments : [],
          handshakes: loadedHandshakes,
          journals: mergedJournals,
          pcl5Tests: Array.isArray(ovData.pcl5Tests) ? ovData.pcl5Tests : [],
          providers: Array.isArray(ovData.providers) ? ovData.providers : [],
          services: Array.isArray(ovData.services) ? ovData.services : [],
        });

        const activeHsUuids = loadedHandshakes
          .filter((h: any) => h.status === "ACTIVE" && h.therapistUuid)
          .map((h: any) => String(h.therapistUuid));
        if (!initializedTherapistSelection && activeHsUuids.length > 0) {
          setSelectedTherapistUuids(activeHsUuids);
          setInitializedTherapistSelection(true);
        }

        if (!selectedServiceId && Array.isArray(ovData.services) && ovData.services.length > 0) {
          setSelectedServiceId(ovData.services[0].id);
        }
      }
    } catch {
      if (!silent) {
        showMessage("danger", "Kunne ikke hente data fra backend-databasen.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedServiceId, initializedTherapistSelection]);

  useEffect(() => {
    fetchDatabaseData(false);
    const onFocus = () => fetchDatabaseData(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDatabaseData]);

  // Book Appointment (Bilag 5.1.4 + Q3 + Q9)
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;

    const serviceObj = overview.services.find((s: any) => s.id === selectedServiceId);
    const therapistUuid =
      serviceObj?.provider?.userUuid ||
      overview.providers[0]?.userUuid;

    if (!therapistUuid) {
      showMessage("danger", "Ingen tilgængelig terapeut fundet for den valgte ydelse.");
      return;
    }

    const startIso = `${bookingDate}T${bookingSlot}:00`;
    const [h, m] = bookingSlot.split(":");
    const endHour = String(Number(h) + 1).padStart(2, "0");
    const endIso = `${bookingDate}T${endHour}:${m}:00`;

    try {
      const res = await fetch("/api/backend/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: me.userUuid,
          therapistUuid,
          serviceId: serviceObj?.id || null,
          startTime: startIso,
          endTime: endIso,
          title: serviceObj ? serviceObj.name : "Klinisk Samtale",
          status: "SCHEDULED",
        }),
      });

      if (res.status === 409) {
        showMessage("danger", "409 Conflict: Dette tidsrum er allerede optaget hos terapeuten. Vælg venligst et andet tidspunkt.");
        return;
      }

      if (!res.ok) {
        throw new Error("Fejl ved booking");
      }

      if (grantHandshakeOnBook) {
        await fetch("/api/backend/clinic/handshakes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientUuid: me.userUuid,
            therapistUuid,
            status: "ACTIVE",
          }),
        });
      }

      await fetchDatabaseData();
      showMessage(
        "success",
        `Aftale booket d. ${bookingDate} kl. ${bookingSlot}${grantHandshakeOnBook ? " inkl. aktivt Handshake-samtykke" : ""}.`
      );
    } catch {
      showMessage("danger", "Kunne ikke gennemføre bookingen.");
    }
  };

  // Reschedule Appointment (PUT /api/v1/appointments/{id})
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;

    const startIso = `${rescheduleDate}T${rescheduleSlot}:00`;
    const [h, m] = rescheduleSlot.split(":");
    const endHour = String(Number(h) + 1).padStart(2, "0");
    const endIso = `${rescheduleDate}T${endHour}:${m}:00`;

    try {
      const res = await fetch(`/api/backend/appointments/${rescheduleTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: rescheduleTarget.clientUuid,
          therapistUuid: rescheduleTarget.therapistUuid,
          serviceId: rescheduleTarget.serviceId,
          startTime: startIso,
          endTime: endIso,
          title: rescheduleTarget.title,
          status: "SCHEDULED",
        }),
      });

      if (res.status === 409) {
        showMessage("danger", "409 Conflict: Det valgte tidsrum er allerede optaget.");
        return;
      }

      setRescheduleTarget(null);
      await fetchDatabaseData();
      showMessage("success", `Aftalen er flyttet til ${rescheduleDate} kl. ${rescheduleSlot}.`);
    } catch {
      showMessage("danger", "Kunne ikke flytte aftalen.");
    }
  };

  // Cancel Appointment (DELETE /api/v1/appointments/{id})
  const handleCancelAppointment = async (id: string) => {
    try {
      await fetch(`/api/backend/appointments/${id}`, { method: "DELETE" });
      await fetchDatabaseData();
      showMessage("info", "Aftalen er aflyst i databasen.");
    } catch {
      showMessage("danger", "Kunne ikke aflyse aftalen.");
    }
  };

  const toggleComposerTherapist = (therapistUuid: string) => {
    setSelectedTherapistUuids((prev) => {
      const exists = prev.includes(therapistUuid);
      const next = exists
        ? prev.filter((id) => id !== therapistUuid)
        : [...prev, therapistUuid];
      if (next.length === 0) {
        setSharedWithTherapists(false);
      } else {
        setSharedWithTherapists(true);
      }
      return next;
    });
  };

  // Create Journal Entry (POST /api/v1/journals)
  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalTitle.trim() || !journalContent.trim() || !me?.userUuid) return;

    const activeHs = overview.handshakes.filter((h: any) => h.status === "ACTIVE");
    const effectiveShared =
      sharedWithTherapists && (activeHs.length === 0 || selectedTherapistUuids.length > 0);
    const effectiveTherapistUuids = effectiveShared ? selectedTherapistUuids : [];

    try {
      const res = await fetch("/api/backend/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: me.userUuid,
          title: journalTitle.trim(),
          content: journalContent.trim(),
          moodRating: journalMood,
          sharedWithTherapists: effectiveShared,
          sharedTherapistUuids: effectiveTherapistUuids,
        }),
      });

      if (res.ok) {
        setJournalTitle("");
        setJournalContent("");
        await fetchDatabaseData();
        showMessage("success", "Dagbogsindlæg gemt i PostgreSQL og committet til JGit.");
      }
    } catch {
      showMessage("danger", "Kunne ikke gemme dagbogsindlæg.");
    }
  };

  // Update Individual JournalEntry Sharing / Therapist Access (PATCH /api/v1/journals/{id}/sharing)
  const handleUpdateEntrySharing = async (
    entryId: string,
    nextSharedWithTherapists: boolean,
    nextTherapistUuids: string[]
  ) => {
    setSavingSharingEntryId(entryId);
    try {
      const res = await fetch(`/api/backend/journals/${entryId}/sharing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithTherapists: nextSharedWithTherapists,
          sharedTherapistUuids: nextSharedWithTherapists ? nextTherapistUuids : [],
        }),
      });
      if (res.ok) {
        await fetchDatabaseData(true);
        showMessage(
          "success",
          nextSharedWithTherapists
            ? "Adgang til dagbogsindlæg opdateret for de valgte terapeuter."
            : "Dagbogsindlæg er nu sat som privat (skjult for alle terapeuter)."
        );
      }
    } catch {
      showMessage("danger", "Kunne ikke opdatere delingsindstillinger for indlægget.");
    } finally {
      setSavingSharingEntryId(null);
    }
  };

  // Open JGit Version History Drawer (GET /api/v1/journals/history/{clientUuid})
  const handleOpenGitHistory = async (focusCommitHash?: string) => {
    if (!me?.userUuid) return;
    setHistoryDrawerOpen(true);
    try {
      const res = await fetch(`/api/backend/journals/history/${me.userUuid}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const commits = await res.json();
        const list = Array.isArray(commits) ? commits : [];
        setGitHistory(list);
        if (focusCommitHash) {
          const found = list.find((c: any) => c.commitHash === focusCommitHash);
          setSelectedCommit(found || list[0] || null);
        } else {
          setSelectedCommit(list[0] || null);
        }
      }
    } catch {
      setGitHistory([]);
    }
  };

  // Update Handshake Status (Accept / Soft Revoke - Q3 & Q4)
  const handleHandshakeStatus = async (handshakeId: string, status: "ACTIVE" | "REVOKED") => {
    try {
      await fetch(`/api/backend/clinic/handshakes/${handshakeId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchDatabaseData();
      showMessage(
        status === "ACTIVE" ? "success" : "info",
        status === "ACTIVE"
          ? "Handshake accepteret. Terapeuten har nu adgang til dine delte journalindlæg."
          : "Adgang tilbagekaldt (Soft Revoke). Terapeuten har ikke længere adgang, men historiske kliniske noter bevares."
      );
    } catch {
      showMessage("danger", "Kunne ikke opdatere Handshake-status.");
    }
  };

  // Submit PCL-5 Test (POST /api/v1/psychotraumatology/tests)
  const handleSubmitPcl5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;

    const rawSum = pclAnswers.reduce((a, b) => a + b, 0);
    const scaledScore = rawSum * 4;
    const severity =
      scaledScore >= 33
        ? "High Symptoms (Above Clinical Threshold)"
        : scaledScore >= 20
        ? "Moderate Symptoms"
        : "Mild Symptoms";

    try {
      const res = await fetch("/api/backend/psychotraumatology/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: me.userUuid,
          testType: "PCL-5",
          score: scaledScore,
          severity,
          answersJson: JSON.stringify(pclAnswers),
        }),
      });
      if (res.ok) {
        await fetchDatabaseData();
        showMessage("success", `PCL-5 tjek-ind gemt i databasen (Score: ${scaledScore}/80 — ${severity}).`);
      }
    } catch {
      showMessage("danger", "Kunne ikke gemme PCL-5 besvarelse.");
    }
  };

  const activeAppointments = overview.appointments.filter(
    (a: any) => a.status !== "CANCELLED"
  );
  const pendingHandshakes = overview.handshakes.filter(
    (h: any) => h.status === "PENDING"
  );
  const activeHandshakes = overview.handshakes.filter(
    (h: any) => h.status === "ACTIVE"
  );
  const latestMood = overview.journals[0]?.moodRating ?? "-";
  const latestPcl5 = overview.pcl5Tests[overview.pcl5Tests.length - 1];

  return (
    <div className="d-flex flex-column gap-4">
      {/* Welcome Banner + KPI Cards */}
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-body p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
            <div>
              <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-1 mb-2">
                {tr("portal.clientPortalSub", tr("dashboard.personal.title", "Personal Client Portal"))}
              </span>
              <h1 className="h3 fw-bold text-dark mb-1">
                {tr(
                  "portal.welcomeBack",
                  tr("dashboard.personal.welcome", `Welcome, ${overview.clientProfile?.fullName || me?.fullName || userName || "Client"}`, {
                    name: overview.clientProfile?.fullName || me?.fullName || userName || "Client",
                  }),
                  { name: overview.clientProfile?.fullName || me?.fullName || userName || "Client" }
                )}
              </h1>
              <p className="text-muted small mb-0">
                {tr("dashboard.personal.description", "Your appointments, journals, JGit commits, and therapist consents are served live from PostgreSQL & JGit.")}
                {secureStatus ? ` • (${secureStatus})` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenGitHistory()}
              className="btn btn-outline-dark rounded-pill px-3 py-2 fw-medium d-flex align-items-center gap-2"
            >
              <i className="bi bi-git text-success"></i> JGit Tidslinje
            </button>
          </div>

          {/* Pending Handshake Consent Banner (Q3) */}
          {pendingHandshakes.map((hs: any) => (
            <div
              key={hs.id}
              className="alert alert-warning border-warning-subtle rounded-4 d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"
            >
              <div>
                <div className="fw-bold text-dark">
                  <i className="bi bi-shield-exclamation me-2"></i>
                  Handshake: {hs.therapistName} ({hs.organisationName}, CVR: {hs.cvrNumber})
                </div>
                <div className="small text-muted">
                  Accepting grants this therapist access to your shared journal entries.
                </div>
              </div>
              <div className="d-flex gap-2">
                <button
                  onClick={() => handleHandshakeStatus(hs.id, "ACTIVE")}
                  className="btn btn-sm btn-success rounded-pill px-3 fw-semibold"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleHandshakeStatus(hs.id, "REVOKED")}
                  className="btn btn-sm btn-outline-danger rounded-pill px-3"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}

          {/* 4 Bootstrap 5 KPI Cards */}
          <div className="row g-3">
            <div className="col-sm-6 col-xl-3">
              <div className="p-3 rounded-4 border bg-light bg-opacity-50 h-100">
                <div className="text-muted small fw-medium mb-1">
                  <i className="bi bi-calendar-event text-primary me-1"></i>{" "}
                  {tr("portal.nextScheduledSession", "Next Scheduled Session")}
                </div>
                <div className="h4 fw-bold text-dark mb-0">{activeAppointments.length}</div>
                <div className="small text-muted text-truncate mt-1">
                  {activeAppointments[0]
                    ? `${String(activeAppointments[0].startTime).replace("T", " • ").slice(0, 18)}`
                    : tr("portal.noUpcomingAppointments", "No upcoming appointments")}
                </div>
              </div>
            </div>

            <div className="col-sm-6 col-xl-3">
              <div className="p-3 rounded-4 border bg-light bg-opacity-50 h-100">
                <div className="text-muted small fw-medium mb-1">
                  <i className="bi bi-shield-check text-success me-1"></i>{" "}
                  {tr("portal.therapistConsentCard", "Therapist Consent")}
                </div>
                <div className="h4 fw-bold text-dark mb-0">{activeHandshakes.length}</div>
                <div className="small text-muted mt-1">
                  {tr("portal.activeTherapistsCount", `${activeHandshakes.length} Active Therapist(s)`, {
                    count: activeHandshakes.length,
                  })}
                </div>
              </div>
            </div>

            <div className="col-sm-6 col-xl-3">
              <div className="p-3 rounded-4 border bg-light bg-opacity-50 h-100">
                <div className="text-muted small fw-medium mb-1">
                  <i className="bi bi-emoji-smile text-info me-1"></i>{" "}
                  {tr("portal.latestMoodScore", "Latest Mood Score")}
                </div>
                <div className="h4 fw-bold text-dark mb-0">{latestMood} / 10</div>
                <div className="small text-muted mt-1">{overview.journals.length} entries</div>
              </div>
            </div>

            <div className="col-sm-6 col-xl-3">
              <div className="p-3 rounded-4 border bg-light bg-opacity-50 h-100">
                <div className="text-muted small fw-medium mb-1">
                  <i className="bi bi-clipboard2-pulse text-warning me-1"></i>{" "}
                  {tr("portal.pcl5DrawerBtn", "PCL-5 Self-Assessment")}
                </div>
                <div className="h4 fw-bold text-dark mb-0">
                  {latestPcl5 ? `${latestPcl5.score} / 80` : "-"}
                </div>
                <div className="small text-muted text-truncate mt-1">
                  {latestPcl5 ? latestPcl5.severity : "PCL-5"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {statusAlert && (
        <div className={`alert alert-${statusAlert.type} rounded-4 shadow-xs d-flex justify-content-between align-items-center mb-0`}>
          <span>{statusAlert.text}</span>
          <button type="button" className="btn-close" onClick={() => setStatusAlert(null)} />
        </div>
      )}

      {/* Base UI Tabs + Bootstrap 5 Content Panels */}
      <Tabs.Root defaultValue="timeline">
        <div className="card border-0 shadow-xs rounded-4 bg-white">
          <div className="card-header bg-white border-bottom px-4 py-3">
            <Tabs.List className="d-flex flex-wrap gap-2">
              <Tabs.Tab value="timeline" className="base-tab-btn">
                <i className="bi bi-clock-history"></i>{" "}
                {tr("portal.tabAppointments", `My Appointments (${activeAppointments.length})`, {
                  count: activeAppointments.length,
                })}
              </Tabs.Tab>
              <Tabs.Tab value="booking" className="base-tab-btn">
                <i className="bi bi-calendar-plus"></i>{" "}
                {tr("portal.tabMarketplace", "Find Therapist & Book")}
              </Tabs.Tab>
              <Tabs.Tab value="journal" className="base-tab-btn">
                <i className="bi bi-journal-richtext"></i>{" "}
                {tr("portal.tabJournal", "My Journal & PCL-5")} ({overview.journals.length})
              </Tabs.Tab>
              <Tabs.Tab value="pcl5_privacy" className="base-tab-btn">
                <i className="bi bi-shield-lock"></i>{" "}
                {tr("portal.tabConsent", `Therapist Access (${overview.handshakes.length})`, {
                  count: overview.handshakes.length,
                })}
              </Tabs.Tab>
            </Tabs.List>
          </div>

          <div className="card-body p-4">
            {loading ? (
              <div className="text-center py-5 text-muted">
                <div className="spinner-border text-primary mb-2" role="status" />
                <div>Henter dine data fra PostgreSQL...</div>
              </div>
            ) : (
              <>
                {/* TAB 1: INTERACTIVE TIMELINE & APPOINTMENTS (Q7 & Q9) */}
                <Tabs.Panel value="timeline">
                  <div className="row g-4">
                    <div className="col-lg-7">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">Interaktiv Tidslinje</h5>
                        <div className="input-group input-group-sm" style={{ maxWidth: "280px" }}>
                          <span className="input-group-text bg-light">
                            <i className="bi bi-search"></i>
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Søg terapeut, klinik, CVR..."
                            value={timelineFilter}
                            onChange={(e) => setTimelineFilter(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="d-flex flex-column gap-3">
                        {activeAppointments
                          .filter((a: any) =>
                            `${a.title} ${a.therapistName} ${a.organisationName} ${a.cvrNumber}`
                              .toLowerCase()
                              .includes(timelineFilter.toLowerCase())
                          )
                          .map((apt: any) => (
                            <div key={apt.id} className="p-3 rounded-4 border bg-white shadow-xs">
                              <div className="d-flex justify-content-between align-items-start gap-2">
                                <div>
                                  <span className="badge bg-primary-subtle text-primary mb-1">
                                    Aftale • {String(apt.startTime).replace("T", " kl. ").slice(0, 16)}
                                  </span>
                                  <h6 className="fw-bold mb-1">{apt.title}</h6>
                                  <div className="small text-muted">
                                    Behandler: <strong>{apt.therapistName}</strong> • {apt.organisationName}
                                    {apt.cvrNumber ? ` (CVR: ${apt.cvrNumber})` : ""}
                                  </div>
                                </div>
                                <div className="d-flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRescheduleTarget(apt);
                                      setRescheduleDate(String(apt.startTime).slice(0, 10));
                                    }}
                                    className="btn btn-sm btn-outline-primary rounded-pill"
                                  >
                                    Flyt tid
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelAppointment(apt.id)}
                                    className="btn btn-sm btn-outline-danger rounded-pill"
                                  >
                                    Aflys
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                        {overview.journals
                          .filter((j: any) =>
                            `${j.title} ${j.content}`.toLowerCase().includes(timelineFilter.toLowerCase())
                          )
                          .map((entry: any) => {
                            const isFromTherapist =
                              String(entry.title || "")
                                .toLowerCase()
                                .includes("terapeut") ||
                              String(entry.title || "")
                                .toLowerCase()
                                .includes("opfølgning");
                            return (
                              <div
                                key={entry.id}
                                className="p-3 rounded-4 border bg-light bg-opacity-50"
                              >
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <div className="d-flex align-items-center gap-2">
                                    {isFromTherapist ? (
                                      <span className="badge bg-info-subtle text-dark border">
                                        <i className="bi bi-person-badge me-1"></i>
                                        Behandler-notat (Delt med dig)
                                      </span>
                                    ) : (
                                      <span className="badge bg-success-subtle text-success">
                                        Dagbog • Humør {entry.moodRating}/10
                                      </span>
                                    )}
                                    {entry.timestamp && (
                                      <span className="text-muted" style={{ fontSize: "0.74rem" }}>
                                        {String(entry.timestamp).replace("T", " kl. ").slice(0, 19)}
                                      </span>
                                    )}
                                  </div>
                                  {entry.gitCommitHash && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGitHistory(entry.gitCommitHash)}
                                      className="btn btn-link btn-sm p-0 text-decoration-none font-monospace text-dark fw-semibold"
                                      style={{ fontSize: "0.76rem" }}
                                    >
                                      JGit #{entry.gitCommitHash} ↗
                                    </button>
                                  )}
                                </div>
                                <h6 className="fw-bold mb-1">{entry.title}</h6>
                                <p className="small text-secondary mb-0">{entry.content}</p>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    <div className="col-lg-5">
                      <div className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <h5 className="fw-bold mb-2">Mine Tilknyttede Behandlere</h5>
                        <p className="small text-muted mb-3">
                          Du styrer selv, hvilke behandlere der har adgang til dine delte journalnotater.
                        </p>
                        <div className="d-flex flex-column gap-2">
                          {overview.handshakes.map((hs: any) => (
                            <div
                              key={hs.id}
                              className="p-3 rounded-3 bg-white border d-flex justify-content-between align-items-center gap-2"
                            >
                              <div>
                                <div className="fw-semibold text-dark">{hs.therapistName}</div>
                                <div className="small text-muted">
                                  {hs.organisationName} {hs.cvrNumber ? `(CVR: ${hs.cvrNumber})` : ""}
                                </div>
                              </div>
                              <div className="d-flex align-items-center gap-2">
                                <span
                                  className={`badge ${
                                    hs.status === "ACTIVE"
                                      ? "bg-success-subtle text-success"
                                      : hs.status === "PENDING"
                                      ? "bg-warning-subtle text-warning"
                                      : "bg-secondary-subtle text-secondary"
                                  }`}
                                >
                                  {hs.status}
                                </span>
                                {hs.status === "ACTIVE" && (
                                  <button
                                    type="button"
                                    onClick={() => handleHandshakeStatus(hs.id, "REVOKED")}
                                    className="btn btn-sm btn-outline-danger rounded-pill"
                                  >
                                    Tilbagekald
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 2: BOOK APPOINTMENT & MARKETPLACE DIRECTORY (Q7, Q8, Q9) */}
                <Tabs.Panel value="booking">
                  <div className="row g-4">
                    <div className="col-lg-7">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold mb-0">Behandlere &amp; Klinik-Ydelser (Fra Databasen)</h5>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          style={{ maxWidth: "250px" }}
                          placeholder="Søg ydelse, lokation, CVR..."
                          value={directorySearch}
                          onChange={(e) => setDirectorySearch(e.target.value)}
                        />
                      </div>

                      <div className="row g-3">
                        {overview.services
                          .filter((s: any) =>
                            `${s.name} ${s.description} ${s.location} ${s.organisation?.name || ""}`
                              .toLowerCase()
                              .includes(directorySearch.toLowerCase())
                          )
                          .map((srv: any) => (
                            <div key={srv.id} className="col-md-6">
                              <div
                                className={`card h-100 rounded-4 border ${
                                  selectedServiceId === srv.id ? "border-primary shadow-sm" : ""
                                }`}
                                style={{ cursor: "pointer" }}
                                onClick={() => setSelectedServiceId(srv.id)}
                              >
                                <div className="card-body p-3">
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <span className="badge bg-teal-subtle text-success border">
                                      {srv.durationMinutes} min • {srv.price} DKK
                                    </span>
                                    <span className="badge bg-light text-secondary">
                                      {srv.location}
                                    </span>
                                  </div>
                                  <h6 className="fw-bold mb-1">{srv.name}</h6>
                                  <p className="small text-muted mb-2">{srv.description}</p>
                                  <div className="small fw-medium text-dark">
                                    <i className="bi bi-person-badge me-1 text-primary"></i>
                                    {srv.provider?.displayName || "Klinikbehandler"}
                                    {srv.organisation
                                      ? ` • ${srv.organisation.name} (CVR: ${srv.organisation.cvrNumber})`
                                      : ""}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="col-lg-5">
                      <form onSubmit={handleBookAppointment} className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <h5 className="fw-bold mb-3">Book Aftale (409 Conflict Beskyttet)</h5>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Valgt Ydelse</label>
                          <select
                            className="form-select"
                            value={selectedServiceId}
                            onChange={(e) => setSelectedServiceId(e.target.value)}
                            required
                          >
                            {overview.services.map((srv: any) => (
                              <option key={srv.id} value={srv.id}>
                                {srv.name} ({srv.durationMinutes} min - {srv.price} DKK)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Vælg Dato</label>
                          <input
                            type="date"
                            className="form-control"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Vælg Ledigt Tidspunkt</label>
                          <div className="d-flex flex-wrap gap-2">
                            {TIME_SLOTS.map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setBookingSlot(slot)}
                                className={`btn btn-sm rounded-pill px-3 ${
                                  bookingSlot === slot ? "btn-primary" : "btn-outline-secondary bg-white"
                                }`}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mb-3">
                          <div className="pe-2">
                            <div className="small fw-semibold">Giv Handshake-samtykke ved booking</div>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              Giver behandleren adgang til dine delte journalnotater.
                            </div>
                          </div>
                          <Switch.Root
                            checked={grantHandshakeOnBook}
                            onCheckedChange={setGrantHandshakeOnBook}
                            className="base-switch-root"
                          >
                            <Switch.Thumb className="base-switch-thumb" />
                          </Switch.Root>
                        </div>

                        <button type="submit" className="btn btn-primary w-100 rounded-pill py-2 fw-semibold">
                          Bekræft Booking i Databasen
                        </button>
                      </form>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 3: CLIENT JOURNAL & JGIT AUDIT (Q6 & Q13) */}
                <Tabs.Panel value="journal">
                  <div className="row g-4">
                    <div className="col-lg-5">
                      <form onSubmit={handleCreateJournal} className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <h5 className="fw-bold mb-3">Skriv Nyt Dagbogsindlæg</h5>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Overskrift</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder="f.eks. Ugens refleksioner og søvn"
                            value={journalTitle}
                            onChange={(e) => setJournalTitle(e.target.value)}
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold d-flex justify-content-between">
                            <span>Humørvurdering (1–10)</span>
                            <span className="badge bg-primary">{journalMood} / 10</span>
                          </label>
                          <input
                            type="range"
                            className="form-range"
                            min={1}
                            max={10}
                            value={journalMood}
                            onChange={(e) => setJournalMood(Number(e.target.value))}
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Indhold</label>
                          <textarea
                            rows={4}
                            className="form-control"
                            required
                            placeholder="Beskriv dine tanker, fremskridt eller spørgsmål til næste samtale..."
                            value={journalContent}
                            onChange={(e) => setJournalContent(e.target.value)}
                          />
                        </div>

                        <div className="p-3 rounded-3 bg-white border mb-3">
                          <div className="d-flex align-items-center justify-content-between">
                            <div>
                              <div className="small fw-semibold">
                                {sharedWithTherapists
                                  ? activeHandshakes.length > 0
                                    ? `Delt med valgte Handshake-terapeuter (${selectedTherapistUuids.length}/${activeHandshakes.length})`
                                    : "Delt med aktive Handshake-terapeuter"
                                  : "Kun privat for mig"}
                              </div>
                              <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                                {sharedWithTherapists
                                  ? "Vælg specifikke terapeuter med aktivt Handshake, eller slå fra for at holde indlægget helt privat."
                                  : "Privat fra alle terapeuter — du kan altid dele indlægget individuelt senere."}
                              </div>
                            </div>
                            <Switch.Root
                              checked={sharedWithTherapists}
                              onCheckedChange={(checked) => {
                                setSharedWithTherapists(checked);
                                if (checked && selectedTherapistUuids.length === 0 && activeHandshakes.length > 0) {
                                  setSelectedTherapistUuids(
                                    activeHandshakes.map((h: any) => String(h.therapistUuid))
                                  );
                                }
                              }}
                              className="base-switch-root"
                            >
                              <Switch.Thumb className="base-switch-thumb" />
                            </Switch.Root>
                          </div>

                          {sharedWithTherapists && (
                            <div className="mt-3 pt-2 border-top">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="text-muted fw-semibold" style={{ fontSize: "0.75rem" }}>
                                  Vælg Handshake-terapeuter der må se dette indlæg:
                                </span>
                                {activeHandshakes.length > 1 && (
                                  <div className="d-flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTherapistUuids(
                                          activeHandshakes.map((h: any) => String(h.therapistUuid))
                                        );
                                        setSharedWithTherapists(true);
                                      }}
                                      className="btn btn-link btn-sm p-0 text-decoration-none"
                                      style={{ fontSize: "0.72rem" }}
                                    >
                                      Vælg alle
                                    </button>
                                    <span className="text-muted" style={{ fontSize: "0.72rem" }}>•</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTherapistUuids([]);
                                        setSharedWithTherapists(false);
                                      }}
                                      className="btn btn-link btn-sm p-0 text-decoration-none text-secondary"
                                      style={{ fontSize: "0.72rem" }}
                                    >
                                      Hold privat
                                    </button>
                                  </div>
                                )}
                              </div>

                              {activeHandshakes.length === 0 ? (
                                <div className="small text-muted fst-italic" style={{ fontSize: "0.75rem" }}>
                                  Ingen aktive Handshake-terapeuter endnu. Indlægget kan deles med specifikke terapeuter, når du opretter et Handshake.
                                </div>
                              ) : (
                                <div className="d-flex flex-column gap-1.5">
                                  {activeHandshakes.map((hs: any) => {
                                    const tUuid = String(hs.therapistUuid);
                                    const isChecked = selectedTherapistUuids.includes(tUuid);
                                    return (
                                      <label
                                        key={hs.id || tUuid}
                                        className={`d-flex align-items-center justify-content-between p-2 rounded-3 border ${
                                          isChecked ? "bg-success-subtle border-success-subtle" : "bg-light"
                                        }`}
                                        style={{ cursor: "pointer", fontSize: "0.8rem" }}
                                      >
                                        <div className="d-flex align-items-center gap-2">
                                          <input
                                            type="checkbox"
                                            className="form-check-input mt-0"
                                            checked={isChecked}
                                            onChange={() => toggleComposerTherapist(tUuid)}
                                          />
                                          <div>
                                            <div className="fw-semibold text-dark">
                                              {hs.therapistName || "Behandler"}
                                            </div>
                                            {hs.organisationName && (
                                              <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                                {hs.organisationName}
                                                {hs.cvrNumber ? ` (CVR: ${hs.cvrNumber})` : ""}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <span
                                          className={`badge ${
                                            isChecked
                                              ? "bg-success text-white"
                                              : "bg-secondary-subtle text-secondary"
                                          }`}
                                          style={{ fontSize: "0.68rem" }}
                                        >
                                          {isChecked ? "Har adgang" : "Ingen adgang"}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn btn-success w-100 rounded-pill py-2 fw-semibold">
                          Gem &amp; Versionér i JGit
                        </button>
                      </form>
                    </div>

                    <div className="col-lg-7">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">
                          Mine Journalindlæg &amp; Behandler-notater ({overview.journals.length})
                        </h5>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            onClick={() => fetchDatabaseData(false)}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                            title="Hent nyeste journalindlæg fra databasen"
                          >
                            <i className="bi bi-arrow-clockwise me-1"></i> Opdater
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenGitHistory()}
                            className="btn btn-sm btn-outline-dark rounded-pill px-3"
                          >
                            <i className="bi bi-git me-1"></i> Se JGit Tidslinje
                          </button>
                        </div>
                      </div>

                      <div className="d-flex flex-column gap-3">
                        {overview.journals.map((entry: any) => {
                          const isFromTherapist =
                            String(entry.title || "")
                              .toLowerCase()
                              .includes("terapeut") ||
                            String(entry.title || "")
                              .toLowerCase()
                              .includes("opfølgning");

                          const entrySharedUuids: string[] = Array.isArray(entry.sharedTherapistUuids)
                            ? entry.sharedTherapistUuids.map(String)
                            : [];
                          const effectiveEntryTherapistUuids: string[] = entry.sharedWithTherapists
                            ? entrySharedUuids.length > 0
                              ? entrySharedUuids
                              : activeHandshakes.map((h: any) => String(h.therapistUuid))
                            : [];
                          const sharedTherapistNames = activeHandshakes
                            .filter((h: any) =>
                              effectiveEntryTherapistUuids.includes(String(h.therapistUuid))
                            )
                            .map((h: any) => h.therapistName || "Behandler");

                          const isEditingEntrySharing = editingSharingEntryId === String(entry.id);

                          return (
                            <div key={entry.id} className="p-3 rounded-4 border bg-white shadow-xs">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <div className="d-flex flex-wrap align-items-center gap-2">
                                  {isFromTherapist ? (
                                    <span className="badge bg-info-subtle text-dark border">
                                      <i className="bi bi-person-badge me-1"></i>
                                      Fra din behandler
                                    </span>
                                  ) : (
                                    <span className="badge bg-primary-subtle text-primary">
                                      Humør: {entry.moodRating}/10
                                    </span>
                                  )}
                                  <span
                                    className={`badge ${
                                      entry.sharedWithTherapists
                                        ? "bg-success-subtle text-success"
                                        : "bg-secondary-subtle text-secondary"
                                    }`}
                                  >
                                    {entry.sharedWithTherapists
                                      ? sharedTherapistNames.length > 0
                                        ? `Delt med: ${sharedTherapistNames.join(", ")}`
                                        : "Delt med terapeut"
                                      : "Privat (Kun mig)"}
                                  </span>
                                  {entry.timestamp && (
                                    <span className="text-muted" style={{ fontSize: "0.74rem" }}>
                                      {String(entry.timestamp).replace("T", " kl. ").slice(0, 19)}
                                    </span>
                                  )}
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingSharingEntryId(
                                        isEditingEntrySharing ? null : String(entry.id)
                                      )
                                    }
                                    className="btn btn-sm btn-outline-secondary rounded-pill py-0 px-2"
                                    style={{ fontSize: "0.74rem" }}
                                    title="Administrer hvilke terapeuter der har adgang til dette indlæg"
                                  >
                                    <i className="bi bi-shield-lock me-1"></i>
                                    Deling &amp; Adgang
                                  </button>
                                  {entry.gitCommitHash && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGitHistory(entry.gitCommitHash)}
                                      className="btn btn-link btn-sm p-0 text-decoration-none font-monospace text-dark fw-semibold"
                                      style={{ fontSize: "0.78rem" }}
                                      title="Åbn dette commit i JGit-tidslinjen"
                                    >
                                      #{entry.gitCommitHash} ↗
                                    </button>
                                  )}
                                </div>
                              </div>
                              <h6 className="fw-bold mb-1">{entry.title}</h6>
                              <p className="small text-secondary mb-0">{entry.content}</p>

                              {isEditingEntrySharing && (
                                <div className="mt-3 pt-3 border-top bg-light rounded-3 p-3">
                                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                                    <div>
                                      <div className="small fw-bold text-dark">
                                        Individuel adgangsstyring for dette dagbogsindlæg
                                      </div>
                                      <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                                        Vælg specifikke Handshake-terapeuter eller gør indlægget helt privat.
                                      </div>
                                    </div>
                                    <div className="d-flex gap-2">
                                      <button
                                        type="button"
                                        disabled={savingSharingEntryId === String(entry.id)}
                                        onClick={() =>
                                          handleUpdateEntrySharing(
                                            String(entry.id),
                                            false,
                                            []
                                          )
                                        }
                                        className={`btn btn-sm rounded-pill px-3 ${
                                          !entry.sharedWithTherapists
                                            ? "btn-secondary"
                                            : "btn-outline-secondary bg-white"
                                        }`}
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        Hold privat fra alle
                                      </button>
                                      {activeHandshakes.length > 0 && (
                                        <button
                                          type="button"
                                          disabled={savingSharingEntryId === String(entry.id)}
                                          onClick={() =>
                                            handleUpdateEntrySharing(
                                              String(entry.id),
                                              true,
                                              activeHandshakes.map((h: any) =>
                                                String(h.therapistUuid)
                                              )
                                            )
                                          }
                                          className="btn btn-sm btn-outline-success rounded-pill px-3 bg-white"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          Del med alle aktive ({activeHandshakes.length})
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {activeHandshakes.length === 0 ? (
                                    <div className="small text-muted fst-italic">
                                      Du har ingen aktive Handshake-terapeuter i øjeblikket.
                                    </div>
                                  ) : (
                                    <div className="d-flex flex-column gap-1.5 mt-2">
                                      {activeHandshakes.map((hs: any) => {
                                        const tUuid = String(hs.therapistUuid);
                                        const hasAccess =
                                          Boolean(entry.sharedWithTherapists) &&
                                          effectiveEntryTherapistUuids.includes(tUuid);
                                        return (
                                          <label
                                            key={hs.id || tUuid}
                                            className="d-flex align-items-center justify-content-between p-2 rounded-3 bg-white border"
                                            style={{ cursor: "pointer", fontSize: "0.8rem" }}
                                          >
                                            <div className="d-flex align-items-center gap-2">
                                              <input
                                                type="checkbox"
                                                className="form-check-input mt-0"
                                                disabled={savingSharingEntryId === String(entry.id)}
                                                checked={hasAccess}
                                                onChange={() => {
                                                  const nextUuids = hasAccess
                                                    ? effectiveEntryTherapistUuids.filter(
                                                        (id) => id !== tUuid
                                                      )
                                                    : [...effectiveEntryTherapistUuids, tUuid];
                                                  handleUpdateEntrySharing(
                                                    String(entry.id),
                                                    nextUuids.length > 0,
                                                    nextUuids
                                                  );
                                                }}
                                              />
                                              <div>
                                                <span className="fw-semibold text-dark">
                                                  {hs.therapistName || "Behandler"}
                                                </span>
                                                {hs.organisationName && (
                                                  <span className="text-muted ms-1" style={{ fontSize: "0.72rem" }}>
                                                    ({hs.organisationName})
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <span
                                              className={`badge ${
                                                hasAccess
                                                  ? "bg-success-subtle text-success"
                                                  : "bg-secondary-subtle text-secondary"
                                              }`}
                                            >
                                              {hasAccess ? "Delt" : "Fjernet"}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 4: PCL-5 CHECK-IN & PRIVACY CONSENT (Q4 & Q11) */}
                <Tabs.Panel value="pcl5_privacy">
                  <div className="row g-4">
                    <div className="col-lg-6">
                      <form onSubmit={handleSubmitPcl5} className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <h5 className="fw-bold mb-2">PCL-5 Psykotraumatologisk Trivselstjek</h5>
                        <p className="small text-muted mb-3">
                          Vurder hvor meget du er blevet generet af følgende i den seneste uge (0 = Slet ikke, 4 = Ekstremt):
                        </p>

                        {PCL5_QUESTIONS.map((q, idx) => (
                          <div key={idx} className="mb-3 p-3 rounded-3 bg-white border">
                            <label className="form-label small fw-medium mb-2">
                              {idx + 1}. {q}
                            </label>
                            <div className="d-flex gap-2">
                              {[0, 1, 2, 3, 4].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    const next = [...pclAnswers];
                                    next[idx] = val;
                                    setPclAnswers(next);
                                  }}
                                  className={`btn btn-sm flex-grow-1 ${
                                    pclAnswers[idx] === val ? "btn-primary" : "btn-outline-secondary"
                                  }`}
                                >
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}

                        <button type="submit" className="btn btn-primary w-100 rounded-pill py-2 fw-semibold">
                          Indsend PCL-5 Vurdering til Databasen
                        </button>
                      </form>
                    </div>

                    <div className="col-lg-6">
                      <h5 className="fw-bold mb-3">Tidligere PCL-5 Resultater</h5>
                      <div className="d-flex flex-column gap-2">
                        {overview.pcl5Tests.map((t: any) => (
                          <div
                            key={t.id}
                            className="p-3 rounded-4 border bg-white d-flex justify-content-between align-items-center"
                          >
                            <div>
                              <div className="fw-bold text-dark">
                                {t.testType} — Score: {t.score} / 80
                              </div>
                              <div className="small text-muted">
                                {t.timestamp ? String(t.timestamp).replace("T", " ").slice(0, 16) : ""}
                              </div>
                            </div>
                            <span className="badge bg-warning-subtle text-dark border px-3 py-2">
                              {t.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>
              </>
            )}
          </div>
        </div>
      </Tabs.Root>

      {/* Reschedule Appointment Dialog (Base UI Dialog) */}
      <Dialog.Root open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup className="base-dialog-popup p-4" style={{ maxWidth: "460px" }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <Dialog.Title className="h5 fw-bold mb-0">Flyt Aftale</Dialog.Title>
              <Dialog.Close className="btn-close" />
            </div>
            <form onSubmit={handleRescheduleSubmit}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Ny Dato</label>
                <input
                  type="date"
                  className="form-control"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Nyt Tidspunkt</label>
                <select
                  className="form-select"
                  value={rescheduleSlot}
                  onChange={(e) => setRescheduleSlot(e.target.value)}
                >
                  {TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Dialog.Close className="btn btn-light">Annuller</Dialog.Close>
                <button type="submit" className="btn btn-primary">
                  Gem Nyt Tidspunkt
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* JGit Version History Drawer (Base UI Dialog Drawer - Q6) */}
      <Dialog.Root open={historyDrawerOpen} onOpenChange={setHistoryDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup className="base-drawer-popup p-4" style={{ maxWidth: "1040px" }}>
            <div
              className="d-flex justify-content-between align-items-center p-3 rounded-4 mb-3 border shadow-xs"
              style={{
                background:
                  "linear-gradient(135deg, #ecfdf5 0%, #eef2ff 60%, #f0fdfa 100%)",
                borderColor: "#a7f3d0",
              }}
            >
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span
                    className="badge rounded-pill px-2.5 py-1"
                    style={{ backgroundColor: "#059669", color: "#ffffff" }}
                  >
                    <i className="bi bi-git me-1"></i>
                    JGit Versionshistorik
                  </span>
                  <span className="badge bg-white text-secondary border rounded-pill">
                    {gitHistory.length} revisioner
                  </span>
                </div>
                <Dialog.Title className="h5 fw-bold text-dark mb-0">
                  Mine Journal-Revisioner (Filtreret Klient-Tidslinje)
                </Dialog.Title>
              </div>
              <Dialog.Close className="btn-close" />
            </div>

            <JGitHistoryTimeline
              commits={gitHistory}
              isTherapistView={false}
              splitView={true}
              selectedCommitHash={selectedCommit?.commitHash || null}
              onSelectCommit={(hash) => {
                const found = gitHistory.find((c: any) => c.commitHash === hash);
                if (found) setSelectedCommit(found);
              }}
              locale={locale}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
