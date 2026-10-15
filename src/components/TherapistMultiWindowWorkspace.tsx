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
  const isEn = String(locale || "").toLowerCase().startsWith("en");
  const loc = useCallback(
    (daText: string, enText: string) => (isEn ? enText : daText),
    [isEn]
  );
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

  // Active Therapist Sidebar Tab
  const [activeTherapistTab, setActiveTherapistTab] = useState<string>("calendar_overview");

  // Full-width JGit Clinical Studio State
  const [selectedStudioClientUuid, setSelectedStudioClientUuid] = useState<string>("");
  const [isStudioComposerOpen, setIsStudioComposerOpen] = useState<boolean>(false);
  const [studioComposerTab, setStudioComposerTab] = useState<"SHARED" | "CONFIDENTIAL">("SHARED");

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

  // Service Creation & Editing Form State (Bilag 5.1.3)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
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

        const rawServices = Array.isArray(data.services) ? data.services : [];
        const seenServiceKeys = new Set<string>();
        const uniqueServices: any[] = [];
        for (const srv of rawServices) {
          if (!srv) continue;
          const dedupeKey = [
            String(srv.name || "").trim().toLowerCase(),
            String(srv.provider?.id || srv.provider?.userUuid || srv.provider?.displayName || "").trim().toLowerCase(),
            String(srv.organisation?.id || srv.organisation?.cvrNumber || srv.organisation?.name || "").trim().toLowerCase(),
            String(srv.durationMinutes || ""),
            String(srv.price || ""),
            String(srv.location || "").trim().toLowerCase(),
          ].join("::");
          if (!seenServiceKeys.has(dedupeKey)) {
            seenServiceKeys.add(dedupeKey);
            uniqueServices.push(srv);
          }
        }

        setOverview({
          therapistUuid: data.therapistUuid || meData.userUuid,
          providerProfile: data.providerProfile || meData.providerProfile,
          appointments: apts,
          dailyCounts: data.dailyCounts || {},
          clients,
          services: uniqueServices,
        });

        if (clients.length > 0) {
          const defaultClientUuid = clients[0].uuid;
          setSelectedStudioClientUuid((prev) => prev || defaultClientUuid);
          loadClientGitHistory(defaultClientUuid);
        }
      }
    } catch {
      notify("danger", "Kunne ikke indlæse klinikdata fra PostgreSQL.");
    } finally {
      setLoading(false);
    }
  }, [loadClientGitHistory]);

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
          title: `${loc("Aftale", "Appointment")}: ${apt.title}`,
          subtitle: `${apt.clientName || ""} • ${String(apt.startTime).replace("T", " kl. ").slice(0, 20)}`,
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

  // Open a Client JGit History Timeline in Multi-Window Workspace (or Full-Width Studio when requested)
  const openClientGitTimelineWindow = (
    client: { uuid: string; name: string },
    focusCommitHash?: string,
    switchToStudioTab = false
  ) => {
    setSelectedStudioClientUuid(client.uuid);
    if (switchToStudioTab) {
      setActiveTherapistTab("jgit_studio");
    }
    loadClientGitHistory(client.uuid, focusCommitHash);
    if (focusCommitHash) {
      setSelectedGitCommitsByClient((prev) => ({
        ...prev,
        [client.uuid]: focusCommitHash,
      }));
    }
    const winId = `win-jgit-${client.uuid}`;
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
    const nowIso = new Date().toISOString().slice(0, 19);
    if (String(apt.startTime).slice(0, 19) < nowIso) {
      notify("danger", "Aftaler der ligger i fortiden kan ikke flyttes.");
      return;
    }

    const newDate = rescheduleDates[apt.id] || String(apt.startTime).slice(0, 10);
    const newSlot = rescheduleSlots[apt.id] || "10:00";
    const startIso = `${newDate}T${newSlot}:00`;
    if (startIso < nowIso) {
      notify("danger", "En aftale kan ikke flyttes til et tidspunkt i fortiden.");
      return;
    }

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

      if (res.status === 400) {
        notify("danger", "400 Bad Request: Aftaler i fortiden kan ikke ændres eller flyttes til fortiden.");
        return;
      }

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
      const res = await fetch(`/api/backend/appointments/${aptId}`, { method: "DELETE" });
      if (res.status === 400) {
        notify("danger", "400 Bad Request: Aftaler der ligger i fortiden kan ikke aflyses.");
        return;
      }
      closeWindow(`win-apt-${aptId}`);
      await loadDatabaseOverview();
      notify("info", "Aftalen er aflyst i databasen.");
    } catch {
      notify("danger", "Kunne ikke aflyse aftalen.");
    }
  };

  // Create or Update Service in Database (Bilag 5.1.3)
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name.trim()) return;

    const payload = {
      name: newService.name.trim(),
      description: newService.description.trim(),
      durationMinutes: newService.durationMinutes,
      price: newService.price,
      location: newService.location,
      providerProfileId: overview.providerProfile?.id || null,
      organisationId: newService.shareAcrossOrg
        ? overview.providerProfile?.organisation?.id || null
        : null,
    };

    try {
      if (editingServiceId) {
        const res = await fetch(`/api/backend/clinic/services/${editingServiceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setEditingServiceId(null);
          setNewService({
            name: "",
            description: "",
            durationMinutes: 60,
            price: 0,
            location: "",
            shareAcrossOrg: true,
          });
          await loadDatabaseOverview();
          notify("success", "Ydelsen er opdateret i PostgreSQL-servicekataloget.");
        }
      } else {
        const res = await fetch("/api/backend/clinic/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
      }
    } catch {
      notify(
        "danger",
        editingServiceId ? "Kunne ikke opdatere ydelsen." : "Kunne ikke oprette ydelsen."
      );
    }
  };

  const handleStartEditService = (srv: any) => {
    setEditingServiceId(String(srv.id));
    setNewService({
      name: srv.name || "",
      description: srv.description || "",
      durationMinutes: Number(srv.durationMinutes || 60),
      price: Number(srv.price || 0),
      location: srv.location || "",
      shareAcrossOrg: Boolean(srv.organisation),
    });
  };

  const handleCancelEditService = () => {
    setEditingServiceId(null);
    setNewService({
      name: "",
      description: "",
      durationMinutes: 60,
      price: 0,
      location: "",
      shareAcrossOrg: true,
    });
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    try {
      const res = await fetch(`/api/backend/clinic/services/${serviceId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (editingServiceId === serviceId) {
          handleCancelEditService();
        }
        await loadDatabaseOverview();
        notify("info", `Ydelsen "${serviceName}" er slettet fra databasen.`);
      } else {
        notify("danger", "Kunne ikke slette ydelsen.");
      }
    } catch {
      notify("danger", "Kunne ikke slette ydelsen.");
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

      {/* 8-COL LAYOUT: LEFT 1/8 SIDEBAR NAV (0/8 -> 1/8) + RIGHT 7/8 WORKSPACE (1/8 -> 8/8) */}
      <Tabs.Root value={activeTherapistTab} onValueChange={(val) => setActiveTherapistTab(val)}>
        <div className="portal-8col-grid">
          {/* LEFT 1/8 SIDEBAR NAVIGATION (0/8 to 1/8) */}
          <aside className="portal-sidebar-1of8" aria-label={loc("Terapeut Undersider", "Therapist Pages")}>
            <div className="sidebar-nav-card">
              <div className="sidebar-nav-title">{loc("Terapeut Undersider", "Therapist Pages")}</div>
              <Tabs.List className="d-flex flex-column gap-1">
                <Tabs.Tab value="calendar_overview" className="sidebar-tab-btn">
                  <i className="bi bi-calendar3"></i>
                  <span>{tr("portal.tabCalendar", loc("Kalender & Dagsprogram", "Calendar & Daily Schedule"))}</span>
                </Tabs.Tab>
                <Tabs.Tab value="crm_clients" className="sidebar-tab-btn">
                  <i className="bi bi-people"></i>
                  <span>
                    {tr("portal.tabClients", loc(`Klientkartotek (${overview.clients.length})`, `Client Directory (${overview.clients.length})`), {
                      count: overview.clients.length,
                    })}
                  </span>
                </Tabs.Tab>
                <Tabs.Tab value="services_cvr" className="sidebar-tab-btn">
                  <i className="bi bi-briefcase"></i>
                  <span>
                    {tr("portal.tabServices", loc(`Ydelser & CVR (${overview.services.length})`, `Services & CVR (${overview.services.length})`), {
                      count: overview.services.length,
                    })}
                  </span>
                </Tabs.Tab>
                <Tabs.Tab
                  value="jgit_studio"
                  onClick={() => {
                    const targetUuid =
                      selectedStudioClientUuid || overview.clients[0]?.uuid || "";
                    if (targetUuid) {
                      if (!selectedStudioClientUuid) {
                        setSelectedStudioClientUuid(targetUuid);
                      }
                      if (!clientGitHistories[targetUuid]) {
                        loadClientGitHistory(targetUuid);
                      }
                    }
                  }}
                  className="sidebar-tab-btn"
                >
                  <i className="bi bi-git text-success"></i>
                  <span>
                    {loc("JGit Tidslinje", "JGit Timeline")} (
                    {selectedStudioClientUuid
                      ? clientGitHistories[selectedStudioClientUuid]?.length || 0
                      : 0}
                    )
                  </span>
                </Tabs.Tab>
              </Tabs.List>

              <div className="border-top mt-2 pt-2 px-2">
                <div className="sidebar-nav-title px-1">
                  {tr("portal.activeWorkspacesTitle", loc(`Aktive Vinduer (${openWindows.length})`, `Active Windows (${openWindows.length})`), {
                    count: openWindows.length,
                  })}
                </div>
                {openWindows.length === 0 ? (
                  <div className="text-muted px-1" style={{ fontSize: "0.74rem" }}>
                    {loc("Ingen åbne vinduer endnu.", "No open windows yet.")}
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-1 mt-1">
                    {openWindows.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleMinimizeWindow(w.id)}
                        className={`sidebar-tab-btn py-1.5 px-2 ${
                          !w.minimized ? "bg-light fw-bold" : "opacity-75"
                        }`}
                        style={{ fontSize: "0.76rem" }}
                      >
                        <i
                          className={`bi ${
                            w.kind === "APPOINTMENT"
                              ? "bi-calendar-event text-warning"
                              : w.kind === "JGIT_TIMELINE"
                              ? "bi-git text-success"
                              : "bi-journal-medical text-primary"
                          }`}
                        ></i>
                        <span className="text-truncate">{w.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* RIGHT 7/8 WORKSPACE WINDOW (1/8 to 8/8) */}
          <div className="portal-workspace-7of8 d-flex flex-column gap-4">
            {/* Therapist Welcome Banner (Only shown on 'Kalender & Dagsprogram' page) */}
            {activeTherapistTab === "calendar_overview" && (
              <div className="card border-0 shadow-xs rounded-4 bg-white">
                <div className="card-body p-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div>
                    <span className="badge bg-success-subtle text-success rounded-pill px-3 py-1 mb-2">
                      <i className="bi bi-hospital me-1"></i>{" "}
                      {tr("dashboard.therapist.accessGrantedTitle", loc("Klinik & Behandler-Adgang", "Clinic & Therapist Access"))}
                    </span>
                    <h1 className="h3 fw-bold text-dark mb-1">
                      {tr(
                        "dashboard.therapist.welcome",
                        loc(
                          `Velkommen, ${overview.providerProfile?.displayName || me?.fullName || therapistName || "Terapeut"}`,
                          `Welcome, ${overview.providerProfile?.displayName || me?.fullName || therapistName || "Therapist"}`
                        ),
                        {
                          name:
                            overview.providerProfile?.displayName ||
                            me?.fullName ||
                            therapistName ||
                            loc("Terapeut", "Therapist"),
                        }
                      )}
                    </h1>
                    <p className="text-muted small mb-0">
                      {loc(
                        "Administrer aftaler, delte patientjournaler, fortrolige kliniske noter og 2D JGit-revisionshistorik.",
                        "Manage appointments, shared patient journals, confidential clinical notes, and 2D JGit revision history."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card border-0 shadow-xs rounded-4 bg-white">
              <div className="card-body p-4">
                {loading ? (
                  <div className="text-center py-5 text-muted">
                    <div className="spinner-border text-success mb-2" role="status" />
                    <div>
                      {loc(
                        "Indlæser klinikdata fra PostgreSQL...",
                        "Loading PostgreSQL clinic data..."
                      )}
                    </div>
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
                              loc(
                                "Klik på en dato for at se dagens aftaler og åbne klientjournaler i split-vinduer.",
                                "Click any date to inspect appointments and open client journals in multi-window workspaces."
                              )
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
                            {loc("I dag", "Today")}
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
                                    ? tr("portal.singleAppointmentBadge", loc("1 aftale", "1 appointment"))
                                    : tr("portal.appointmentsCountBadge", loc(`${cell.count} aftaler`, `${cell.count} appointments`), {
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
                                {loc("Valgt Dato", "Selected Date")}: {selectedDateStr}
                              </span>
                              <h5 className="fw-bold text-dark mb-0">
                                {loc("Aftaler på dagen", "Appointments on day")} ({selectedDayAppointments.length})
                              </h5>
                            </div>
                          </div>

                          {selectedDayAppointments.length === 0 ? (
                            <div className="p-4 rounded-4 bg-white border text-center text-muted small">
                              <i className="bi bi-calendar2-x fs-4 d-block mb-2"></i>
                              {loc(
                                `Ingen aftaler registreret på ${selectedDateStr}. Klik på en dato i kalenderen med en grøn aftale-badge.`,
                                `No appointments scheduled on ${selectedDateStr}. Click a date on the calendar with a green appointment badge.`
                              )}
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
                                      {loc("Klient", "Client")}: <strong>{apt.clientName}</strong> • {apt.serviceName}
                                    </div>

                                    <div className="d-flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openAppointmentWindow(apt)}
                                        className="btn btn-sm btn-outline-dark rounded-pill px-3"
                                      >
                                        <i className="bi bi-window-plus me-1"></i>{" "}
                                        {loc("Åbn Aftale i Vindue", "Open Appointment Window")}
                                      </button>
                                      {clientObj && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openClientJournalWindow(clientObj)}
                                            className="btn btn-sm btn-success rounded-pill px-3"
                                            style={{ backgroundColor: "#0f766e" }}
                                          >
                                            <i className="bi bi-journal-medical me-1"></i>{" "}
                                            {loc(`Åbn ${clientObj.name}s Journal`, `Open ${clientObj.name}'s Journal`)}
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
                                            <i className="bi bi-git me-1"></i>{" "}
                                            {loc("JGit Tidslinje", "JGit Timeline")}
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
                            {loc(
                              "Hurtig-åbn klientjournal i split-vindue:",
                              "Quick-open client journal in split window:"
                            )}
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
                    <h5 className="fw-bold mb-0">
                      {loc(
                        "Klientkartotek & Patient 360° Overblik",
                        "Client Directory & Patient 360° Overview"
                      )}
                    </h5>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ maxWidth: "280px" }}
                      placeholder={loc(
                        "Søg klientnavn, telefon, email...",
                        "Search client name, phone, email..."
                      )}
                      value={crmSearch}
                      onChange={(e) => setCrmSearch(e.target.value)}
                    />
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>{loc("Klient", "Client")}</th>
                          <th>{loc("Fødselsdato & Kontakt", "Date of Birth & Contact")}</th>
                          <th>{loc("Handshake Samtykke", "Handshake Consent")}</th>
                          <th>{loc("Seneste Humør", "Latest Mood")}</th>
                          <th>{loc("Seneste PCL-5", "Latest PCL-5")}</th>
                          <th className="text-end">{loc("Handling", "Action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.clients
                          .filter((c: any) =>
                            `${c.name} ${c.email} ${c.phone} ${c.dob || ""}`
                              .toLowerCase()
                              .includes(crmSearch.toLowerCase())
                          )
                          .map((c: any) => (
                            <tr key={c.uuid}>
                              <td className="fw-bold text-dark">{c.name}</td>
                              <td className="small text-muted py-2">
                                <div className="d-flex flex-column gap-1">
                                  <div className="d-flex align-items-center gap-1.5">
                                    <i className="bi bi-calendar3 text-secondary"></i>
                                    <span className="text-secondary fw-semibold">
                                      {loc("Fødselsdato:", "Date of Birth:")}
                                    </span>
                                    <span className="font-monospace text-dark">{c.dob || "—"}</span>
                                  </div>
                                  <div className="d-flex align-items-center gap-1.5">
                                    <i className="bi bi-envelope text-secondary"></i>
                                    <span className="text-secondary fw-semibold">Email:</span>
                                    <span className="text-dark">{c.email || "—"}</span>
                                  </div>
                                  <div className="d-flex align-items-center gap-1.5">
                                    <i className="bi bi-telephone text-secondary"></i>
                                    <span className="text-secondary fw-semibold">
                                      {loc("Telefon:", "Phone:")}
                                    </span>
                                    <span className="font-monospace text-dark">{c.phone || "—"}</span>
                                  </div>
                                </div>
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
                                      {loc("Anmod Handshake", "Request Handshake")}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openClientJournalWindow(c)}
                                    className="btn btn-sm btn-success rounded-pill px-3"
                                    style={{ backgroundColor: "#0f766e" }}
                                  >
                                    {loc("Åbn Journal i Vindue ↗", "Open Journal in Window ↗")}
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
                                    <i className="bi bi-git me-1"></i>{" "}
                                    {loc("JGit Tidslinje ↗", "JGit Timeline ↗")}
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
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="fw-bold mb-0">
                            {editingServiceId
                              ? loc("Rediger Ydelse (Bilag 5.1.3)", "Edit Service (Annex 5.1.3)")
                              : loc("Opret Ny Ydelse (Bilag 5.1.3)", "Create New Service (Annex 5.1.3)")}
                          </h5>
                          {editingServiceId && (
                            <span className="badge bg-warning text-dark">
                              {loc("Redigerer", "Editing")}
                            </span>
                          )}
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">
                            {loc("Ydelsesnavn", "Service Name")}
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder={loc("f.eks. Traumefokuseret EMDR", "e.g. Trauma-Focused EMDR")}
                            value={newService.name}
                            onChange={(e) =>
                              setNewService({ ...newService, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">
                            {loc("Beskrivelse", "Description")}
                          </label>
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
                            <label className="form-label small fw-semibold">
                              {loc("Varighed", "Duration")}
                            </label>
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
                            <label className="form-label small fw-semibold">
                              {loc("Pris (DKK)", "Price (DKK)")}
                            </label>
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
                          <label className="form-label small fw-semibold">
                            {loc("Lokation", "Location")}
                          </label>
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
                            {loc(
                              "Del som fælles klinik-skabelon på tværs af CVR",
                              "Share as common clinic template across CVR"
                            )}
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
                        <div className="d-flex gap-2">
                          <button
                            type="submit"
                            className="btn btn-success flex-grow-1 rounded-pill py-2 fw-semibold"
                          >
                            {editingServiceId
                              ? loc("Gem Ændringer i PostgreSQL", "Save Changes in PostgreSQL")
                              : loc("+ Gem Ydelse i PostgreSQL", "+ Save Service in PostgreSQL")}
                          </button>
                          {editingServiceId && (
                            <button
                              type="button"
                              onClick={handleCancelEditService}
                              className="btn btn-outline-secondary rounded-pill px-3 py-2 fw-semibold"
                            >
                              {loc("Annuller", "Cancel")}
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    <div className="col-lg-7">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold mb-0">
                          {loc("Eksisterende Ydelser i Databasen", "Existing Services in Database")}
                        </h5>
                        <span className="badge bg-light text-dark border">
                          {overview.services.length} {loc("ydelser", "services")}
                        </span>
                      </div>
                      <div className="d-flex flex-column gap-2">
                        {overview.services.length === 0 ? (
                          <div className="p-4 rounded-4 border bg-light text-center text-muted small">
                            {loc(
                              "Ingen ydelser oprettet endnu. Brug formularen til venstre for at oprette en ydelse.",
                              "No services created yet. Use the form on the left to create a service."
                            )}
                          </div>
                        ) : (
                          overview.services.map((srv: any) => (
                            <div
                              key={srv.id}
                              className={`p-3 rounded-4 border bg-white d-flex flex-wrap justify-content-between align-items-center gap-3 ${
                                editingServiceId === String(srv.id)
                                  ? "border-primary shadow-xs"
                                  : ""
                              }`}
                            >
                              <div>
                                <div className="fw-bold text-dark">{srv.name}</div>
                                {srv.description && (
                                  <div className="small text-secondary mb-1">
                                    {srv.description}
                                  </div>
                                )}
                                <div className="small text-muted">
                                  {srv.durationMinutes} min • {srv.price} DKK
                                  {srv.location ? ` • ${srv.location}` : ""}
                                </div>
                              </div>
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <span className="badge bg-light text-dark border">
                                  {srv.organisation
                                    ? `${loc("CVR-Skabelon", "CVR Template")} (${srv.organisation.cvrNumber})`
                                    : loc("Personlig Ydelse", "Personal Service")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditService(srv)}
                                  className="btn btn-sm btn-outline-primary rounded-pill px-3"
                                >
                                  {loc("Rediger", "Edit")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteService(String(srv.id), srv.name)}
                                  className="btn btn-sm btn-outline-danger rounded-pill px-3"
                                >
                                  {loc("Slet", "Delete")}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 4: FULL-WIDTH JGIT CLINICAL STUDIO (2D SWIMLANE TIMELINE + COLLAPSIBLE SHARED/CONFIDENTIAL COMPOSER) */}
                <Tabs.Panel value="jgit_studio">
                  {(() => {
                    const effectiveStudioUuid =
                      selectedStudioClientUuid || overview.clients[0]?.uuid || "";
                    const activeStudioClient =
                      overview.clients.find((c: any) => c.uuid === effectiveStudioUuid) ||
                      overview.clients[0] ||
                      null;
                    const studioCommits = effectiveStudioUuid
                      ? clientGitHistories[effectiveStudioUuid] || []
                      : [];

                    return (
                      <div className="d-flex flex-column gap-3">
                        {/* Top Header Bar matching Client Portal JGit Timeline + Simple Client Dropdown + '+ Skriv Nyt Notat' */}
                        <div
                          className="d-flex flex-wrap justify-content-between align-items-center gap-3 p-3 rounded-4 border shadow-xs"
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
                                {loc("JGit Versionshistorik", "JGit Version History")}
                              </span>
                              <span className="badge bg-white text-secondary border rounded-pill">
                                {studioCommits.length} {loc("revisioner", "revisions")}
                              </span>
                            </div>
                            <h5 className="fw-bold text-dark mb-0">
                              {loc(
                                "Klientens Journal-Revisioner (Horisontal 2D Klient & Terapeut Tidslinje)",
                                "Client Journal Revisions (Horizontal 2D Client & Therapist Timeline)"
                              )}
                            </h5>
                            <p className="text-muted small mb-0">
                              {loc(
                                "Klik på en revision på den horisontale tidslinje for at fremhæve den og åbne inspektøren direkte henover tidslinjen.",
                                "Click on any revision on the horizontal timeline to highlight it and open the inspector directly over the timeline."
                              )}
                            </p>
                          </div>

                          <div className="d-flex flex-wrap align-items-center gap-2">
                            {/* Simple Client Dropdown Selector */}
                            <div className="d-flex align-items-center gap-2 bg-white border rounded-pill px-3 py-1 shadow-xs">
                              <i className="bi bi-person-badge text-success"></i>
                              <span className="small fw-semibold text-secondary">
                                {loc("Klient:", "Client:")}
                              </span>
                              <select
                                className="form-select form-select-sm border-0 bg-transparent py-0 ps-1 pe-4 fw-bold text-dark"
                                style={{
                                  width: "auto",
                                  minWidth: "155px",
                                  boxShadow: "none",
                                  cursor: "pointer",
                                  fontSize: "0.84rem",
                                }}
                                value={effectiveStudioUuid}
                                onChange={(e) => {
                                  const nextUuid = e.target.value;
                                  setSelectedStudioClientUuid(nextUuid);
                                  loadClientGitHistory(nextUuid);
                                }}
                                aria-label={loc(
                                  "Vælg klient til JGit-tidslinje",
                                  "Select client for JGit timeline"
                                )}
                              >
                                {overview.clients.length === 0 ? (
                                  <option value="">{loc("Ingen klienter", "No clients")}</option>
                                ) : (
                                  overview.clients.map((c: any) => (
                                    <option key={c.uuid} value={c.uuid}>
                                      {c.name}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>

                            {/* Toggle Collapsible Note Composer Button */}
                            {activeStudioClient && (
                              <button
                                type="button"
                                onClick={() => setIsStudioComposerOpen((prev) => !prev)}
                                className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold shadow-xs ${
                                  isStudioComposerOpen
                                    ? "btn-dark text-white"
                                    : "btn-success text-white"
                                }`}
                                style={
                                  !isStudioComposerOpen
                                    ? { backgroundColor: "#0f766e", borderColor: "#0f766e" }
                                    : undefined
                                }
                              >
                                <i
                                  className={`bi ${
                                    isStudioComposerOpen ? "bi-chevron-up" : "bi-plus-circle"
                                  } me-1`}
                                ></i>
                                {isStudioComposerOpen
                                  ? loc("Luk Notat-Boks", "Close Note Composer")
                                  : loc("+ Skriv Nyt Notat", "+ Write New Note")}
                              </button>
                            )}

                            {/* Refresh Timeline Button */}
                            {effectiveStudioUuid && (
                              <button
                                type="button"
                                onClick={() => loadClientGitHistory(effectiveStudioUuid)}
                                className="btn btn-sm btn-outline-success rounded-pill px-3 bg-white fw-semibold"
                              >
                                <i className="bi bi-arrow-clockwise me-1"></i>{" "}
                                {loc("Opdater Tidslinje", "Refresh Timeline")}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Smooth Collapsible 'Skriv Nyt Notat' Composer (Shared Purple vs. Confidential Amber/Gold) */}
                        {isStudioComposerOpen && activeStudioClient && (
                          <div
                            className="p-3.5 rounded-4 border shadow-xs transition-all"
                            style={{
                              background:
                                studioComposerTab === "CONFIDENTIAL"
                                  ? "linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)"
                                  : "linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%)",
                              borderColor:
                                studioComposerTab === "CONFIDENTIAL" ? "#f59e0b" : "#8b5cf6",
                            }}
                          >
                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStudioComposerTab("SHARED")}
                                  className="btn btn-sm rounded-pill px-3 py-1 fw-bold border"
                                  style={{
                                    backgroundColor:
                                      studioComposerTab === "SHARED" ? "#453578" : "#ffffff",
                                    color:
                                      studioComposerTab === "SHARED" ? "#ffffff" : "#453578",
                                    borderColor: "#c4b5fd",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  <i className="bi bi-people-fill me-1.5"></i>
                                  {loc("Delt opfølgning (Lilla spor)", "Shared Follow-up (Purple Lane)")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setStudioComposerTab("CONFIDENTIAL")}
                                  className="btn btn-sm rounded-pill px-3 py-1 fw-bold border"
                                  style={{
                                    backgroundColor:
                                      studioComposerTab === "CONFIDENTIAL"
                                        ? "#6e4720"
                                        : "#ffffff",
                                    color:
                                      studioComposerTab === "CONFIDENTIAL"
                                        ? "#ffffff"
                                        : "#6e4720",
                                    borderColor: "#f59e0b",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  🔒 {loc("Fortroligt klinisk notat (Rav/Guld spor)", "Confidential Clinical Note (Amber Lane)")}
                                </button>
                              </div>

                              <div className="d-flex align-items-center gap-2">
                                {studioComposerTab === "SHARED" ? (
                                  <span
                                    className="badge rounded-pill px-2.5 py-1"
                                    style={{ backgroundColor: "#ddd6fe", color: "#453578" }}
                                  >
                                    <i className="bi bi-eye me-1"></i>{" "}
                                    {loc("Synlig for", "Visible to")} {activeStudioClient.name}
                                  </span>
                                ) : (
                                  <span
                                    className="badge rounded-pill px-2.5 py-1"
                                    style={{ backgroundColor: "#fde68a", color: "#6e4720" }}
                                  >
                                    🔒 {loc("KUN TERAPEUTER", "THERAPISTS ONLY")} (INTERNAL_MEDICAL_NOTES)
                                  </span>
                                )}
                              </div>
                            </div>

                            {studioComposerTab === "SHARED" ? (
                              <div>
                                <textarea
                                  rows={3}
                                  className="form-control bg-white border rounded-3 mb-2"
                                  style={{ fontSize: "0.86rem" }}
                                  placeholder={loc(
                                    `Skriv delt terapeutisk opfølgning til ${activeStudioClient.name} (vises på det lilla Terapeut-spor i 2D-tidslinjen)...`,
                                    `Write shared therapeutic follow-up for ${activeStudioClient.name} (shown on the purple Therapist lane in the 2D timeline)...`
                                  )}
                                  value={sharedDrafts[effectiveStudioUuid] || ""}
                                  onChange={(e) =>
                                    setSharedDrafts((prev) => ({
                                      ...prev,
                                      [effectiveStudioUuid]: e.target.value,
                                    }))
                                  }
                                />
                                <div className="d-flex justify-content-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setIsStudioComposerOpen(false)}
                                    className="btn btn-sm btn-light border rounded-pill px-3"
                                  >
                                    {loc("Annuller", "Cancel")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!(sharedDrafts[effectiveStudioUuid] || "").trim()}
                                    onClick={async () => {
                                      await handleSaveSharedEntry(
                                        effectiveStudioUuid,
                                        activeStudioClient.name || "Klient"
                                      );
                                      setIsStudioComposerOpen(false);
                                    }}
                                    className="btn btn-sm rounded-pill px-3.5 py-1.5 fw-bold text-white"
                                    style={{ backgroundColor: "#453578" }}
                                  >
                                    <i className="bi bi-git me-1"></i>{" "}
                                    {loc("Gem & Commit Delt Opfølgning", "Save & Commit Shared Follow-up")}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <textarea
                                  rows={3}
                                  className="form-control bg-white border rounded-3 mb-2"
                                  style={{ fontSize: "0.86rem" }}
                                  placeholder={loc(
                                    `Skriv fortrolig klinisk observation om ${activeStudioClient.name} (skjult for klienten — gemmes på '🔒 Fortroligt klinisk spor' i JGit)...`,
                                    `Write confidential clinical observation about ${activeStudioClient.name} (hidden from client — saved on '🔒 Confidential Clinical Lane' in JGit)...`
                                  )}
                                  value={confidentialDrafts[effectiveStudioUuid] || ""}
                                  onChange={(e) =>
                                    setConfidentialDrafts((prev) => ({
                                      ...prev,
                                      [effectiveStudioUuid]: e.target.value,
                                    }))
                                  }
                                />
                                <div className="d-flex justify-content-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setIsStudioComposerOpen(false)}
                                    className="btn btn-sm btn-light border rounded-pill px-3"
                                  >
                                    {loc("Annuller", "Cancel")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      !(confidentialDrafts[effectiveStudioUuid] || "").trim()
                                    }
                                    onClick={async () => {
                                      await handleSaveConfidentialNote(
                                        effectiveStudioUuid,
                                        activeStudioClient.name || "Klient"
                                      );
                                      setIsStudioComposerOpen(false);
                                    }}
                                    className="btn btn-sm rounded-pill px-3.5 py-1.5 fw-bold text-white"
                                    style={{ backgroundColor: "#6e4720" }}
                                  >
                                    🔒 {loc("Gem & Commit Fortroligt Notat", "Save & Commit Confidential Note")}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Full-Width 2D Swimlane JGit Timeline & Commit Inspector */}
                        <JGitHistoryTimeline
                          commits={studioCommits}
                          isTherapistView={true}
                          selectedCommitHash={
                            selectedGitCommitsByClient[effectiveStudioUuid] || null
                          }
                          onSelectCommit={(hash) =>
                            setSelectedGitCommitsByClient((prev) => ({
                              ...prev,
                              [effectiveStudioUuid]: hash,
                            }))
                          }
                          locale={locale}
                        />
                      </div>
                    );
                  })()}
                </Tabs.Panel>
              </>
            )}
              </div>
            </div>

            {/* SECTION 2: MULTI-WINDOW WORKSPACE DOCK (Hidden when on full-width JGit Studio tab) */}
            {activeTherapistTab !== "jgit_studio" && (
              <div className="card border-0 shadow-xs rounded-4 bg-white">
                <div className="card-header bg-white border-bottom px-4 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="badge rounded-pill px-3 py-1.5 text-white"
                    style={{ backgroundColor: "#0f766e" }}
                  >
                    <i className="bi bi-columns-gap me-1"></i>{" "}
                    {loc("Multi-Window Arbejdsområde (Q15)", "Multi-Window Workspace (Q15)")}
                  </span>
                  <span className="small text-muted">
                    {loc(
                      "Hav aftaler, klientjournaler og JGit-tidslinjer åbne samtidigt side om side.",
                      "Keep appointments, client journals, and JGit timelines open side by side."
                    )}
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
                        {w.title} {w.minimized ? loc("(Minimeret)", "(Minimized)") : ""}
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
                    {loc(
                      "Ingen åbne arbejdsvinduer. Klik på en aftale i kalenderen eller en klient ovenfor for at åbne Journal og JGit-tidslinje side om side.",
                      "No open workspace windows. Click an appointment on the calendar or a client above to open Journal and JGit timeline side by side."
                    )}
                  </div>
                ) : (
                  <div className="row g-4 align-items-start">
                    {(maximizedWindow ? [maximizedWindow] : visibleWindows).map((win) => {
                      const nonTimelineCount = visibleWindows.filter(
                        (w) => w.kind !== "JGIT_TIMELINE"
                      ).length;
                      const colClass = maximizedWindow
                        ? "col-12"
                        : win.kind === "JGIT_TIMELINE"
                        ? "col-12"
                        : nonTimelineCount >= 2
                        ? "col-12 col-lg-6"
                        : visibleWindows.length >= 2
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
                          <div
                            className={
                              win.kind === "JGIT_TIMELINE"
                                ? "card border-0 shadow-xs rounded-4 bg-white d-flex flex-column"
                                : "workspace-window-card d-flex flex-column"
                            }
                            data-window-kind={win.kind}
                          >
                            {/* Window Titlebar (Only for non-JGit windows; JGit Timeline uses the clean Client-Portal style banner) */}
                            {win.kind !== "JGIT_TIMELINE" && (
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
                                    title={loc("Minimer", "Minimize")}
                                  >
                                    _
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleMaximizeWindow(win.id)}
                                    className="btn btn-sm btn-dark py-0 px-2"
                                    title={loc("Maksimer / Gendan", "Maximize / Restore")}
                                  >
                                    {win.maximized ? "❐" : "□"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => closeWindow(win.id)}
                                    className="btn btn-sm btn-danger py-0 px-2"
                                    title={loc("Luk vindue", "Close window")}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* WINDOW TYPE A: APPOINTMENT DETAIL & RESCHEDULE WINDOW */}
                            {win.kind === "APPOINTMENT" && aptObj && (
                              <div className="p-3 d-flex flex-column gap-3">
                                <div className="p-3 rounded-3 bg-light border">
                                  <div className="small text-muted mb-1">
                                    {loc("Klient & Ydelse", "Client & Service")}
                                  </div>
                                  <h6 className="fw-bold mb-1">{aptObj.clientName}</h6>
                                  <div className="small text-secondary">
                                    {[
                                      aptObj.serviceName || aptObj.title,
                                      aptObj.location,
                                      aptObj.price != null && aptObj.price !== ""
                                        ? `${aptObj.price} DKK`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </div>
                                  <div className="small fw-semibold text-success mt-1">
                                    {loc("Tidspunkt", "Time")}:{" "}
                                    {String(aptObj.startTime).replace("T", " kl. ").slice(0, 20)}
                                  </div>
                                </div>

                                {clientObj && (
                                  <div className="d-flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openClientJournalWindow(clientObj)}
                                      className="btn btn-sm btn-outline-success rounded-pill flex-grow-1"
                                    >
                                      <i className="bi bi-journal-medical me-1"></i>{" "}
                                      {loc(`Åbn ${clientObj.name}s Journal`, `Open ${clientObj.name}'s Journal`)}
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
                                      <i className="bi bi-git me-1"></i>{" "}
                                      {loc("Åbn JGit Tidslinje", "Open JGit Timeline")}
                                    </button>
                                  </div>
                                )}

                                <div className="p-3 rounded-3 border bg-white">
                                  {String(aptObj.startTime).slice(0, 19) <
                                  new Date().toISOString().slice(0, 19) ? (
                                    <div className="d-flex justify-content-between align-items-center">
                                      <div>
                                        <div className="small fw-bold text-secondary">
                                          <i className="bi bi-lock-fill me-1"></i>
                                          {loc("Historisk Aftale (Låst)", "Past Appointment (Locked)")}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: "0.78rem" }}>
                                          {loc(
                                            "Aftaler der ligger i fortiden kan ikke flyttes eller aflyses.",
                                            "Appointments in the past cannot be rescheduled or cancelled."
                                          )}
                                        </div>
                                      </div>
                                      <span className="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-2">
                                        {loc("Afholdt", "Completed")}
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="small fw-bold mb-2">
                                        {loc(
                                          "Flyt Aftale (Timefold & 409 Beskyttet)",
                                          "Reschedule Appointment (Timefold & 409 Protected)"
                                        )}
                                      </div>
                                      <div className="row g-2 mb-2">
                                        <div className="col-7">
                                          <input
                                            type="date"
                                            className="form-control form-control-sm"
                                            min={new Date().toISOString().slice(0, 10)}
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
                                          {loc("Gem ny tid (PUT)", "Save new time (PUT)")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleCancelAppointment(aptObj.id)}
                                          className="btn btn-sm btn-outline-danger rounded-pill"
                                        >
                                          {loc("Aflys", "Cancel")}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* WINDOW TYPE B: CLIENT 360° & DUAL-PANE CLINICAL JOURNAL WINDOW */}
                            {win.kind === "CLIENT_JOURNAL" && win.clientUuid && (
                              <div className="p-3 d-flex flex-column gap-3">
                                {/* Patient 360 Metrics Row */}
                                <div className="d-flex justify-content-between align-items-center p-2.5 rounded-3 bg-light border small">
                                  <div>
                                    <span className="text-muted">{loc("Humør:", "Mood:")}</span>{" "}
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
                                    <i className="bi bi-git text-success me-1"></i>{" "}
                                    {loc("Åbn JGit Tidslinje ↗", "Open JGit Timeline ↗")}
                                  </button>
                                </div>

                                {/* Pane 1: Shared Patient Journal */}
                                <div className="p-3 rounded-3 border bg-white">
                                  <div className="d-flex justify-content-between align-items-center mb-2">
                                    <span className="small fw-bold text-primary">
                                      <i className="bi bi-people-fill me-1"></i>{" "}
                                      {loc("1. Delt Patientjournal", "1. Shared Patient Journal")}
                                    </span>
                                    <span className="badge bg-primary-subtle text-primary">
                                      {loc("Synlig for klient", "Visible to client")}
                                    </span>
                                  </div>
                                  <textarea
                                    rows={2}
                                    className="form-control form-control-sm mb-2"
                                    placeholder={loc(
                                      "Skriv delt opfølgningsnotat til klienten...",
                                      "Write shared follow-up note for client..."
                                    )}
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
                                    {loc("Gem i Delt Journal", "Save in Shared Journal")}
                                  </button>

                                  <div
                                    className="d-flex flex-column gap-2 overflow-auto"
                                    style={{ maxHeight: "150px" }}
                                  >
                                    {bundle.entries.map((entry: any) => {
                                      const isSyncedCommit =
                                        Boolean(entry.gitCommitHash) &&
                                        selectedGitCommitsByClient[win.clientUuid!] ===
                                          entry.gitCommitHash;
                                      return (
                                        <div
                                          key={entry.id}
                                          className={`p-2 rounded-3 bg-light border small ${
                                            isSyncedCommit ? "journal-commit-synced" : ""
                                          }`}
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
                                                title={loc(
                                                  "Fokuser dette commit i JGit Tidslinje-vinduet",
                                                  "Focus this commit in JGit Timeline window"
                                                )}
                                              >
                                                #{entry.gitCommitHash} ↗
                                              </button>
                                            )}
                                          </div>
                                          <div className="text-dark mt-0.5">{entry.content}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Pane 2: Confidential Clinical Notes (INTERNAL_MEDICAL_NOTES) */}
                                <div
                                  className="p-3 rounded-3 border"
                                  style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
                                >
                                  <div className="d-flex justify-content-between align-items-center mb-1">
                                    <span className="small fw-bold text-dark">
                                      <i className="bi bi-lock-fill text-warning me-1"></i>{" "}
                                      {loc(
                                        "2. Fortrolige Kliniske Noter",
                                        "2. Confidential Clinical Notes"
                                      )}
                                    </span>
                                    <span className="badge bg-warning text-dark">
                                      {loc("KUN TERAPEUTER", "THERAPISTS ONLY")}
                                    </span>
                                  </div>
                                  <div className="text-muted mb-2" style={{ fontSize: "0.72rem" }}>
                                    {loc(
                                      "Skjult for klienten (`INTERNAL_MEDICAL_NOTES`). Bevares i JGit ved behandlerskift.",
                                      "Hidden from client (`INTERNAL_MEDICAL_NOTES`). Preserved in JGit across therapist handovers."
                                    )}
                                  </div>
                                  <textarea
                                    rows={2}
                                    className="form-control form-control-sm mb-2 bg-white"
                                    placeholder={loc(
                                      "Skriv fortrolig klinisk observation...",
                                      "Write confidential clinical observation..."
                                    )}
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
                                    {loc(
                                      "Gem Fortroligt Klinisk Notat",
                                      "Save Confidential Clinical Note"
                                    )}
                                  </button>

                                  <div
                                    className="d-flex flex-column gap-2 overflow-auto"
                                    style={{ maxHeight: "160px" }}
                                  >
                                    {bundle.clinicalNotes.map((cn: any) => {
                                      const isSyncedConfidential =
                                        Boolean(cn.gitCommitHash) &&
                                        selectedGitCommitsByClient[win.clientUuid!] ===
                                          cn.gitCommitHash;
                                      return (
                                        <div
                                          key={cn.id}
                                          className={`p-2 rounded-3 bg-white border small ${
                                            isSyncedConfidential
                                              ? "confidential-commit-synced"
                                              : ""
                                          }`}
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
                                                title={loc(
                                                  "Fokuser dette commit i JGit Tidslinje-vinduet",
                                                  "Focus this commit in JGit Timeline window"
                                                )}
                                              >
                                                #{cn.gitCommitHash} ↗
                                              </button>
                                            )}
                                          </div>
                                          <div className="text-dark mt-0.5">
                                            {cn.confidentialMarkdown}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* WINDOW TYPE C: JGIT HISTORY TIMELINE (MATCHING CLIENT PORTAL JGIT TIMELINE STYLE) */}
                            {win.kind === "JGIT_TIMELINE" && win.clientUuid && (
                              <div className="d-flex flex-column gap-3">
                                <div
                                  className="d-flex flex-wrap justify-content-between align-items-center p-3 rounded-4 border shadow-xs gap-2"
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
                                        {loc("JGit Versionshistorik", "JGit Version History")}
                                      </span>
                                      <span className="badge bg-white text-secondary border rounded-pill">
                                        {clientCommits.length} {loc("revisioner", "revisions")}
                                      </span>
                                    </div>
                                    <h5 className="fw-bold text-dark mb-0">
                                      {loc(
                                        `${clientObj?.name || "Klient"} — Journal-Revisioner (Horisontal 2D Tidslinje)`,
                                        `${clientObj?.name || "Client"} — Journal Revisions (Horizontal 2D Timeline)`
                                      )}
                                    </h5>
                                    <p className="text-muted small mb-0">
                                      {loc(
                                        "Klik på en revision på den horisontale tidslinje for at fremhæve den og åbne inspektøren direkte henover tidslinjen.",
                                        "Click on any revision on the horizontal timeline to highlight it and open the inspector directly over the timeline."
                                      )}
                                    </p>
                                  </div>
                                  <div className="d-flex flex-wrap align-items-center gap-2">
                                    {clientObj && (
                                      <button
                                        type="button"
                                        onClick={() => openClientJournalWindow(clientObj)}
                                        className="btn btn-sm btn-outline-success rounded-pill px-3 bg-white fw-semibold"
                                      >
                                        <i className="bi bi-journal-medical me-1"></i>{" "}
                                        {loc("Åbn Journal ved siden af", "Open Journal alongside")}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => loadClientGitHistory(win.clientUuid!)}
                                      className="btn btn-sm btn-outline-success rounded-pill px-3 bg-white fw-semibold"
                                      title={loc("Opdater Tidslinje", "Refresh Timeline")}
                                    >
                                      <i className="bi bi-arrow-clockwise me-1"></i>{" "}
                                      {loc("Opdater Tidslinje", "Refresh Timeline")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => closeWindow(win.id)}
                                      className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 bg-white"
                                      title={loc("Luk tidslinjevindue", "Close timeline window")}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>

                                <JGitHistoryTimeline
                                  commits={clientCommits}
                                  isTherapistView={true}
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
            )}
          </div>
        </div>
      </Tabs.Root>
    </div>
  );
}

