"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { useLocale, useTranslations } from "next-intl";
import JGitHistoryTimeline from "@/components/JGitHistoryTimeline";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

export interface InternalWorkspaceWindow {
  id: string;
  kind: "APPOINTMENT" | "CLIENT_JOURNAL" | "JGIT_TIMELINE";
  title: string;
  subtitle: string;
  appointmentId?: string;
  clientUuid?: string;
  minimized: boolean;
  maximized: boolean;
}

export default function TherapistMultiWindowWorkspace({
  therapistName,
  organisationName,
  cvrNumber,
}: {
  therapistName?: string;
  organisationName?: string;
  cvrNumber?: string;
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
    therapistUuid: string;
    providerProfile: any;
    appointments: any[];
    dailyCounts: Record<string, number>;
    clients: any[];
    services: any[];
  }>({
    therapistUuid: "",
    providerProfile: null,
    appointments: [],
    dailyCounts: {},
    clients: [],
    services: [],
  });

  // Monthly Calendar State
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateStr, setSelectedDateStr] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Internal Multi-Window Workspaces State (Appointment + Client Journals + JGit Timelines simultaneously)
  const [openWindows, setOpenWindows] = useState<InternalWorkspaceWindow[]>([]);

  // Per-Client Bundle Cache (fetched from /api/backend/journals/client/{uuid})
  const [clientBundles, setClientBundles] = useState<
    Record<string, { entries: any[]; clinicalNotes: any[] }>
  >({});
  // Per-Client JGit History Cache for Multi-Window JGit Timeline Windows
  const [clientGitHistories, setClientGitHistories] = useState<
    Record<string, any[]>
  >({});
  const [selectedGitCommitsByClient, setSelectedGitCommitsByClient] = useState<
    Record<string, string | null>
  >({});
  const [sharedDrafts, setSharedDrafts] = useState<Record<string, string>>({});
  const [confidentialDrafts, setConfidentialDrafts] = useState<Record<string, string>>({});

  // Reschedule State inside Appointment Window
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<string, string>>({});

  // JGit History Drawer State
  const [historyClient, setHistoryClient] = useState<{ uuid: string; name: string } | null>(null);
  const [gitCommits, setGitCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);

  // Service Creation Form State (Bilag 5.1.3)
  const [newService, setNewService] = useState({
    name: "",
    description: "",
    durationMinutes: 60,
    price: 0,
    location: "",
    shareAcrossOrg: true,
  });

  // CRM Search State
  const [crmSearch, setCrmSearch] = useState("");
  const [alertBanner, setAlertBanner] = useState<{
    type: "success" | "danger" | "info";
    text: string;
  } | null>(null);

  const notify = (type: "success" | "danger" | "info", text: string) => {
    setAlertBanner({ type, text });
    setTimeout(() => setAlertBanner(null), 5000);
  };

  const loadClientBundle = useCallback(async (clientUuid: string) => {
    try {
      const res = await fetch(`/api/backend/journals/client/${clientUuid}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setClientBundles((prev) => ({
          ...prev,
          [clientUuid]: {
            entries: Array.isArray(data.entries) ? data.entries : [],
            clinicalNotes: Array.isArray(data.clinicalNotes) ? data.clinicalNotes : [],
          },
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  const loadClientGitHistory = useCallback(
    async (clientUuid: string, focusCommitHash?: string) => {
      try {
        const res = await fetch(`/api/backend/journals/history/${clientUuid}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const list = await res.json();
          const commits = Array.isArray(list) ? list : [];
          setClientGitHistories((prev) => ({ ...prev, [clientUuid]: commits }));
          setSelectedGitCommitsByClient((prev) => ({
            ...prev,
            [clientUuid]:
              focusCommitHash || prev[clientUuid] || commits[0]?.commitHash || null,
          }));
          return commits;
        }
      } catch {
        // ignore
      }
      return [];
    },
    []
  );

  const loadDatabaseOverview = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/backend/clinic/me", { cache: "no-store" });
      if (!meRes.ok) {
        setLoading(false);
        return;
      }
      const meData = await meRes.json();
      setMe(meData);

      const ovRes = await fetch(
        `/api/backend/clinic/therapist/${meData.userUuid}/overview`,
        { cache: "no-store" }
      );
      if (ovRes.ok) {
        const data = await ovRes.json();
        const apts = Array.isArray(data.appointments) ? data.appointments : [];
        const clients = Array.isArray(data.clients) ? data.clients : [];

        setOverview({
          therapistUuid: data.therapistUuid || meData.userUuid,
          providerProfile: data.providerProfile || meData.providerProfile,
          appointments: apts,
          dailyCounts: data.dailyCounts || {},
          clients,
          services: Array.isArray(data.services) ? data.services : [],
        });
      }
    } catch {
      notify("danger", "Kunne ikke indlæse klinikdata fra PostgreSQL.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseOverview();
  }, [loadDatabaseOverview]);

  // Open an Appointment in an Internal Window
  const openAppointmentWindow = (apt: any) => {
    const winId = `win-apt-${apt.id}`;
    setRescheduleDates((prev) => ({
      ...prev,
      [apt.id]: String(apt.startTime).slice(0, 10),
    }));
    setRescheduleSlots((prev) => ({
      ...prev,
      [apt.id]: String(apt.startTime).slice(11, 16),
    }));
    setOpenWindows((prev) => {
      const exists = prev.find((w) => w.id === winId);
      if (exists) {
        return prev.map((w) => (w.id === winId ? { ...w, minimized: false } : w));
      }
      return [
        ...prev,
        {
          id: winId,
          kind: "APPOINTMENT",
          title: `Aftale: ${apt.title}`,
          subtitle: `${apt.clientName || ""} • ${String(apt.startTime).replace("T", " kl. ").slice(0, 16)}`,
          appointmentId: apt.id,
          clientUuid: apt.clientUuid,
          minimized: false,
          maximized: false,
        },
      ];
    });
  };

  // Open a Client Journal in an Internal Window
  const openClientJournalWindow = (client: any) => {
    const winId = `win-journal-${client.uuid}`;
    loadClientBundle(client.uuid);
    setOpenWindows((prev) => {
      const exists = prev.find((w) => w.id === winId);
      if (exists) {
        return prev.map((w) => (w.id === winId ? { ...w, minimized: false } : w));
      }
      return [
        ...prev,
        {
          id: winId,
          kind: "CLIENT_JOURNAL",
          title: `Journal: ${client.name || ""}`,
          subtitle: `${client.dob ? `Født: ${client.dob} • ` : ""}Handshake: ${client.handshakeStatus || "ACTIVE"}`,
          clientUuid: client.uuid,
          minimized: false,
          maximized: false,
        },
      ];
    });
  };

  // Open a Client JGit History Timeline in an Internal Multi-Window Workspace
  const openClientGitTimelineWindow = (
    client: { uuid: string; name: string },
    focusCommitHash?: string
  ) => {
    const winId = `win-jgit-${client.uuid}`;
    loadClientGitHistory(client.uuid, focusCommitHash);
    if (focusCommitHash) {
      setSelectedGitCommitsByClient((prev) => ({
        ...prev,
        [client.uuid]: focusCommitHash,
      }));
    }
    setOpenWindows((prev) => {
      const exists = prev.find((w) => w.id === winId);
      if (exists) {
        return prev.map((w) => (w.id === winId ? { ...w, minimized: false } : w));
      }
      return [
        ...prev,
        {
          id: winId,
          kind: "JGIT_TIMELINE",
          title: `JGit Tidslinje: ${client.name || "Klient"}`,
          subtitle: "Dato-grupperet versionshistorik (Diff & Snapshot)",
          clientUuid: client.uuid,
          minimized: false,
          maximized: false,
        },
      ];
    });
  };

  const toggleMinimizeWindow = (id: string) => {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized, maximized: false } : w
      )
    );
  };

  const toggleMaximizeWindow = (id: string) => {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, maximized: !w.maximized, minimized: false }
          : { ...w, maximized: false }
      )
    );
  };

  const closeWindow = (id: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== id));
  };

  // Save Shared Journal Entry from Therapist Window + Live Sync JGit Timeline Window
  const handleSaveSharedEntry = async (clientUuid: string, clientName: string) => {
    const content = (sharedDrafts[clientUuid] || "").trim();
    if (!content) return;

    try {
      const res = await fetch("/api/backend/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid,
          therapistUuid: overview.therapistUuid,
          title: `Terapeutisk opfølgning (${overview.providerProfile?.displayName || me?.fullName || therapistName || ""})`,
          content,
          sharedWithTherapists: true,
        }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        setSharedDrafts((prev) => ({ ...prev, [clientUuid]: "" }));
        await Promise.all([
          loadClientBundle(clientUuid),
          loadClientGitHistory(clientUuid, saved?.gitCommitHash),
        ]);
        if (saved?.gitCommitHash) {
          setSelectedGitCommitsByClient((prev) => ({
            ...prev,
            [clientUuid]: saved.gitCommitHash,
          }));
        }
        notify("success", `Delt journalindlæg gemt i PostgreSQL & JGit for ${clientName}.`);
      }
    } catch {
      notify("danger", "Kunne ikke gemme delt journalnotat.");
    }
  };

  // Save Confidential Clinical Note (INTERNAL_MEDICAL_NOTES) + Live Sync JGit Timeline Window
  const handleSaveConfidentialNote = async (clientUuid: string, clientName: string) => {
    const noteText = (confidentialDrafts[clientUuid] || "").trim();
    if (!noteText) return;

    const effTherapistName =
      overview.providerProfile?.displayName || me?.fullName || therapistName || "";
    const effOrgName =
      overview.providerProfile?.organisation?.name ||
      organisationName ||
      "";

    try {
      const res = await fetch("/api/backend/journals/therapist-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid,
          therapistNote: noteText,
          therapistName: effTherapistName,
          organisationName: effOrgName,
        }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        setConfidentialDrafts((prev) => ({ ...prev, [clientUuid]: "" }));
        await Promise.all([
          loadClientBundle(clientUuid),
          loadClientGitHistory(clientUuid, saved?.gitCommitHash),
        ]);
        if (saved?.gitCommitHash) {
          setSelectedGitCommitsByClient((prev) => ({
            ...prev,
            [clientUuid]: saved.gitCommitHash,
          }));
        }
        notify(
          "success",
          `Fortroligt klinisk notat (INTERNAL_MEDICAL_NOTES) gemt i PostgreSQL & JGit for ${clientName}.`
        );
      }
    } catch {
      notify("danger", "Kunne ikke gemme fortroligt klinisk notat.");
    }
  };

  // Open JGit Timeline Window for Client (and optionally focus a specific commit hash)
  const handleOpenGitAudit = async (
    clientUuid: string,
    clientName: string,
    focusCommitHash?: string
  ) => {
    openClientGitTimelineWindow({ uuid: clientUuid, name: clientName }, focusCommitHash);
  };

  // Reschedule Appointment from Appointment Window
  const handleRescheduleAppointment = async (apt: any) => {
    const newDate = rescheduleDates[apt.id] || String(apt.startTime).slice(0, 10);
    const newSlot = rescheduleSlots[apt.id] || "10:00";
    const startIso = `${newDate}T${newSlot}:00`;
    const [h, m] = newSlot.split(":");
    const endHour = String(Number(h) + 1).padStart(2, "0");
    const endIso = `${newDate}T${endHour}:${m}:00`;

    try {
      const res = await fetch(`/api/backend/appointments/${apt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: apt.clientUuid,
          therapistUuid: apt.therapistUuid,
          serviceId: apt.serviceId,
          startTime: startIso,
          endTime: endIso,
          title: apt.title,
          status: "SCHEDULED",
        }),
      });

      if (res.status === 409) {
        notify("danger", "409 Conflict: Tidsrummet overlapper med en anden aftale i databasen.");
        return;
      }

      await loadDatabaseOverview();
      notify("success", `Aftalen "${apt.title}" er flyttet til ${newDate} kl. ${newSlot}.`);
    } catch {
      notify("danger", "Kunne ikke flytte aftalen.");
    }
  };

  const handleCancelAppointment = async (aptId: string) => {
    try {
      await fetch(`/api/backend/appointments/${aptId}`, { method: "DELETE" });
      closeWindow(`win-apt-${aptId}`);
      await loadDatabaseOverview();
      notify("info", "Aftalen er aflyst i databasen.");
    } catch {
      notify("danger", "Kunne ikke aflyse aftalen.");
    }
  };

  // Create Service in Database (Bilag 5.1.3)
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name.trim()) return;

    try {
      const res = await fetch("/api/backend/clinic/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newService.name.trim(),
          description: newService.description.trim(),
          durationMinutes: newService.durationMinutes,
          price: newService.price,
          location: newService.location,
          providerProfileId: overview.providerProfile?.id || null,
          organisationId: newService.shareAcrossOrg
            ? overview.providerProfile?.organisation?.id || null
            : null,
        }),
      });
      if (res.ok) {
        setNewService({
          name: "",
          description: "",
          durationMinutes: 60,
          price: 0,
          location: "",
          shareAcrossOrg: true,
        });
        await loadDatabaseOverview();
        notify("success", "Ny ydelse oprettet i PostgreSQL-servicekataloget.");
      }
    } catch {
      notify("danger", "Kunne ikke oprette ydelsen.");
    }
  };

  // Send Handshake Request to Client
  const handleRequestHandshake = async (clientUuid: string, clientName: string) => {
    try {
      await fetch("/api/backend/clinic/handshakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid,
          therapistUuid: overview.therapistUuid,
          status: "PENDING",
        }),
      });
      await loadDatabaseOverview();
      notify("success", `Handshake-anmodning sendt til ${clientName}.`);
    } catch {
      notify("danger", "Kunne ikke sende Handshake-anmodning.");
    }
  };

  // Build Monthly Calendar Grid Days
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const calendarCells: Array<{ dateStr: string; dayNum: number; count: number } | null> = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarCells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = overview.dailyCounts[dateStr] || 0;
    calendarCells.push({ dateStr, dayNum: day, count });
  }

  const selectedDayAppointments = overview.appointments.filter(
    (a: any) =>
      a.status !== "CANCELLED" &&
      String(a.startTime).slice(0, 10) === selectedDateStr
  );

  const visibleWindows = openWindows.filter((w) => !w.minimized);
  const maximizedWindow = visibleWindows.find((w) => w.maximized);

  return (
    <div className="d-flex flex-column gap-4">
      {alertBanner && (
        <div
          className={`alert alert-${alertBanner.type} rounded-4 shadow-xs d-flex justify-content-between align-items-center mb-0`}
        >
          <span>{alertBanner.text}</span>
          <button type="button" className="btn-close" onClick={() => setAlertBanner(null)} />
        </div>
      )}

      {/* SECTION 1: THERAPIST START PAGE — MONTHLY CALENDAR + SELECTED DAY APPOINTMENTS */}
      <Tabs.Root defaultValue="calendar_overview">
        <div className="card border-0 shadow-xs rounded-4 bg-white">
          <div className="card-header bg-white border-bottom px-4 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <Tabs.List className="d-flex flex-wrap gap-2">
              <Tabs.Tab value="calendar_overview" className="base-tab-btn">
                <i className="bi bi-calendar3"></i>{" "}
                {tr("portal.tabCalendar", "Monthly Calendar & Daily Schedule")}
              </Tabs.Tab>
              <Tabs.Tab value="crm_clients" className="base-tab-btn">
                <i className="bi bi-people"></i>{" "}
                {tr("portal.tabClients", `Client Roster (${overview.clients.length})`, {
                  count: overview.clients.length,
                })}
              </Tabs.Tab>
              <Tabs.Tab value="services_cvr" className="base-tab-btn">
                <i className="bi bi-briefcase"></i>{" "}
                {tr("portal.tabServices", `Service Catalog (${overview.services.length})`, {
                  count: overview.services.length,
                })}
              </Tabs.Tab>
            </Tabs.List>

            <div className="small text-muted">
              <i className="bi bi-window-split text-success me-1"></i>
              {tr("portal.activeWorkspacesTitle", `Active Workspaces (${openWindows.length})`, {
                count: openWindows.length,
              })}
            </div>
          </div>

          <div className="card-body p-4">
            {loading ? (
              <div className="text-center py-5 text-muted">
                <div className="spinner-border text-success mb-2" role="status" />
                <div>Loading PostgreSQL clinic data...</div>
              </div>
            ) : (
              <>
                {/* TAB 1: MONTHLY CALENDAR GRID + SELECTED DATE SCHEDULE */}
                <Tabs.Panel value="calendar_overview">
                  <div className="row g-4">
                    {/* Left 7 Cols: Bootstrap 5 Monthly Calendar Grid showing days & appointment counts */}
                    <div className="col-xl-7">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                          <h5 className="fw-bold text-dark mb-0 text-capitalize">
                            {new Intl.DateTimeFormat(locale, {
                              month: "long",
                              year: "numeric",
                            }).format(currentMonthDate)}
                          </h5>
                          <p className="text-muted small mb-0">
                            {tr(
                              "portal.therapistCalendarTitle",
                              "Click any date to inspect appointments and open client journals in multi-window workspaces."
                            )}
                          </p>
                        </div>
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() =>
                              setCurrentMonthDate(new Date(year, month - 1, 1))
                            }
                          >
                            <i className="bi bi-chevron-left"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => {
                              const now = new Date();
                              setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
                              setSelectedDateStr(now.toISOString().slice(0, 10));
                            }}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() =>
                              setCurrentMonthDate(new Date(year, month + 1, 1))
                            }
                          >
                            <i className="bi bi-chevron-right"></i>
                          </button>
                        </div>
                      </div>

                      <div className="calendar-grid">
                        {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                          const refMonday = new Date(2024, 0, 1 + dayOffset);
                          const wdLabel = new Intl.DateTimeFormat(locale, {
                            weekday: "short",
                          }).format(refMonday);
                          return (
                            <div key={dayOffset} className="calendar-weekday text-capitalize">
                              {wdLabel}
                            </div>
                          );
                        })}

                        {calendarCells.map((cell, idx) =>
                          cell === null ? (
                            <div
                              key={`empty-${idx}`}
                              className="rounded-3 bg-light bg-opacity-50"
                              style={{ minHeight: "86px" }}
                            />
                          ) : (
                            <button
                              key={cell.dateStr}
                              type="button"
                              onClick={() => setSelectedDateStr(cell.dateStr)}
                              className={`calendar-day-cell ${
                                selectedDateStr === cell.dateStr ? "selected" : ""
                              } ${cell.count > 0 ? "has-appointments" : ""}`}
                            >
                              <div className="d-flex justify-content-between align-items-center w-100">
                                <span className="fw-bold text-dark" style={{ fontSize: "0.9rem" }}>
                                  {cell.dayNum}
                                </span>
                                {cell.dateStr === new Date().toISOString().slice(0, 10) && (
                                  <span className="badge bg-dark rounded-pill" style={{ fontSize: "0.62rem" }}>
                                    •
                                  </span>
                                )}
                              </div>

                              {cell.count > 0 ? (
                                <span
                                  className="badge rounded-pill w-100 text-truncate py-1"
                                  style={{
                                    backgroundColor: "#0f766e",
                                    color: "#ffffff",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  <i className="bi bi-calendar-check me-1"></i>
                                  {cell.count === 1
                                    ? tr("portal.singleAppointmentBadge", "1 appointment")
                                    : tr("portal.appointmentsCountBadge", `${cell.count} appointments`, {
                                        count: cell.count,
                                      })}
                                </span>
                              ) : (
                                <span className="text-muted" style={{ fontSize: "0.7rem" }}>
                                  —
                                </span>
                              )}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Right 5 Cols: Selected Day's Appointments & Quick Multi-Window Launchers */}
                    <div className="col-xl-5">
                      <div className="p-4 rounded-4 border bg-light bg-opacity-50 h-100 d-flex flex-column justify-content-between">
                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <div>
                              <span className="badge bg-success-subtle text-success mb-1">
                                Valgt Dato: {selectedDateStr}
                              </span>
                              <h5 className="fw-bold text-dark mb-0">
                                Aftaler på dagen ({selectedDayAppointments.length})
                              </h5>
                            </div>
                          </div>

                          {selectedDayAppointments.length === 0 ? (
                            <div className="p-4 rounded-4 bg-white border text-center text-muted small">
                              <i className="bi bi-calendar2-x fs-4 d-block mb-2"></i>
                              Ingen aftaler registreret på {selectedDateStr}. Klik på en dato i kalenderen med en grøn aftale-badge.
                            </div>
                          ) : (
                            <div className="d-flex flex-column gap-3">
                              {selectedDayAppointments.map((apt: any) => {
                                const clientObj = overview.clients.find(
                                  (c: any) => c.uuid === apt.clientUuid
                                );
                                return (
                                  <div
                                    key={apt.id}
                                    className="p-3 rounded-4 bg-white border shadow-xs"
                                  >
                                    <div className="d-flex justify-content-between align-items-start mb-1">
                                      <span className="badge bg-teal-subtle text-success border">
                                        kl. {String(apt.startTime).slice(11, 16)} –{" "}
                                        {String(apt.endTime).slice(11, 16)}
                                      </span>
                                      <span className="badge bg-light text-dark border">
                                        {apt.status}
                                      </span>
                                    </div>
                                    <h6 className="fw-bold text-dark mb-1">{apt.title}</h6>
                                    <div className="small text-muted mb-3">
                                      Klient: <strong>{apt.clientName}</strong> • {apt.serviceName}
                                    </div>

                                    <div className="d-flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openAppointmentWindow(apt)}
                                        className="btn btn-sm btn-outline-dark rounded-pill px-3"
                                      >
                                        <i className="bi bi-window-plus me-1"></i> Åbn Aftale i Vindue
                                      </button>
                                      {clientObj && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openClientJournalWindow(clientObj)}
                                            className="btn btn-sm btn-success rounded-pill px-3"
                                            style={{ backgroundColor: "#0f766e" }}
                                          >
                                            <i className="bi bi-journal-medical me-1"></i> Åbn {clientObj.name}s Journal
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openClientGitTimelineWindow({
                                                uuid: clientObj.uuid,
                                                name: clientObj.name,
                                              })
                                            }
                                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 bg-white"
                                          >
                                            <i className="bi bi-git me-1"></i> JGit Tidslinje
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Quick Launch Bar for Opening Multiple Client Journals Simultaneously */}
                        <div className="pt-3 mt-3 border-top">
                          <div className="small fw-semibold text-secondary mb-2">
                            Hurtig-åbn klientjournal i split-vindue:
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            {overview.clients.map((c: any) => (
                              <button
                                key={c.uuid}
                                type="button"
                                onClick={() => openClientJournalWindow(c)}
                                className="btn btn-sm btn-white border rounded-pill px-3 shadow-xs bg-white"
                              >
                                <i className="bi bi-person-lines-fill text-success me-1"></i>
                                + {c.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 2: CRM CLIENT ROSTER & HANDSHAKES (Q3, Q4, Q10) */}
                <Tabs.Panel value="crm_clients">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <h5 className="fw-bold mb-0">Klientkartotek &amp; Patient 360° Overblik</h5>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ maxWidth: "280px" }}
                      placeholder="Søg klientnavn, telefon, email..."
                      value={crmSearch}
                      onChange={(e) => setCrmSearch(e.target.value)}
                    />
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Klient</th>
                          <th>Fødselsdato &amp; Kontakt</th>
                          <th>Handshake Samtykke</th>
                          <th>Seneste Humør</th>
                          <th>Seneste PCL-5</th>
                          <th className="text-end">Handling</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.clients
                          .filter((c: any) =>
                            `${c.name} ${c.email} ${c.phone}`
                              .toLowerCase()
                              .includes(crmSearch.toLowerCase())
                          )
                          .map((c: any) => (
                            <tr key={c.uuid}>
                              <td className="fw-bold text-dark">{c.name}</td>
                              <td className="small text-muted">
                                {[c.dob, c.phone, c.email].filter(Boolean).join(" • ") || "—"}
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    c.handshakeStatus === "ACTIVE"
                                      ? "bg-success-subtle text-success"
                                      : c.handshakeStatus === "PENDING"
                                      ? "bg-warning-subtle text-warning"
                                      : "bg-secondary-subtle text-secondary"
                                  }`}
                                >
                                  {c.handshakeStatus}
                                </span>
                              </td>
                              <td>
                                {c.latestMood != null ? (
                                  <span className="badge bg-info-subtle text-dark">
                                    {c.latestMood} / 10
                                  </span>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>
                              <td>
                                {c.latestPcl5Score != null ? (
                                  <span className="badge bg-warning-subtle text-dark">
                                    {c.latestPcl5Score}
                                    {c.latestPcl5Severity ? ` (${c.latestPcl5Severity})` : ""}
                                  </span>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>
                              <td className="text-end">
                                <div className="d-inline-flex gap-2">
                                  {c.handshakeStatus !== "ACTIVE" && (
                                    <button
                                      type="button"
                                      onClick={() => handleRequestHandshake(c.uuid, c.name)}
                                      className="btn btn-sm btn-outline-primary rounded-pill"
                                    >
                                      Anmod Handshake
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openClientJournalWindow(c)}
                                    className="btn btn-sm btn-success rounded-pill px-3"
                                    style={{ backgroundColor: "#0f766e" }}
                                  >
                                    Åbn Journal i Vindue ↗
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openClientGitTimelineWindow({
                                        uuid: c.uuid,
                                        name: c.name,
                                      })
                                    }
                                    className="btn btn-sm btn-outline-dark rounded-pill px-3"
                                  >
                                    <i className="bi bi-git me-1"></i> JGit Tidslinje ↗
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Tabs.Panel>

                {/* TAB 3: HYBRID SERVICE CATALOG & CVR (Q8 / Bilag 5.1.3) */}
                <Tabs.Panel value="services_cvr">
                  <div className="row g-4">
                    <div className="col-lg-5">
                      <form
                        onSubmit={handleCreateService}
                        className="p-4 rounded-4 border bg-light bg-opacity-50"
                      >
                        <h5 className="fw-bold mb-3">Opret Ny Ydelse (Bilag 5.1.3)</h5>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Ydelsesnavn</label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder="f.eks. Traumefokuseret EMDR"
                            value={newService.name}
                            onChange={(e) =>
                              setNewService({ ...newService, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Beskrivelse</label>
                          <textarea
                            rows={2}
                            className="form-control"
                            value={newService.description}
                            onChange={(e) =>
                              setNewService({ ...newService, description: e.target.value })
                            }
                          />
                        </div>
                        <div className="row g-2 mb-3">
                          <div className="col-6">
                            <label className="form-label small fw-semibold">Varighed</label>
                            <select
                              className="form-select"
                              value={newService.durationMinutes}
                              onChange={(e) =>
                                setNewService({
                                  ...newService,
                                  durationMinutes: Number(e.target.value),
                                })
                              }
                            >
                              <option value={30}>30 min</option>
                              <option value={45}>45 min</option>
                              <option value={60}>60 min</option>
                              <option value={90}>90 min</option>
                            </select>
                          </div>
                          <div className="col-6">
                            <label className="form-label small fw-semibold">Pris (DKK)</label>
                            <input
                              type="number"
                              className="form-control"
                              value={newService.price}
                              onChange={(e) =>
                                setNewService({
                                  ...newService,
                                  price: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">Lokation</label>
                          <input
                            type="text"
                            className="form-control"
                            value={newService.location}
                            onChange={(e) =>
                              setNewService({ ...newService, location: e.target.value })
                            }
                          />
                        </div>
                        <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mb-3">
                          <span className="small fw-semibold">
                            Del som fælles klinik-skabelon på tværs af CVR
                          </span>
                          <Switch.Root
                            checked={newService.shareAcrossOrg}
                            onCheckedChange={(v) =>
                              setNewService({ ...newService, shareAcrossOrg: v })
                            }
                            className="base-switch-root"
                          >
                            <Switch.Thumb className="base-switch-thumb" />
                          </Switch.Root>
                        </div>
                        <button type="submit" className="btn btn-success w-100 rounded-pill py-2 fw-semibold">
                          + Gem Ydelse i PostgreSQL
                        </button>
                      </form>
                    </div>

                    <div className="col-lg-7">
                      <h5 className="fw-bold mb-3">Eksisterende Ydelser i Databasen</h5>
                      <div className="d-flex flex-column gap-2">
                        {overview.services.map((srv: any) => (
                          <div
                            key={srv.id}
                            className="p-3 rounded-4 border bg-white d-flex justify-content-between align-items-center"
                          >
                            <div>
                              <div className="fw-bold text-dark">{srv.name}</div>
                              <div className="small text-muted">
                                {srv.durationMinutes} min • {srv.price} DKK • {srv.location}
                              </div>
                            </div>
                            <span className="badge bg-light text-dark border">
                              {srv.organisation
                                ? `CVR-Skabelon (${srv.organisation.cvrNumber})`
                                : "Personlig Ydelse"}
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

      {/* SECTION 2: MULTI-WINDOW WORKSPACE DOCK (SIMULTANEOUS APPOINTMENT + CLIENT JOURNALS + JGIT TIMELINE) */}
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-header bg-white border-bottom px-4 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="d-flex align-items-center gap-2">
            <span
              className="badge rounded-pill px-3 py-1.5 text-white"
              style={{ backgroundColor: "#0f766e" }}
            >
              <i className="bi bi-columns-gap me-1"></i> Multi-Window Arbejdsområde (Q15)
            </span>
            <span className="small text-muted">
              Hav aftaler, klientjournaler og JGit-tidslinjer åbne samtidigt side om side.
            </span>
          </div>

          {/* Window Taskbar Chips */}
          <div className="d-flex flex-wrap gap-2">
            {openWindows.map((w) => (
              <div
                key={w.id}
                className={`btn-group btn-group-sm rounded-pill overflow-hidden border ${
                  w.minimized ? "opacity-75" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleMinimizeWindow(w.id)}
                  className="btn btn-light fw-medium px-3"
                >
                  <i
                    className={`bi ${
                      w.kind === "APPOINTMENT"
                        ? "bi-calendar-event text-warning"
                        : w.kind === "JGIT_TIMELINE"
                        ? "bi-git text-dark"
                        : "bi-journal-medical text-success"
                    } me-1`}
                  ></i>
                  {w.title} {w.minimized ? "(Minimeret)" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => closeWindow(w.id)}
                  className="btn btn-light text-danger px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card-body p-4">
          {visibleWindows.length === 0 ? (
            <div className="text-center py-4 text-muted small">
              Ingen åbne arbejdsvinduer. Klik på en aftale i kalenderen eller en klient ovenfor for at åbne Journal og JGit-tidslinje side om side.
            </div>
          ) : (
            <div className="row g-4">
              {(maximizedWindow ? [maximizedWindow] : visibleWindows).map((win) => {
                const colClass = maximizedWindow
                  ? "col-12"
                  : visibleWindows.length >= 3
                  ? "col-12 col-xl-4"
                  : visibleWindows.length === 2
                  ? "col-12 col-lg-6"
                  : "col-12";

                const aptObj =
                  win.kind === "APPOINTMENT"
                    ? overview.appointments.find((a: any) => a.id === win.appointmentId)
                    : null;
                const clientObj = overview.clients.find(
                  (c: any) => c.uuid === win.clientUuid
                );
                const bundle = win.clientUuid
                  ? clientBundles[win.clientUuid] || { entries: [], clinicalNotes: [] }
                  : { entries: [], clinicalNotes: [] };
                const clientCommits = win.clientUuid
                  ? clientGitHistories[win.clientUuid] || []
                  : [];

                return (
                  <div key={win.id} className={colClass}>
                    <div className="workspace-window-card h-100 d-flex flex-column">
                      {/* Window Titlebar */}
                      <div className="workspace-window-header d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-bold small">{win.title}</div>
                          <div className="text-white-50" style={{ fontSize: "0.72rem" }}>
                            {win.subtitle}
                          </div>
                        </div>
                        <div className="d-flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleMinimizeWindow(win.id)}
                            className="btn btn-sm btn-dark py-0 px-2"
                            title="Minimer"
                          >
                            _
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMaximizeWindow(win.id)}
                            className="btn btn-sm btn-dark py-0 px-2"
                            title="Maksimer / Gendan"
                          >
                            {win.maximized ? "❐" : "□"}
                          </button>
                          <button
                            type="button"
                            onClick={() => closeWindow(win.id)}
                            className="btn btn-sm btn-danger py-0 px-2"
                            title="Luk vindue"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* WINDOW TYPE A: APPOINTMENT DETAIL & RESCHEDULE WINDOW */}
                      {win.kind === "APPOINTMENT" && aptObj && (
                        <div className="p-3 d-flex flex-column gap-3">
                          <div className="p-3 rounded-3 bg-light border">
                            <div className="small text-muted mb-1">Klient &amp; Ydelse</div>
                            <h6 className="fw-bold mb-1">{aptObj.clientName}</h6>
                            <div className="small text-secondary">
                              {aptObj.serviceName} • {aptObj.location} • {aptObj.price} DKK
                            </div>
                            <div className="small fw-semibold text-success mt-1">
                              Tidspunkt: {String(aptObj.startTime).replace("T", " kl. ").slice(0, 16)}
                            </div>
                          </div>

                          {clientObj && (
                            <div className="d-flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openClientJournalWindow(clientObj)}
                                className="btn btn-sm btn-outline-success rounded-pill flex-grow-1"
                              >
                                <i className="bi bi-journal-medical me-1"></i> Åbn {clientObj.name}s Journal
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openClientGitTimelineWindow({
                                    uuid: clientObj.uuid,
                                    name: clientObj.name,
                                  })
                                }
                                className="btn btn-sm btn-outline-dark rounded-pill flex-grow-1"
                              >
                                <i className="bi bi-git me-1"></i> Åbn JGit Tidslinje
                              </button>
                            </div>
                          )}

                          <div className="p-3 rounded-3 border bg-white">
                            <div className="small fw-bold mb-2">
                              Flyt Aftale (409 Conflict Beskyttet)
                            </div>
                            <div className="row g-2 mb-2">
                              <div className="col-7">
                                <input
                                  type="date"
                                  className="form-control form-control-sm"
                                  value={
                                    rescheduleDates[aptObj.id] ||
                                    String(aptObj.startTime).slice(0, 10)
                                  }
                                  onChange={(e) =>
                                    setRescheduleDates((prev) => ({
                                      ...prev,
                                      [aptObj.id]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="col-5">
                                <select
                                  className="form-select form-select-sm"
                                  value={rescheduleSlots[aptObj.id] || "10:00"}
                                  onChange={(e) =>
                                    setRescheduleSlots((prev) => ({
                                      ...prev,
                                      [aptObj.id]: e.target.value,
                                    }))
                                  }
                                >
                                  {TIME_SLOTS.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="d-flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleRescheduleAppointment(aptObj)}
                                className="btn btn-sm btn-primary flex-grow-1 rounded-pill"
                              >
                                Gem ny tid (PUT)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelAppointment(aptObj.id)}
                                className="btn btn-sm btn-outline-danger rounded-pill"
                              >
                                Aflys
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* WINDOW TYPE B: CLIENT 360° & DUAL-PANE CLINICAL JOURNAL WINDOW */}
                      {win.kind === "CLIENT_JOURNAL" && win.clientUuid && (
                        <div className="p-3 d-flex flex-column gap-3">
                          {/* Patient 360 Metrics Row */}
                          <div className="d-flex justify-content-between align-items-center p-2.5 rounded-3 bg-light border small">
                            <div>
                              <span className="text-muted">Humør:</span>{" "}
                              <strong>
                                {clientObj?.latestMood != null
                                  ? `${clientObj.latestMood}/10`
                                  : "—"}
                              </strong>{" "}
                              • <span className="text-muted">PCL-5:</span>{" "}
                              <strong>
                                {clientObj?.latestPcl5Score != null
                                  ? `${clientObj.latestPcl5Score}${
                                      clientObj.latestPcl5Severity
                                        ? ` (${clientObj.latestPcl5Severity})`
                                        : ""
                                    }`
                                  : "—"}
                              </strong>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenGitAudit(
                                  win.clientUuid!,
                                  clientObj?.name || "Klient"
                                )
                              }
                              className="btn btn-sm btn-outline-dark rounded-pill py-0.5 px-2.5"
                              style={{ fontSize: "0.75rem" }}
                            >
                              <i className="bi bi-git text-success me-1"></i> Åbn JGit Tidslinje ↗
                            </button>
                          </div>

                          {/* Pane 1: Shared Patient Journal */}
                          <div className="p-3 rounded-3 border bg-white">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-primary">
                                <i className="bi bi-people-fill me-1"></i> 1. Delt Patientjournal
                              </span>
                              <span className="badge bg-primary-subtle text-primary">
                                Synlig for klient
                              </span>
                            </div>
                            <textarea
                              rows={2}
                              className="form-control form-control-sm mb-2"
                              placeholder="Skriv delt opfølgningsnotat til klienten..."
                              value={sharedDrafts[win.clientUuid] || ""}
                              onChange={(e) =>
                                setSharedDrafts((prev) => ({
                                  ...prev,
                                  [win.clientUuid!]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveSharedEntry(
                                  win.clientUuid!,
                                  clientObj?.name || "Klient"
                                )
                              }
                              className="btn btn-sm btn-primary rounded-pill px-3 mb-2"
                            >
                              Gem i Delt Journal
                            </button>

                            <div
                              className="d-flex flex-column gap-2 overflow-auto"
                              style={{ maxHeight: "150px" }}
                            >
                              {bundle.entries.map((entry: any) => (
                                <div
                                  key={entry.id}
                                  className="p-2 rounded-3 bg-light border small"
                                >
                                  <div className="d-flex justify-content-between align-items-center text-muted" style={{ fontSize: "0.7rem" }}>
                                    <span>{entry.title}</span>
                                    {entry.gitCommitHash && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenGitAudit(
                                            win.clientUuid!,
                                            clientObj?.name || "Klient",
                                            entry.gitCommitHash
                                          )
                                        }
                                        className="btn btn-link btn-sm p-0 text-decoration-none font-monospace text-dark fw-semibold"
                                        style={{ fontSize: "0.7rem" }}
                                        title="Fokuser dette commit i JGit Tidslinje-vinduet"
                                      >
                                        #{entry.gitCommitHash} ↗
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-dark mt-0.5">{entry.content}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Pane 2: Confidential Clinical Notes (INTERNAL_MEDICAL_NOTES) */}
                          <div
                            className="p-3 rounded-3 border"
                            style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
                          >
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="small fw-bold text-dark">
                                <i className="bi bi-lock-fill text-warning me-1"></i> 2. Fortrolige Kliniske Noter
                              </span>
                              <span className="badge bg-warning text-dark">
                                KUN TERAPEUTER
                              </span>
                            </div>
                            <div className="text-muted mb-2" style={{ fontSize: "0.72rem" }}>
                              Skjult for klienten (`INTERNAL_MEDICAL_NOTES`). Bevares i JGit ved behandlerskift.
                            </div>
                            <textarea
                              rows={2}
                              className="form-control form-control-sm mb-2 bg-white"
                              placeholder="Skriv fortrolig klinisk observation..."
                              value={confidentialDrafts[win.clientUuid] || ""}
                              onChange={(e) =>
                                setConfidentialDrafts((prev) => ({
                                  ...prev,
                                  [win.clientUuid!]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveConfidentialNote(
                                  win.clientUuid!,
                                  clientObj?.name || "Klient"
                                )
                              }
                              className="btn btn-sm btn-dark rounded-pill px-3 mb-2"
                            >
                              Gem Fortroligt Klinisk Notat
                            </button>

                            <div
                              className="d-flex flex-column gap-2 overflow-auto"
                              style={{ maxHeight: "160px" }}
                            >
                              {bundle.clinicalNotes.map((cn: any) => (
                                <div
                                  key={cn.id}
                                  className="p-2 rounded-3 bg-white border small"
                                >
                                  <div
                                    className="d-flex justify-content-between align-items-center fw-semibold text-secondary"
                                    style={{ fontSize: "0.7rem" }}
                                  >
                                    <span>
                                      {cn.authorTherapistName} • {cn.organisationName}
                                    </span>
                                    {cn.gitCommitHash && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenGitAudit(
                                            win.clientUuid!,
                                            clientObj?.name || "Klient",
                                            cn.gitCommitHash
                                          )
                                        }
                                        className="btn btn-link btn-sm p-0 text-decoration-none font-monospace text-dark fw-semibold"
                                        style={{ fontSize: "0.7rem" }}
                                        title="Fokuser dette commit i JGit Tidslinje-vinduet"
                                      >
                                        #{cn.gitCommitHash} ↗
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-dark mt-0.5">
                                    {cn.confidentialMarkdown}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* WINDOW TYPE C: JGIT HISTORY TIMELINE MULTI-WINDOW WORKSPACE */}
                      {win.kind === "JGIT_TIMELINE" && win.clientUuid && (
                        <div className="p-3 d-flex flex-column gap-3">
                          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-2.5 rounded-3 bg-light border small">
                            <div>
                              <span className="fw-semibold text-dark">
                                <i className="bi bi-git me-1"></i>
                                {clientObj?.name || "Klient"} — JGit Revisionshistorik
                              </span>
                              <span className="text-muted ms-2">
                                ({clientCommits.length} commits)
                              </span>
                            </div>
                            <div className="d-flex gap-2">
                              {clientObj && (
                                <button
                                  type="button"
                                  onClick={() => openClientJournalWindow(clientObj)}
                                  className="btn btn-sm btn-outline-success rounded-pill py-0.5 px-2.5"
                                  style={{ fontSize: "0.74rem" }}
                                >
                                  <i className="bi bi-journal-medical me-1"></i> Åbn Journal ved siden af
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => loadClientGitHistory(win.clientUuid!)}
                                className="btn btn-sm btn-outline-secondary rounded-pill py-0.5 px-2.5 bg-white"
                                style={{ fontSize: "0.74rem" }}
                                title="Genindlæs JGit-historik"
                              >
                                <i className="bi bi-arrow-clockwise"></i>
                              </button>
                            </div>
                          </div>

                          <JGitHistoryTimeline
                            commits={clientCommits}
                            isTherapistView={true}
                            splitView={win.maximized}
                            selectedCommitHash={
                              selectedGitCommitsByClient[win.clientUuid] || null
                            }
                            onSelectCommit={(hash) =>
                              setSelectedGitCommitsByClient((prev) => ({
                                ...prev,
                                [win.clientUuid!]: hash,
                              }))
                            }
                            locale={locale}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* JGit Full Therapist Audit Log Drawer (Base UI Dialog) */}
      <Dialog.Root
        open={!!historyClient}
        onOpenChange={(open) => !open && setHistoryClient(null)}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup className="base-drawer-popup p-4">
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <div>
                <span className="badge bg-success-subtle text-success mb-1">
                  JGit Audit Trail (Terapeut-visning)
                </span>
                <Dialog.Title className="h5 fw-bold mb-0">
                  Versionshistorik for {historyClient?.name} (Inkl. INTERNAL_MEDICAL_NOTES)
                </Dialog.Title>
              </div>
              <Dialog.Close className="btn-close" />
            </div>

            <JGitHistoryTimeline
              commits={gitCommits}
              isTherapistView={true}
              splitView={true}
              selectedCommitHash={selectedCommit?.commitHash || null}
              locale={locale}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
