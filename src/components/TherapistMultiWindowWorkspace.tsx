"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import JGitHistoryTimeline, { cleanAppointmentReference } from "@/components/JGitHistoryTimeline";
import WeeklyScheduleManager, {
  WeeklyScheduleConfig,
  parseWeeklySchedule,
  isDayClosed,
  getScheduleForDate,
  checkCollisionWithBreak,
  formatMinutes,
  roundTo5Min,
} from "@/components/WeeklyScheduleManager";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

export interface LinkedReferenceSelection {
  type: "COMMIT" | "APPOINTMENT";
  commitHash?: string;
  commitTitle?: string;
  commitAuthor?: string;
  commitDate?: string;
  appointmentId?: string | number;
  appointmentTitle?: string;
  appointmentDate?: string;
}

function CommitLinkerSelector({
  clientUuid,
  clientName,
  appointments,
  commits,
  selectedRef,
  onSelectRef,
  loc,
}: {
  clientUuid: string;
  clientName: string;
  appointments: any[];
  commits: any[];
  selectedRef: LinkedReferenceSelection | null;
  onSelectRef: (ref: LinkedReferenceSelection | null) => void;
  loc: (da: string, en: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"APPOINTMENTS" | "COMMITS">("APPOINTMENTS");

  const clientApts = useMemo(() => {
    return (appointments || []).filter(
      (a: any) =>
        String(a.clientUuid || a.client?.uuid || "") === String(clientUuid)
    );
  }, [appointments, clientUuid]);

  const clientCommits = useMemo(() => {
    return Array.isArray(commits) ? commits : [];
  }, [commits]);

  return (
    <div className="mb-2">
      {/* If a reference is selected, display selected reference card */}
      {selectedRef ? (
        <div
          className="d-flex align-items-center justify-content-between p-2 px-3 rounded-3 border"
          style={{
            backgroundColor:
              selectedRef.type === "COMMIT" ? "#f5f3ff" : "#f0fdf4",
            borderColor:
              selectedRef.type === "COMMIT" ? "#c4b5fd" : "#86efac",
          }}
        >
          <div className="d-flex align-items-center gap-2 overflow-hidden">
            <span
              className="badge rounded-pill px-2 py-1"
              style={{
                backgroundColor:
                  selectedRef.type === "COMMIT" ? "#ede9fe" : "#dcfce7",
                color:
                  selectedRef.type === "COMMIT" ? "#5b21b6" : "#166534",
                fontSize: "0.72rem",
              }}
            >
              <i
                className={`bi ${
                  selectedRef.type === "COMMIT"
                    ? "bi-journal-check"
                    : "bi-calendar-event"
                } me-1`}
              ></i>
              {selectedRef.type === "COMMIT"
                ? loc("Tilknyttet journalindlæg", "Linked Journal Entry")
                : loc("Tilknyttet Aftale", "Linked Appointment")}
            </span>

            <span className="fw-bold text-dark text-truncate" style={{ fontSize: "0.82rem" }}>
              {selectedRef.type === "COMMIT"
                ? (selectedRef.commitTitle || loc("Journalindlæg", "Journal Entry"))
                : `${selectedRef.appointmentTitle || "Aftale"} (${selectedRef.appointmentDate || ""})`}
            </span>
          </div>

          <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              className="btn btn-sm btn-link p-0 text-muted text-decoration-none fw-medium"
              style={{ fontSize: "0.75rem" }}
            >
              {loc("Skift", "Change")}
            </button>
            <button
              type="button"
              onClick={() => onSelectRef(null)}
              className="btn btn-sm btn-outline-danger border-0 rounded-circle p-0 d-flex align-items-center justify-content-center"
              style={{ width: "22px", height: "22px", fontSize: "0.75rem" }}
              title={loc("Fjern tilknytning", "Remove link")}
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        /* If no reference selected, show compact trigger button */
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 d-inline-flex align-items-center gap-1.5 bg-white border-dashed shadow-xs"
            style={{ fontSize: "0.76rem" }}
          >
            <i className="bi bi-link-45deg text-primary"></i>
            <span>
              {loc(
                "+ Tilknyt til eksisterende aftale eller journalindlæg...",
                "+ Link to existing appointment or journal entry..."
              )}
            </span>
          </button>
        </div>
      )}

      {/* Expanded Selection Modal/Drawer */}
      {isOpen && (
        <div
          className="mt-2 p-3 rounded-4 border bg-white shadow-sm"
          style={{ borderColor: "#cbd5e1" }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2.5">
            {/* Pill Tabs: Seneste aftaler / Tidligere journalindlæg */}
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                onClick={() => setTab("APPOINTMENTS")}
                className={`btn rounded-start-pill px-3 py-1 ${
                  tab === "APPOINTMENTS"
                    ? "btn-dark fw-semibold"
                    : "btn-outline-secondary bg-white"
                }`}
                style={{ fontSize: "0.76rem" }}
              >
                <i className="bi bi-calendar-event me-1"></i>
                {loc("📅 Seneste aftaler", "📅 Recent Appointments")} ({clientApts.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("COMMITS")}
                className={`btn rounded-end-pill px-3 py-1 ${
                  tab === "COMMITS"
                    ? "btn-dark fw-semibold"
                    : "btn-outline-secondary bg-white"
                }`}
                style={{ fontSize: "0.76rem" }}
              >
                <i className="bi bi-clock-history me-1"></i>
                {loc("Tidligere journalindlæg", "Previous Journal Entries")} ({clientCommits.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn btn-sm btn-light rounded-pill px-2 py-0.5 text-muted"
              style={{ fontSize: "0.75rem" }}
            >
              ✕ {loc("Luk", "Close")}
            </button>
          </div>

          {/* Tab 1: Appointments List */}
          {tab === "APPOINTMENTS" && (
            <div
              className="d-flex flex-column gap-2 overflow-auto pe-1"
              style={{ maxHeight: "200px" }}
            >
              {clientApts.length === 0 ? (
                <div className="text-center py-3 text-muted small">
                  {loc(
                    `Ingen registrerede aftaler fundet for ${clientName}.`,
                    `No registered appointments found for ${clientName}.`
                  )}
                </div>
              ) : (
                clientApts.map((apt: any) => {
                  const dateStr = apt.startTime
                    ? String(apt.startTime).replace("T", " kl. ").slice(0, 19)
                    : "";
                  const isSelected =
                    selectedRef?.type === "APPOINTMENT" &&
                    String(selectedRef.appointmentId) === String(apt.id);

                  return (
                    <div
                      key={apt.id}
                      onClick={() => {
                        onSelectRef({
                          type: "APPOINTMENT",
                          appointmentId: apt.id,
                          appointmentTitle: apt.title || "Konsultation",
                          appointmentDate: dateStr,
                        });
                        setIsOpen(false);
                      }}
                      className="p-2 rounded-3 border d-flex justify-content-between align-items-center gap-2 cursor-pointer transition-all"
                      style={{
                        backgroundColor: isSelected ? "#ecfdf5" : "#ffffff",
                        borderColor: isSelected ? "#059669" : "#e2e8f0",
                        cursor: "pointer",
                      }}
                    >
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0"
                          style={{
                            width: "28px",
                            height: "28px",
                            backgroundColor: "#0f766e",
                            fontSize: "0.75rem",
                          }}
                        >
                          <i className="bi bi-calendar-check"></i>
                        </div>
                        <div className="overflow-hidden">
                          <div
                            className="fw-bold text-dark text-truncate"
                            style={{ fontSize: "0.82rem" }}
                          >
                            {apt.title || loc("Konsultationssamtale", "Consultation")}
                          </div>
                          <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                            {dateStr}
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                        {apt.status && (
                          <span
                            className="badge rounded-pill bg-light text-secondary border"
                            style={{ fontSize: "0.68rem" }}
                          >
                            {apt.status}
                          </span>
                        )}
                        <span
                          className={`badge rounded-pill ${
                            isSelected ? "bg-success text-white" : "bg-light text-dark border"
                          }`}
                          style={{ fontSize: "0.7rem" }}
                        >
                          {isSelected ? "✓ Valgt" : loc("Vælg", "Select")}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: Commits List */}
          {tab === "COMMITS" && (
            <div
              className="d-flex flex-column gap-2 overflow-auto pe-1"
              style={{ maxHeight: "200px" }}
            >
              {clientCommits.length === 0 ? (
                <div className="text-center py-3 text-muted small">
                  {loc(
                    `Ingen JGit-commits fundet for ${clientName}.`,
                    `No JGit commits found for ${clientName}.`
                  )}
                </div>
              ) : (
                clientCommits.map((c: any) => {
                  const hash = c.commitHash || (c.fullHash ? c.fullHash.slice(0, 8) : "commit");
                  const isSelected =
                    selectedRef?.type === "COMMIT" && selectedRef.commitHash === hash;

                  let borderCol = "#e2e8f0";
                  let bgCol = "#ffffff";
                  let badgeText = loc("Klient-indlæg", "Client Entry");
                  let badgeBg = "#dcfce7";
                  let badgeFg = "#166534";

                  const msgLower = (c.message || "").toLowerCase();
                  if (msgLower.includes("clinical note") || msgLower.includes("fortrolig")) {
                    badgeText = loc("Fortroligt notat", "Confidential");
                    badgeBg = "#fef3c7";
                    badgeFg = "#78350f";
                  } else if (msgLower.includes("terapeut") || msgLower.includes("opfølgning")) {
                    badgeText = loc("Terapeutisk opfølgning", "Therapist Follow-up");
                    badgeBg = "#ede9fe";
                    badgeFg = "#4c1d95";
                  }

                  if (isSelected) {
                    bgCol = "#f5f3ff";
                    borderCol = "#7c3aed";
                  }

                  return (
                    <div
                      key={hash}
                      onClick={() => {
                        onSelectRef({
                          type: "COMMIT",
                          commitHash: hash,
                          commitTitle: c.message || "Journal revision",
                          commitAuthor: c.author || "Ukendt",
                          commitDate: c.timestamp ? String(c.timestamp).slice(0, 10) : "",
                        });
                        setIsOpen(false);
                      }}
                      className="p-2 rounded-3 border d-flex justify-content-between align-items-center gap-2 cursor-pointer transition-all"
                      style={{
                        backgroundColor: bgCol,
                        borderColor: borderCol,
                        cursor: "pointer",
                      }}
                    >
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0 fw-bold"
                          style={{
                            width: "28px",
                            height: "28px",
                            backgroundColor: badgeFg,
                            fontSize: "0.72rem",
                          }}
                        >
                          {(c.author || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <div className="d-flex align-items-center gap-1.5 flex-wrap mb-0.5">
                            <span
                              className="badge rounded-pill"
                              style={{
                                backgroundColor: badgeBg,
                                color: badgeFg,
                                fontSize: "0.68rem",
                              }}
                            >
                              {badgeText}
                            </span>
                            {c.timestamp && (
                              <span className="text-muted fw-medium" style={{ fontSize: "0.72rem" }}>
                                {String(c.timestamp).replace("T", " kl. ").slice(0, 16)}
                              </span>
                            )}
                          </div>
                          <div
                            className="text-dark fw-semibold text-truncate"
                            style={{ fontSize: "0.82rem", maxWidth: "340px" }}
                          >
                            {c.message || loc("Journalindlæg", "Journal entry")}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`badge rounded-pill flex-shrink-0 ${
                          isSelected ? "bg-primary text-white" : "bg-light text-dark border"
                        }`}
                        style={{ fontSize: "0.7rem" }}
                      >
                        {isSelected ? "✓ Valgt" : loc("Vælg", "Select")}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TherapistMultiWindowWorkspace({
  therapistName,
  organisationName,
  cvrNumber,
  initialTab = "calendar_overview",
}: {
  therapistName?: string;
  organisationName?: string;
  cvrNumber?: string;
  initialTab?: string;
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
      if (!t.has(key as any)) return fallback;
      const res = t(key as any, { count: 0, ...values });
      if (!res || typeof res !== "string" || res === key || res.includes(key)) {
        return fallback;
      }
      return res;
    } catch {
      return fallback;
    }
  };
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [overview, setOverview] = useState<{
    therapistUuid: string;
    providerProfile: any;
    clientProfile?: any;
    canCreateServices?: boolean;
    missingProfileFields?: string[];
    appointments: any[];
    dailyCounts: Record<string, number>;
    clients: any[];
    services: any[];
  }>({
    therapistUuid: "",
    providerProfile: null,
    clientProfile: null,
    canCreateServices: false,
    missingProfileFields: [],
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
  const [activeTherapistTab, setActiveTherapistTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTherapistTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab) {
        setActiveTherapistTab(urlTab);
      }
    }
  }, []);

  // Clinic CVR & Working Hours Form State (Separated from personal client master data)
  const [clinicForm, setClinicForm] = useState({
    cvrNumber: "",
    organisationName: "",
    address: "",
    postalCode: "",
    phoneNumber: "",
    email: "",
    videoMeetingUrl: "",
    displayName: "",
    workingHoursJson: "",
    biography: "",
  });
  const [savingClinic, setSavingClinic] = useState(false);
  const [clinicSavedMsg, setClinicSavedMsg] = useState<string | null>(null);
  const [clinicErrorMsg, setClinicErrorMsg] = useState<string | null>(null);
  const [isClinicFormDirty, setIsClinicFormDirty] = useState(false);

  // Memoized therapist weekly schedule configuration
  const therapistWeeklySchedule = useMemo(() => {
    return parseWeeklySchedule(overview.providerProfile?.workingHoursJson || clinicForm.workingHoursJson);
  }, [overview.providerProfile?.workingHoursJson, clinicForm.workingHoursJson]);

  // Full-width JGit Clinical Studio State
  const [selectedStudioClientUuid, setSelectedStudioClientUuid] = useState<string>("");
  const [isStudioComposerOpen, setIsStudioComposerOpen] = useState<boolean>(false);
  const [studioComposerTab, setStudioComposerTab] = useState<"SHARED" | "CONFIDENTIAL">("SHARED");

  // Modal Dialog State for Appointment Details & Rescheduling
  const [selectedAppointmentModal, setSelectedAppointmentModal] = useState<any | null>(null);

  // JGit Studio Filter & Swimlanes Pop-up Modal State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeStudioFiltersCount, setActiveStudioFiltersCount] = useState(0);

  // Per-Client Bundle Cache (fetched from /api/backend/journals/client/{uuid})
  const [clientBundles, setClientBundles] = useState<
    Record<
      string,
      {
        entries: any[];
        clinicalNotes: any[];
        historyFilterActive?: boolean;
        historyStartDate?: string;
        historyEndDate?: string;
      }
    >
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
  const [selectedRefByKey, setSelectedRefByKey] = useState<
    Record<string, LinkedReferenceSelection | null>
  >({});

  // Reschedule State inside Appointment Window
  const [rescheduleDates, setRescheduleDates] = useState<Record<string, string>>({});
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<string, string>>({});

  // JGit History Drawer State
  const [historyClient, setHistoryClient] = useState<{ uuid: string; name: string } | null>(null);
  const [gitCommits, setGitCommits] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);

  // Registered company/clinic address for in-person service defaults
  const companyAddress = useMemo(() => {
    const rawAddr =
      overview.providerProfile?.organisation?.address?.trim() ||
      clinicForm.address?.trim() ||
      overview.clientProfile?.homeAddress?.trim() ||
      "";
    const rawPostal =
      overview.providerProfile?.organisation?.postalCode?.trim() ||
      clinicForm.postalCode?.trim() ||
      overview.clientProfile?.postalCode?.trim() ||
      "";
    if (rawAddr && rawPostal && !rawAddr.includes(rawPostal)) {
      return `${rawAddr}, ${rawPostal}`;
    }
    return rawAddr;
  }, [
    overview.providerProfile?.organisation?.address,
    overview.providerProfile?.organisation?.postalCode,
    clinicForm.address,
    clinicForm.postalCode,
    overview.clientProfile?.homeAddress,
    overview.clientProfile?.postalCode,
  ]);

  // Permanent online video meeting URL from Clinic Settings
  const clinicVideoLink = useMemo(() => {
    return (
      overview.providerProfile?.videoMeetingUrl?.trim() ||
      clinicForm.videoMeetingUrl?.trim() ||
      overview.providerProfile?.organisation?.videoMeetingUrl?.trim() ||
      ""
    );
  }, [
    overview.providerProfile?.videoMeetingUrl,
    overview.providerProfile?.organisation?.videoMeetingUrl,
    clinicForm.videoMeetingUrl,
  ]);

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

  // Automatically pre-populate default company address when creating a new service
  useEffect(() => {
    if (!editingServiceId && !newService.location && companyAddress) {
      setNewService((prev) => (!prev.location ? { ...prev, location: companyAddress } : prev));
    }
  }, [companyAddress, editingServiceId]);

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
      const tUuidParam = overview.therapistUuid ? `?therapistUuid=${overview.therapistUuid}` : "";
      const res = await fetch(`/api/backend/journals/client/${clientUuid}${tUuidParam}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setClientBundles((prev) => ({
          ...prev,
          [clientUuid]: {
            entries: Array.isArray(data.entries) ? data.entries : [],
            clinicalNotes: Array.isArray(data.clinicalNotes) ? data.clinicalNotes : [],
            historyFilterActive: Boolean(data.historyFilterActive),
            historyStartDate: data.historyStartDate || null,
            historyEndDate: data.historyEndDate || null,
          },
        }));
      }
    } catch {
      // ignore
    }
  }, [overview.therapistUuid]);

  const loadClientGitHistory = useCallback(
    async (
      clientUuid: string,
      focusCommitHash?: string,
      focusAppointmentRef?: string | { id?: string | number; title?: string }
    ) => {
      try {
        const tUuidParam = overview.therapistUuid ? `?therapistUuid=${overview.therapistUuid}` : "";
        const res = await fetch(`/api/backend/journals/history/${clientUuid}${tUuidParam}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const list = await res.json();
          let commits = Array.isArray(list) ? list : [];

          let resolvedHash: string | null = null;

          if (focusCommitHash) {
            const foundDirect = commits.find(
              (c: any) =>
                c.commitHash === focusCommitHash ||
                c.fullHash === focusCommitHash ||
                (c.commitHash && focusCommitHash.startsWith(c.commitHash)) ||
                (c.fullHash && c.fullHash.startsWith(focusCommitHash))
            );
            if (foundDirect) {
              resolvedHash = foundDirect.commitHash;
            }
          }

          const aptId =
            typeof focusAppointmentRef === "object"
              ? focusAppointmentRef.id
              : focusAppointmentRef;
          const aptTitle =
            typeof focusAppointmentRef === "object"
              ? focusAppointmentRef.title
              : undefined;

          const aptIdClean = aptId ? String(aptId).replace(/^#/, "").trim() : "";
          const aptTitleClean = aptTitle ? aptTitle.toLowerCase().trim() : "";

          if (!resolvedHash && (aptIdClean || aptTitleClean)) {
            if (aptIdClean) {
              const matchById = commits.find((c: any) => {
                const msg = String(c.message || "");
                const snap = String(c.snapshot || "");
                return (
                  msg.includes(`Refs-Appointment: #${aptIdClean}`) ||
                  msg.includes(`Refs-Appointment: ${aptIdClean}`) ||
                  snap.includes(`Refs-Appointment: #${aptIdClean}`) ||
                  snap.includes(`Refs-Appointment: ${aptIdClean}`) ||
                  snap.includes(aptIdClean) ||
                  msg.includes(aptIdClean)
                );
              });
              if (matchById) {
                resolvedHash = matchById.commitHash;
              }
            }

            if (!resolvedHash && aptTitleClean) {
              const matchByTitle = commits.find((c: any) => {
                const msg = String(c.message || "").toLowerCase();
                const snap = String(c.snapshot || "").toLowerCase();
                return msg.includes(aptTitleClean) || snap.includes(aptTitleClean);
              });
              if (matchByTitle) {
                resolvedHash = matchByTitle.commitHash;
              }
            }

            // If still not found and an appointment ID exists, query appointment git history endpoint
            if (!resolvedHash && aptIdClean) {
              try {
                const aptGitRes = await fetch(
                  `/api/backend/appointments/${aptIdClean}/git-history`,
                  { cache: "no-store" }
                );
                if (aptGitRes.ok) {
                  const aptCommits = await aptGitRes.json();
                  if (Array.isArray(aptCommits) && aptCommits.length > 0) {
                    resolvedHash = aptCommits[0].commitHash || aptCommits[0].fullHash;
                    const refreshRes = await fetch(
                      `/api/backend/journals/history/${clientUuid}`,
                      { cache: "no-store" }
                    );
                    if (refreshRes.ok) {
                      const refreshedList = await refreshRes.json();
                      if (Array.isArray(refreshedList) && refreshedList.length > 0) {
                        commits = refreshedList;
                      }
                    }
                  }
                }
              } catch {
                // ignore
              }
            }
          }

          setClientGitHistories((prev) => ({ ...prev, [clientUuid]: commits }));

          if (resolvedHash) {
            setSelectedGitCommitsByClient((prev) => ({
              ...prev,
              [clientUuid]: resolvedHash,
            }));
          } else if (focusCommitHash) {
            setSelectedGitCommitsByClient((prev) => ({
              ...prev,
              [clientUuid]: focusCommitHash,
            }));
          } else {
            setSelectedGitCommitsByClient((prev) => ({
              ...prev,
              [clientUuid]: prev[clientUuid] || commits[0]?.commitHash || null,
            }));
          }
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
          clientProfile: data.clientProfile || meData.clientProfile,
          canCreateServices: data.canCreateServices ?? meData.canCreateServices,
          missingProfileFields: data.missingProfileFields || meData.missingProfileFields || [],
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
      notify("danger", "Kunne ikke indlæse klinikdata.");
    } finally {
      setLoading(false);
    }
  }, [loadClientGitHistory]);

  useEffect(() => {
    loadDatabaseOverview();
  }, [loadDatabaseOverview]);

  // Synchronize clinic master data from overview / me
  useEffect(() => {
    // If the user is currently editing the form, do not allow background polls to wipe their changes
    if (isClinicFormDirty) return;

    const pp = overview.providerProfile || me?.providerProfile || {};
    const org = pp.organisation || {};
    const cp = overview.clientProfile || me?.clientProfile || {};

    setClinicForm((prev) => ({
      cvrNumber: org.cvrNumber || cvrNumber || prev.cvrNumber || "",
      organisationName: org.name || organisationName || prev.organisationName || "",
      address: org.address || cp.homeAddress || prev.address || "",
      postalCode: org.postalCode || cp.postalCode || prev.postalCode || "",
      phoneNumber: org.phoneNumber || cp.phoneNumber || prev.phoneNumber || "",
      email: org.email || me?.email || prev.email || "",
      videoMeetingUrl: pp.videoMeetingUrl || org.videoMeetingUrl || prev.videoMeetingUrl || "",
      displayName: pp.displayName || therapistName || me?.fullName || prev.displayName || "",
      workingHoursJson: pp.workingHoursJson || prev.workingHoursJson || "",
      biography: pp.biography || prev.biography || "",
    }));
  }, [overview.providerProfile, overview.clientProfile, me, therapistName, organisationName, cvrNumber, isClinicFormDirty]);

  const handleSaveClinicSettings = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    setSavingClinic(true);
    setClinicErrorMsg(null);
    setClinicSavedMsg(null);

    const cvr = (clinicForm.cvrNumber || "").trim();
    const orgName = (clinicForm.organisationName || "").trim();
    if (!cvr) {
      setClinicErrorMsg(loc("CVR-nummer skal udfyldes (8 cifre).", "CVR number is required (8 digits)."));
      setSavingClinic(false);
      return;
    }
    if (!orgName) {
      setClinicErrorMsg(loc("Virksomhedsnavn skal udfyldes.", "Company / Clinic name is required."));
      setSavingClinic(false);
      return;
    }

    try {
      const userUuidToSend =
        (overview.therapistUuid && overview.therapistUuid.trim().length > 20)
          ? overview.therapistUuid.trim()
          : (me?.userUuid && String(me.userUuid).trim().length > 20)
          ? String(me.userUuid).trim()
          : undefined;

      const payload: Record<string, any> = {
        displayName: (clinicForm.displayName || "").trim(),
        cvrNumber: cvr,
        organisationName: orgName,
        address: (clinicForm.address || "").trim(),
        postalCode: (clinicForm.postalCode || "").trim(),
        phoneNumber: (clinicForm.phoneNumber || "").trim(),
        email: (clinicForm.email || "").trim(),
        videoMeetingUrl: (clinicForm.videoMeetingUrl || "").trim(),
        biography: (clinicForm.biography || "").trim(),
        workingHoursJson: clinicForm.workingHoursJson || "",
      };

      if (userUuidToSend) {
        payload.userUuid = userUuidToSend;
      }

      const res = await fetch("/api/backend/clinic/therapist-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || loc("Kunne ikke gemme klinikoplysninger", "Failed to save clinic information"));
      }

      const savedProfile = await res.json();

      // Immediately reflect saved profile into local overview state so badges turn green instantly
      setOverview((prev) => ({
        ...prev,
        providerProfile: savedProfile,
        canCreateServices: Boolean(
          cvr && orgName && clinicForm.workingHoursJson && clinicForm.address && clinicForm.postalCode && clinicForm.phoneNumber
        ),
      }));

      setIsClinicFormDirty(false);
      setClinicSavedMsg(loc("Virksomheds- og klinikstamdata er opdateret.", "Company and clinic master data updated."));
      notify("success", loc("Klinikindstillinger er gemt i databasen.", "Clinic settings saved in the database."));

      await loadDatabaseOverview();
      setTimeout(() => setClinicSavedMsg(null), 5000);
    } catch (err: any) {
      setClinicErrorMsg(err?.message || loc("Fejl ved lagring af virksomhedsstamdata", "Error saving company data"));
      notify("danger", loc("Kunne ikke gemme klinikindstillinger.", "Could not save clinic settings."));
    } finally {
      setSavingClinic(false);
    }
  };

  // Open Appointment in Details & Reschedule Modal
  const openAppointmentModal = (apt: any) => {
    setRescheduleDates((prev) => ({
      ...prev,
      [apt.id]: String(apt.startTime).slice(0, 10),
    }));
    setRescheduleSlots((prev) => ({
      ...prev,
      [apt.id]: String(apt.startTime).slice(11, 16),
    }));
    setSelectedAppointmentModal(apt);
  };

  // Open Client Journal & 2D Revision History in JGit Timeline
  const openClientJournal = (
    client: { uuid: string; name?: string },
    focusCommitHash?: string,
    focusAppointmentRef?: string | { id?: string | number; title?: string }
  ) => {
    setSelectedStudioClientUuid(client.uuid);
    if (focusCommitHash) {
      setSelectedGitCommitsByClient((prev) => ({
        ...prev,
        [client.uuid]: focusCommitHash,
      }));
    }
    loadClientGitHistory(client.uuid, focusCommitHash, focusAppointmentRef);
    setActiveTherapistTab("jgit_studio");
  };

  // Save Shared Journal Entry from Therapist Window + Live Sync JGit Timeline Window
  const handleSaveSharedEntry = async (
    clientUuid: string,
    clientName: string,
    refKey?: string
  ) => {
    const rawContent = (sharedDrafts[clientUuid] || "").trim();
    if (!rawContent) return;

    const linkedRef =
      (refKey ? selectedRefByKey[refKey] : null) ||
      selectedRefByKey[`studio_shared_${clientUuid}`] ||
      selectedRefByKey[`multi_shared_${clientUuid}`] ||
      null;

    let trailer = "";
    if (linkedRef) {
      if (linkedRef.type === "COMMIT" && linkedRef.commitHash) {
        trailer = `\n\nRefs-Commit: #${linkedRef.commitHash}`;
      } else if (linkedRef.type === "APPOINTMENT" && linkedRef.appointmentId) {
        trailer = `\n\nRefs-Appointment: #${linkedRef.appointmentId} (${linkedRef.appointmentTitle || "Aftale"} - ${linkedRef.appointmentDate || ""})`;
      }
    }

    const content = `${rawContent}${trailer}`;

    try {
      const res = await fetch("/api/backend/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid,
          therapistUuid: overview.therapistUuid,
          title: loc("Terapeutisk opfølgning", "Therapeutic follow-up"),
          content,
          sharedWithTherapists: true,
          appointmentId:
            linkedRef?.type === "APPOINTMENT" && linkedRef.appointmentId
              ? String(linkedRef.appointmentId).replace(/^#/, "").split(/[\s(]/)[0].trim()
              : undefined,
        }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        setSharedDrafts((prev) => ({ ...prev, [clientUuid]: "" }));
        if (refKey) {
          setSelectedRefByKey((prev) => ({ ...prev, [refKey]: null }));
        } else {
          setSelectedRefByKey((prev) => ({
            ...prev,
            [`studio_shared_${clientUuid}`]: null,
            [`multi_shared_${clientUuid}`]: null,
          }));
        }
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
        notify("success", `Delt journalindlæg gemt for ${clientName}.`);
      }
    } catch {
      notify("danger", "Kunne ikke gemme delt journalnotat.");
    }
  };

  // Save Confidential Clinical Note (INTERNAL_MEDICAL_NOTES) + Live Sync JGit Timeline Window
  const handleSaveConfidentialNote = async (
    clientUuid: string,
    clientName: string,
    refKey?: string
  ) => {
    const rawNoteText = (confidentialDrafts[clientUuid] || "").trim();
    if (!rawNoteText) return;

    const linkedRef =
      (refKey ? selectedRefByKey[refKey] : null) ||
      selectedRefByKey[`studio_confidential_${clientUuid}`] ||
      selectedRefByKey[`multi_confidential_${clientUuid}`] ||
      null;

    let trailer = "";
    if (linkedRef) {
      if (linkedRef.type === "COMMIT" && linkedRef.commitHash) {
        trailer = `\n\nRefs-Commit: #${linkedRef.commitHash}`;
      } else if (linkedRef.type === "APPOINTMENT" && linkedRef.appointmentId) {
        trailer = `\n\nRefs-Appointment: #${linkedRef.appointmentId} (${linkedRef.appointmentTitle || "Aftale"} - ${linkedRef.appointmentDate || ""})`;
      }
    }

    const noteText = `${rawNoteText}${trailer}`;

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
          appointmentId:
            linkedRef?.type === "APPOINTMENT" && linkedRef.appointmentId
              ? String(linkedRef.appointmentId).replace(/^#/, "").split(/[\s(]/)[0].trim()
              : undefined,
        }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        setConfidentialDrafts((prev) => ({ ...prev, [clientUuid]: "" }));
        if (refKey) {
          setSelectedRefByKey((prev) => ({ ...prev, [refKey]: null }));
        } else {
          setSelectedRefByKey((prev) => ({
            ...prev,
            [`studio_confidential_${clientUuid}`]: null,
            [`multi_confidential_${clientUuid}`]: null,
          }));
        }
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
          `Fortroligt klinisk notat gemt for ${clientName}.`
        );
      }
    } catch {
      notify("danger", "Kunne ikke gemme fortroligt klinisk notat.");
    }
  };

  // Open JGit Timeline for Client (and optionally focus a specific commit hash)
  const handleOpenGitAudit = async (
    clientUuid: string,
    clientName: string,
    focusCommitHash?: string
  ) => {
    openClientJournal({ uuid: clientUuid, name: clientName }, focusCommitHash);
  };

  // Reschedule Appointment from Details Modal
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
      setSelectedAppointmentModal(null);
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
      setSelectedAppointmentModal(null);
      await loadDatabaseOverview();
      notify("info", "Aftalen er aflyst i databasen.");
    } catch {
      notify("danger", "Kunne ikke aflyse aftalen.");
    }
  };

  // Create or Update Service in Database (Bilag 5.1.3)
  const handleCreateService = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!newService.name.trim()) return;

    const orgCvr = overview.providerProfile?.organisation?.cvrNumber?.trim() || "";
    const orgName = overview.providerProfile?.organisation?.name?.trim() || "";
    const workingHours = overview.providerProfile?.workingHoursJson?.trim() || "";
    const address = overview.providerProfile?.organisation?.address?.trim() || overview.clientProfile?.homeAddress?.trim() || "";
    const postalCode = overview.providerProfile?.organisation?.postalCode?.trim() || overview.clientProfile?.postalCode?.trim() || "";
    const phoneNumber = overview.providerProfile?.organisation?.phoneNumber?.trim() || overview.clientProfile?.phoneNumber?.trim() || "";

    const isProfileComplete = Boolean(
      orgCvr && orgName && workingHours && address && postalCode && phoneNumber
    );

    if (overview.canCreateServices === false || !isProfileComplete) {
      notify(
        "danger",
        loc(
          "Du kan ikke oprette eller opdatere en service/ydelse før du har udfyldt: CVR-nummer, organisationsnavn, arbejdstider, praksisadresse, postnummer og telefonnummer under Klinik & CVR.",
          "You cannot create or update a service until you have filled in: CVR number, organisation name, working hours, clinic address, postal code, and phone number under Clinic & CVR."
        )
      );
      return;
    }

    const payload = {
      name: newService.name.trim(),
      description: newService.description.trim(),
      durationMinutes: newService.durationMinutes,
      price: newService.price,
      location: newService.location,
      therapistUuid: overview.therapistUuid || null,
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
            location: companyAddress || "",
            shareAcrossOrg: true,
          });
          await loadDatabaseOverview();
          notify("success", "Ydelsen er opdateret i servicekataloget.");
        } else {
          let errMsg = "Kunne ikke opdatere ydelsen.";
          try {
            const errData = await res.json();
            if (errData && errData.message) {
              errMsg = errData.message;
            }
          } catch {
            // ignore
          }
          notify("danger", errMsg);
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
            location: companyAddress || "",
            shareAcrossOrg: true,
          });
          await loadDatabaseOverview();
          notify("success", "Ny ydelse oprettet i servicekataloget.");
        } else {
          let errMsg = "Kunne ikke oprette ydelsen.";
          try {
            const errData = await res.json();
            if (errData && errData.message) {
              errMsg = errData.message;
            }
          } catch {
            // ignore
          }
          notify("danger", errMsg);
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
      location: companyAddress || "",
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

  const upcomingAppointments = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return overview.appointments
      .filter((a: any) => a.status !== "CANCELLED" && String(a.startTime).slice(0, 10) >= todayStr)
      .sort((a: any, b: any) => String(a.startTime).localeCompare(String(b.startTime)));
  }, [overview.appointments]);

  const nextUpcomingApt = upcomingAppointments[0] || null;

  const canCreate = useMemo(() => {
    const orgCvr = overview.providerProfile?.organisation?.cvrNumber?.trim() || "";
    const orgName = overview.providerProfile?.organisation?.name?.trim() || "";
    const workingHours = overview.providerProfile?.workingHoursJson?.trim() || "";
    const clinicAddress = overview.providerProfile?.organisation?.address?.trim() || overview.clientProfile?.homeAddress?.trim() || "";
    const postalCode = overview.providerProfile?.organisation?.postalCode?.trim() || overview.clientProfile?.postalCode?.trim() || "";
    const phoneNumber = overview.providerProfile?.organisation?.phoneNumber?.trim() || overview.clientProfile?.phoneNumber?.trim() || "";

    const isProfileComplete = Boolean(
      orgCvr && orgName && workingHours && clinicAddress && postalCode && phoneNumber
    );

    return overview.canCreateServices !== undefined
      ? Boolean(overview.canCreateServices && isProfileComplete)
      : isProfileComplete;
  }, [overview.providerProfile, overview.clientProfile, overview.canCreateServices]);

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
            <div className="sidebar-nav-card d-flex flex-column gap-2">
              <div className="sidebar-nav-title">{loc("Terapeut Undersider", "Therapist Pages")}</div>
              <Tabs.List className="d-flex flex-column gap-1">
                <Tabs.Tab value="calendar_overview" className="sidebar-tab-btn">
                  <i className="bi bi-calendar3"></i>
                  <span>{tr("portal.tabCalendar", loc("Kalender & Dagsprogram", "Calendar & Daily Schedule"))}</span>
                </Tabs.Tab>
                <Tabs.Tab value="crm_clients" className="sidebar-tab-btn">
                  <i className="bi bi-people"></i>
                  <span>
                    {loc("Klientkartotek", "Client Directory")}
                  </span>
                </Tabs.Tab>
                <Tabs.Tab value="services_cvr" className="sidebar-tab-btn">
                  <i className="bi bi-briefcase"></i>
                  <span>
                    {loc("Services", "Services")}
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
                  <i className="bi bi-clock-history text-success"></i>
                  <span>
                    {loc("Journal-tidslinje", "Journal Timeline")}
                  </span>
                </Tabs.Tab>
                <Tabs.Tab value="clinic_cvr" className="sidebar-tab-btn">
                  <i className="bi bi-building-gear"></i>
                  <span>
                    {loc("Klinikindstillinger", "Clinic Settings")}
                  </span>
                </Tabs.Tab>
              </Tabs.List>
            {/* Add / Save Service Button in Sidebar (inside the white sidebar card) */}
            {activeTherapistTab === "services_cvr" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                <button
                  type="submit"
                  form="therapist-service-form"
                  onClick={(e) => {
                    const form = document.getElementById("therapist-service-form") as HTMLFormElement | null;
                    if (form) {
                      if (form.reportValidity && !form.reportValidity()) {
                        return;
                      }
                      form.requestSubmit();
                    } else {
                      handleCreateService(e);
                    }
                  }}
                  disabled={!canCreate}
                  className="btn btn-outline-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{
                    borderColor: "#0f766e",
                    color: "#0f766e",
                    fontSize: "0.82rem",
                  }}
                  title={!canCreate ? loc("Udfyld alle 6 profiloplysninger for at aktivere", "Fill out all 6 profile fields to activate") : undefined}
                >
                  <i className={`bi ${editingServiceId ? "bi-check2-circle" : "bi-plus-circle"}`}></i>
                  <span>
                    {editingServiceId
                      ? loc("Gem ændringer", "Save Changes")
                      : loc("Tilføj ydelse", "Add Service")}
                  </span>
                </button>

                {editingServiceId && (
                  <button
                    type="button"
                    onClick={handleCancelEditService}
                    className="btn btn-outline-secondary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <i className="bi bi-x-circle"></i>
                    <span>{loc("Annuller redigering", "Cancel editing")}</span>
                  </button>
                )}

                {!canCreate && (
                  <div className="small text-danger text-center px-1" style={{ fontSize: "0.74rem" }}>
                    <i className="bi bi-lock-fill me-1"></i>
                    {loc(
                      "Låst indtil 6 profilfelter er udfyldt under Indstillinger.",
                      "Locked until 6 profile fields are filled under Settings."
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Save Clinic & Business Settings Button in Sidebar (inside the white sidebar card) */}
            {activeTherapistTab === "clinic_cvr" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveClinicSettings(e);
                  }}
                  className="btn btn-outline-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{
                    borderColor: "#0f766e",
                    color: "#0f766e",
                    fontSize: "0.82rem",
                  }}
                  disabled={savingClinic}
                >
                  <i className={`bi ${savingClinic ? "bi-arrow-repeat spin-animation" : "bi-check2-circle"}`}></i>
                  <span>
                    {savingClinic
                      ? loc("Gemmer...", "Saving...")
                      : loc("Gem indstillinger", "Save settings")}
                  </span>
                </button>
              </div>
            )}

            {/* Action buttons for Journal Timeline in Sidebar (inside the white sidebar card) */}
            {activeTherapistTab === "jgit_studio" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                {/* 1. Skriv Nyt Notat */}
                <button
                  type="button"
                  onClick={() => setIsStudioComposerOpen(true)}
                  className="btn btn-outline-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{ borderColor: "#0f766e", color: "#0f766e", fontSize: "0.82rem" }}
                  title={loc("Åbn vindue for at oprette et nyt journalnotat", "Open window to create a new journal note")}
                >
                  <i className="bi bi-pencil-square"></i>
                  <span>{loc("+ Skriv Nyt Notat", "+ Write New Note")}</span>
                </button>

                {/* 2. Opdater Tidslinje */}
                <button
                  type="button"
                  onClick={() => {
                    const targetUuid = selectedStudioClientUuid || overview.clients[0]?.uuid || "";
                    if (targetUuid) {
                      loadClientGitHistory(targetUuid);
                    }
                  }}
                  className="btn btn-outline-secondary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{ fontSize: "0.82rem" }}
                  title={loc("Opdater hændelser og tidslinje for den valgte klient", "Refresh events and timeline")}
                >
                  <i className="bi bi-arrow-clockwise"></i>
                  <span>{loc("Opdater Tidslinje", "Refresh Timeline")}</span>
                </button>

                {/* 3. Client Picker */}
                <div className="px-0.5">
                  <label
                    className="form-label small text-muted mb-1 d-flex align-items-center gap-1.5"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <i className="bi bi-person-circle text-teal"></i>
                    <span>{loc("Valgt Klient:", "Selected Client:")}</span>
                  </label>
                  <select
                    className="form-select form-select-sm rounded-pill fw-bold text-dark border-secondary-subtle"
                    style={{ fontSize: "0.78rem" }}
                    value={selectedStudioClientUuid || overview.clients[0]?.uuid || ""}
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

                {/* 4. Filters & Swimlanes Button */}
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(true)}
                  className="btn btn-outline-secondary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-between bg-white text-dark"
                  style={{ fontSize: "0.82rem" }}
                  title={loc("Åbn tilpasning af swimlanes og avancerede filtre", "Open swimlane customization and advanced filters")}
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-sliders text-teal fs-6"></i>
                    <span>{loc("Filtre & Swimlanes", "Filters & Swimlanes")}</span>
                  </div>
                  {activeStudioFiltersCount > 0 ? (
                    <span
                      className="badge rounded-pill text-white"
                      style={{ backgroundColor: "#0f766e", fontSize: "0.68rem" }}
                    >
                      {activeStudioFiltersCount}
                    </span>
                  ) : (
                    <i className="bi bi-chevron-right text-muted small"></i>
                  )}
                </button>
              </div>
            )}
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
                        "Administrer aftaler, delte patientjournaler, fortrolige kliniske noter og versionshistorik.",
                        "Manage appointments, shared patient journals, confidential clinical notes, and version history."
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
                        "Indlæser klinikdata...",
                        "Loading clinic data..."
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
                        <div className="d-flex align-items-center gap-2">
                          <button
                            type="button"
                            onClick={() => loadDatabaseOverview()}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 d-flex align-items-center gap-1.5 shadow-2xs bg-white"
                            title={loc("Genindlæs kalender og aftaler fra databasen", "Refresh calendar and appointments from database")}
                          >
                            <i className="bi bi-arrow-clockwise text-teal"></i>
                            <span className="small fw-semibold">{loc("Opdater", "Refresh")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTherapistTab("clinic_cvr")}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 d-flex align-items-center gap-1.5 shadow-2xs bg-white"
                            title={loc("Juster dine ugentlige arbejdstider og pauser", "Adjust your weekly working hours and breaks")}
                          >
                            <i className="bi bi-clock-history text-teal"></i>
                            <span className="small fw-semibold">{loc("Juster arbejdstider & pauser", "Adjust hours & breaks")}</span>
                          </button>
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

                        {calendarCells.map((cell, idx) => {
                          if (cell === null) {
                            return (
                              <div
                                key={`empty-${idx}`}
                                className="rounded-3 bg-light bg-opacity-50"
                                style={{ minHeight: "86px" }}
                              />
                            );
                          }
                          const isClosed = isDayClosed(therapistWeeklySchedule, cell.dateStr);
                          return (
                            <button
                              key={cell.dateStr}
                              type="button"
                              onClick={() => setSelectedDateStr(cell.dateStr)}
                              className={`calendar-day-cell ${
                                selectedDateStr === cell.dateStr ? "selected" : ""
                              } ${cell.count > 0 ? "has-appointments" : ""} ${isClosed && cell.count === 0 ? "is-closed" : ""}`}
                            >
                              <div className="d-flex justify-content-between align-items-center w-100">
                                <span className={`fw-bold ${isClosed && cell.count === 0 ? "text-muted opacity-75" : "text-dark"}`} style={{ fontSize: "0.9rem" }}>
                                  {cell.dayNum}
                                </span>
                                {cell.dateStr === new Date().toISOString().slice(0, 10) ? (
                                  <span
                                    className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-1.5 py-0.5"
                                    style={{ fontSize: "0.62rem", fontWeight: 600 }}
                                  >
                                    {loc("I dag", "Today")}
                                  </span>
                                ) : cell.count > 0 ? (
                                  <span
                                    className="badge rounded-pill px-1.5 py-0.5"
                                    style={{
                                      backgroundColor: "rgba(15, 118, 110, 0.15)",
                                      color: "#0f766e",
                                      fontSize: "0.62rem",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {cell.count}
                                  </span>
                                ) : null}
                              </div>

                              {cell.count > 0 ? (
                                <span
                                  className="badge rounded-pill w-100 text-truncate py-1 fw-bold shadow-2xs"
                                  style={{
                                    backgroundColor: "#0f766e",
                                    color: "#ffffff",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  <i className="bi bi-calendar-check me-1"></i>
                                  {cell.count === 1
                                    ? tr("portal.singleAppointmentBadge", loc("1 aftale", "1 appointment"), { count: 1 })
                                    : tr("portal.appointmentsCountBadge", loc(`${cell.count} aftaler`, `${cell.count} appointments`), {
                                        count: cell.count,
                                      })}
                                </span>
                              ) : isClosed ? (
                                <span className="badge bg-secondary-subtle text-secondary rounded-pill py-0.5 px-1.5" style={{ fontSize: "0.65rem" }}>
                                  {loc("Lukket", "Closed")}
                                </span>
                              ) : (
                                <span className="text-muted" style={{ fontSize: "0.7rem" }}>
                                  —
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right 5 Cols: Selected Day's Appointments */}
                    <div className="col-xl-5">
                      <div className="p-4 rounded-4 border bg-light bg-opacity-50 h-100 d-flex flex-column gap-3">
                        <div className="d-flex justify-content-between align-items-center mb-1">
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
                          <div className="d-flex flex-column gap-3">
                            <div className="p-4 rounded-4 bg-white border text-center text-muted small">
                              <i className="bi bi-calendar2-x fs-4 d-block mb-2"></i>
                              {loc(
                                `Ingen aftaler registreret på ${selectedDateStr}. Klik på en dato i kalenderen med en grøn aftale-badge.`,
                                `No appointments scheduled on ${selectedDateStr}. Click a date on the calendar with a green appointment badge.`
                              )}
                            </div>

                            {nextUpcomingApt && (
                              <div className="p-3 rounded-4 bg-white border border-success-subtle shadow-xs">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                  <span
                                    className="badge rounded-pill px-2.5 py-1"
                                    style={{ backgroundColor: "#0f766e", color: "#ffffff", fontSize: "0.7rem" }}
                                  >
                                    <i className="bi bi-calendar-event me-1"></i>
                                    {loc("Næste kommende aftale", "Next upcoming appointment")}
                                  </span>
                                  <span className="small text-muted fw-semibold">
                                    {String(nextUpcomingApt.startTime).slice(0, 10)}
                                  </span>
                                </div>
                                <h6 className="fw-bold text-dark mb-1">{nextUpcomingApt.title}</h6>
                                <div className="small text-muted mb-2">
                                  {loc("Klient", "Client")}: <strong>{nextUpcomingApt.clientName}</strong> • kl. {String(nextUpcomingApt.startTime).slice(11, 16)} – {String(nextUpcomingApt.endTime).slice(11, 16)}
                                {nextUpcomingApt.location && (() => {
                                  const isOnline =
                                    nextUpcomingApt.location.toLowerCase().includes("online") ||
                                    nextUpcomingApt.location.toLowerCase().includes("video") ||
                                    Boolean(nextUpcomingApt.videoMeetingUrl);
                                  const rawUrl =
                                    nextUpcomingApt.videoMeetingUrl ||
                                    (nextUpcomingApt.location.includes("http") ? nextUpcomingApt.location.replace(/^Online:\s*/i, "").trim() : "");
                                  const videoUrl = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : "";

                                  return (
                                    <div className="small text-dark fw-semibold mb-3 d-flex align-items-center justify-content-between gap-1.5 p-1.5 px-2.5 rounded-3 bg-white border">
                                      <div className="d-flex align-items-center gap-1.5 overflow-hidden">
                                        <i className={`bi ${isOnline ? "bi-camera-video-fill text-info" : "bi-geo-alt-fill text-danger"} fs-6 flex-shrink-0`}></i>
                                        <span className="text-truncate">{nextUpcomingApt.location}</span>
                                      </div>
                                      {videoUrl && (
                                        <a
                                          href={videoUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="btn btn-sm btn-info text-white rounded-pill px-2.5 py-0.5 small fw-semibold flex-shrink-0"
                                          style={{ fontSize: "0.72rem" }}
                                        >
                                          <i className="bi bi-camera-video me-1"></i>
                                          {loc("Åbn link", "Open link")}
                                        </a>
                                      )}
                                    </div>
                                  );
                                })()}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextDate = String(nextUpcomingApt.startTime).slice(0, 10);
                                    setSelectedDateStr(nextDate);
                                    const [y, m] = nextDate.split("-").map(Number);
                                    setCurrentMonthDate(new Date(y, m - 1, 1));
                                  }}
                                  className="btn btn-sm btn-outline-success rounded-pill w-100 fw-semibold d-flex align-items-center justify-content-center gap-1.5"
                                  style={{ borderColor: "#0f766e", color: "#0f766e" }}
                                >
                                  <i className="bi bi-arrow-right-circle"></i>
                                  {loc(
                                    `Gå til aftalen d. ${String(nextUpcomingApt.startTime).slice(0, 10)}`,
                                    `Jump to appointment on ${String(nextUpcomingApt.startTime).slice(0, 10)}`
                                  )}
                                </button>
                              </div>
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
                                  <div className="d-flex justify-content-between align-items-center mb-1">
                                    <span className="badge bg-teal-subtle text-success border">
                                      kl. {String(apt.startTime).slice(11, 16)} –{" "}
                                      {String(apt.endTime).slice(11, 16)}
                                    </span>
                                    <div className="d-flex align-items-center gap-1.5">
                                      <span className="badge bg-light text-dark border">
                                        {apt.status}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => openAppointmentModal(apt)}
                                        className="btn btn-sm btn-outline-dark rounded-pill px-2.5 py-0.5 small fw-semibold"
                                        style={{ fontSize: "0.74rem" }}
                                      >
                                        <i className="bi bi-calendar-event me-1"></i>{" "}
                                        {loc("Se / Flyt Aftale", "View / Reschedule")}
                                      </button>
                                    </div>
                                  </div>
                                  <h6 className="fw-bold text-dark mb-1">{apt.title}</h6>
                                  <div className="small text-muted mb-3">
                                    {loc("Klient", "Client")}: <strong>{apt.clientName}</strong> • {apt.serviceName}
                                  </div>
                                  {(apt.location || clientObj?.address) && (() => {
                                    const locDisplay = apt.location || `${loc("Hos klienten:", "At client's:")} ${clientObj?.address || ""}${clientObj?.postalCode ? ", " + clientObj.postalCode : ""}`;
                                    const isOnline =
                                      locDisplay.toLowerCase().includes("online") ||
                                      locDisplay.toLowerCase().includes("video") ||
                                      Boolean(apt.videoMeetingUrl);
                                    const rawUrl =
                                      apt.videoMeetingUrl ||
                                      (locDisplay.includes("http") ? locDisplay.replace(/^Online:\s*/i, "").trim() : "");
                                    const videoUrl = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : "";

                                    return (
                                      <div className="small text-dark fw-semibold mb-0 d-flex align-items-center justify-content-between gap-1.5 p-2 rounded-3 bg-light border">
                                        <div className="d-flex align-items-center gap-1.5 overflow-hidden">
                                          <i className={`bi ${isOnline ? "bi-camera-video-fill text-info" : "bi-geo-alt-fill text-danger"} fs-6 flex-shrink-0`}></i>
                                          <span className="text-truncate">{locDisplay}</span>
                                        </div>
                                        {videoUrl && (
                                          <a
                                            href={videoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-sm btn-info text-white rounded-pill px-2.5 py-0.5 small fw-semibold flex-shrink-0"
                                            style={{ fontSize: "0.72rem" }}
                                          >
                                            <i className="bi bi-camera-video me-1"></i>
                                            {loc("Åbn link", "Open link")}
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 2: CRM CLIENT ROSTER & HANDSHAKES (Q3, Q4, Q10) */}
                <Tabs.Panel value="crm_clients">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <div>
                      <h5 className="fw-bold mb-0">
                        {loc(
                          "Klientkartotek & Patient 360° Overblik",
                          "Client Directory & Patient 360° Overview"
                        )}
                      </h5>
                      <div className="text-muted small" style={{ fontSize: "0.76rem" }}>
                        {loc(
                          "Klienter der har booket dine ydelser eller tildelt dig Handshake-samtykke",
                          "Clients who have booked your services or granted you Handshake consent"
                        )}
                      </div>
                    </div>
                    {overview.clients.length > 0 && (
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
                    )}
                  </div>

                  {overview.clients.length === 0 ? (
                    <div className="text-center py-5 px-3 bg-light bg-opacity-50 border rounded-4">
                      <div className="mb-3">
                        <i className="bi bi-people text-secondary" style={{ fontSize: "2.8rem" }}></i>
                      </div>
                      <h5 className="fw-bold text-dark mb-2">
                        {loc("Ingen tilknyttede klienter endnu", "No connected clients yet")}
                      </h5>
                      <p className="text-muted small mx-auto mb-4" style={{ maxWidth: "540px" }}>
                        {loc(
                          "Klienter tilknyttes automatisk dit kartotek, når du opretter og udgiver ydelser på markedspladsen, og en klient booker en aftale og tildeler dig Handshake-samtykke.",
                          "Clients will automatically appear in your directory once you create and publish services to the marketplace, and clients book an appointment and grant you Handshake consent."
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTherapistTab("services_cvr")}
                        className="btn btn-primary rounded-pill px-4 shadow-xs fw-semibold"
                      >
                        <i className="bi bi-shop me-1.5"></i>
                        {loc("Gå til Services for at udbyde ydelser", "Go to Services to publish services")}
                      </button>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>{loc("Klient", "Client")}</th>
                            <th>{loc("Fødselsdato & Kontakt", "Date of Birth & Contact")}</th>
                            <th>{loc("Handshake Samtykke", "Handshake Consent")}</th>
                            <th>{loc("Seneste Humør", "Latest Mood")}</th>
                            <th>{loc("Seneste PCL-5", "Latest PCL-5")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.clients
                            .filter((c: any) =>
                              `${c.name} ${c.email} ${c.phone} ${c.dob || ""}`
                                .toLowerCase()
                                .includes(crmSearch.toLowerCase())
                            )
                            .map((c: any) => {
                              const hasActiveHandshake = c.handshakeStatus === "ACTIVE";
                              return (
                                <tr key={c.uuid}>
                                  <td className="fw-bold text-dark">
                                    <div className="d-flex align-items-center gap-2.5">
                                      <button
                                        type="button"
                                        onClick={() => openClientJournal(c)}
                                        className={`btn btn-sm rounded-circle d-inline-flex align-items-center justify-content-center shadow-xs transition-all ${
                                          hasActiveHandshake
                                            ? "btn-success text-white"
                                            : "btn-outline-secondary"
                                        }`}
                                        style={{
                                          width: "32px",
                                          height: "32px",
                                          minWidth: "32px",
                                          backgroundColor: hasActiveHandshake ? "#0f766e" : undefined,
                                          borderColor: hasActiveHandshake ? "#0f766e" : undefined,
                                          fontSize: "0.95rem",
                                        }}
                                        title={
                                          hasActiveHandshake
                                            ? loc("Åbn Journal-tidslinje", "Open Journal Timeline")
                                            : loc("Åbn Behandlernotat", "Open Clinical Notes")
                                        }
                                      >
                                        <i className={`bi ${hasActiveHandshake ? "bi-journal-medical" : "bi-journal-text"}`}></i>
                                      </button>
                                      <span
                                        role="button"
                                        onClick={() => openClientJournal(c)}
                                        className="text-dark text-decoration-none"
                                        style={{ cursor: "pointer" }}
                                        title={
                                          hasActiveHandshake
                                            ? loc("Åbn Journal-tidslinje", "Open Journal Timeline")
                                            : loc("Åbn Behandlernotat", "Open Clinical Notes")
                                        }
                                      >
                                        {c.name}
                                      </span>
                                    </div>
                                  </td>
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
                                        hasActiveHandshake
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
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Tabs.Panel>

                {/* TAB 3: HYBRID SERVICE CATALOG & CVR (Q8 / Bilag 5.1.3) */}
                <Tabs.Panel value="services_cvr">
                  {(() => {
                    const orgCvr = overview.providerProfile?.organisation?.cvrNumber?.trim() || "";
                    const orgName = overview.providerProfile?.organisation?.name?.trim() || "";
                    const workingHours = overview.providerProfile?.workingHoursJson?.trim() || "";
                    const clinicAddress = overview.providerProfile?.organisation?.address?.trim() || overview.clientProfile?.homeAddress?.trim() || "";
                    const postalCode = overview.providerProfile?.organisation?.postalCode?.trim() || overview.clientProfile?.postalCode?.trim() || "";
                    const phoneNumber = overview.providerProfile?.organisation?.phoneNumber?.trim() || overview.clientProfile?.phoneNumber?.trim() || "";

                    const hasCvr = Boolean(orgCvr);
                    const hasOrgName = Boolean(orgName);
                    const hasWorkingHours = Boolean(workingHours);
                    const hasAddress = Boolean(clinicAddress);
                    const hasPostalCode = Boolean(postalCode);
                    const hasPhone = Boolean(phoneNumber);

                    const isProfileComplete = Boolean(
                      hasCvr && hasOrgName && hasWorkingHours && hasAddress && hasPostalCode && hasPhone
                    );
                    const canCreate =
                      overview.canCreateServices !== undefined
                        ? Boolean(overview.canCreateServices && isProfileComplete)
                        : isProfileComplete;

                    return (
                      <div className="row g-4">
                        <div className="col-lg-5">
                          {!canCreate && (
                            <div className="card border-warning border-2 bg-warning bg-opacity-10 rounded-4 p-3 mb-4 shadow-sm">
                              <div className="d-flex align-items-center gap-2 mb-2 text-warning-emphasis fw-bold">
                                <i className="bi bi-shield-lock-fill fs-5 text-warning"></i>
                                <span>{loc("Krav for oprettelse af ydelser", "Requirements for creating services")}</span>
                              </div>
                              <p className="small text-muted mb-3">
                                {loc(
                                  "Du kan ikke oprette eller udbyde ydelser i servicekataloget, før din virksomhed og praksis har udfyldt alle 6 obligatoriske oplysninger:",
                                  "You cannot create or offer services in the service catalog until your clinic and business have filled in all 6 mandatory details:"
                                )}
                              </p>
                              <div className="list-group list-group-flush rounded-3 border mb-3 bg-white">
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("CVR-nummer", "CVR Number")}</span>
                                  {hasCvr ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("Organisationsnavn / Kliniknavn", "Organisation / Clinic Name")}</span>
                                  {hasOrgName ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("Arbejdstider", "Working Hours")}</span>
                                  {hasWorkingHours ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("Klinikadresse / Praksisadresse", "Clinic / Practice Address")}</span>
                                  {hasAddress ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("Postnummer & By", "Postal Code & City")}</span>
                                  {hasPostalCode ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                                <div className="list-group-item d-flex align-items-center justify-content-between py-2 px-3 small">
                                  <span>{loc("Praksis Telefonnummer", "Practice Phone Number")}</span>
                                  {hasPhone ? (
                                    <span className="badge bg-success-subtle text-success">✓ {loc("Udfyldt", "Filled")}</span>
                                  ) : (
                                    <span className="badge bg-danger-subtle text-danger">✕ {loc("Mangler", "Missing")}</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveTherapistTab("clinic_cvr")}
                                className="btn btn-warning btn-sm w-100 rounded-pill fw-semibold text-dark d-flex align-items-center justify-content-center gap-2 shadow-xs"
                              >
                                <i className="bi bi-building-gear"></i>
                                {loc("Gå til Klinikindstillinger", "Go to Clinic Settings")}
                              </button>
                            </div>
                          )}

                          <form
                            id="therapist-service-form"
                            onSubmit={handleCreateService}
                            className={`p-4 rounded-4 border bg-light bg-opacity-50 ${!canCreate ? "opacity-75" : ""}`}
                          >
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <h5 className="fw-bold mb-0">
                                {editingServiceId
                                  ? loc("Rediger ydelse", "Edit Service")
                                  : loc("Opret ydelse", "Create Service")}
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
                                disabled={!canCreate}
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
                                disabled={!canCreate}
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
                                  disabled={!canCreate}
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
                                  disabled={!canCreate}
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
                            {(() => {
                              const locStr = (newService.location || "").toLowerCase();
                              const isLocationBoth =
                                (locStr.includes("online") || locStr.includes("video")) &&
                                (locStr.includes("fysisk") ||
                                  locStr.includes("&") ||
                                  locStr.includes("begge") ||
                                  locStr.includes("valgfrit"));
                              const isLocationOnline =
                                !isLocationBoth &&
                                (locStr.includes("online") ||
                                  locStr.includes("video") ||
                                  locStr.includes("virtuel"));
                              const isLocationPhysical = !isLocationBoth && !isLocationOnline;
                              const isAtClientsHome =
                                locStr.includes("klient") ||
                                locStr.includes("client") ||
                                locStr.includes("hjemmebesøg");
                              const isClinicSelected = isLocationPhysical && !isAtClientsHome;

                              return (
                                <div className="mb-3">
                                  <div className="d-flex justify-content-between align-items-center mb-1.5">
                                    <label className="form-label small fw-semibold mb-0">
                                      {loc("Mødeform & Lokation", "Session Format & Location")}
                                    </label>
                                    <span
                                      className={`badge rounded-pill px-2 py-0.5 fw-semibold ${
                                        isLocationOnline
                                          ? "bg-info-subtle text-info-emphasis border border-info"
                                          : isLocationBoth
                                          ? "bg-primary-subtle text-primary-emphasis border border-primary"
                                          : "bg-success-subtle text-success-emphasis border border-success"
                                      }`}
                                      style={{ fontSize: "0.72rem" }}
                                    >
                                      {isLocationOnline ? (
                                        <>
                                          <i className="bi bi-camera-video me-1"></i>
                                          {loc("Online videokonsultation", "Online video session")}
                                        </>
                                      ) : isLocationBoth ? (
                                        <>
                                          <i className="bi bi-arrow-repeat me-1"></i>
                                          {loc("Fysisk & Online (Valgfrit)", "Physical & Online (Flexible)")}
                                        </>
                                      ) : isAtClientsHome ? (
                                        <>
                                          <i className="bi bi-house-door me-1"></i>
                                          {loc("Hjemmebesøg (Hos klienten)", "Home visit (At client's)")}
                                        </>
                                      ) : (
                                        <>
                                          <i className="bi bi-building me-1"></i>
                                          {loc("Fysisk fremmøde", "In-person attendance")}
                                        </>
                                      )}
                                    </span>
                                  </div>

                                  {/* 3-Way Segmented Mode Buttons */}
                                  <div className="btn-group w-100 p-1 bg-white border rounded-3 mb-2 shadow-2xs" role="group">
                                    <button
                                      type="button"
                                      disabled={!canCreate}
                                      onClick={() => {
                                        setNewService({
                                          ...newService,
                                          location: companyAddress || loc("I klinikken", "At the clinic"),
                                        });
                                      }}
                                      className={`btn btn-sm rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 py-1.5 transition-all ${
                                        isLocationPhysical
                                          ? "btn-teal text-white shadow-2xs"
                                          : "text-muted hover-bg-light"
                                      }`}
                                      style={{
                                        fontSize: "0.8rem",
                                        backgroundColor: isLocationPhysical ? "#0f766e" : "transparent",
                                        color: isLocationPhysical ? "#ffffff" : undefined,
                                      }}
                                    >
                                      <i className="bi bi-building"></i>
                                      <span>{loc("Fysisk", "In-person")}</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={!canCreate}
                                      onClick={() => {
                                        setNewService({
                                          ...newService,
                                          location: clinicVideoLink ? `Online: ${clinicVideoLink}` : loc("Online (Videokonsultation)", "Online (Video consultation)"),
                                        });
                                      }}
                                      className={`btn btn-sm rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 py-1.5 transition-all ${
                                        isLocationOnline
                                          ? "btn-info text-white shadow-2xs"
                                          : "text-muted hover-bg-light"
                                      }`}
                                      style={{
                                        fontSize: "0.8rem",
                                        backgroundColor: isLocationOnline ? "#0284c7" : "transparent",
                                        color: isLocationOnline ? "#ffffff" : undefined,
                                      }}
                                    >
                                      <i className="bi bi-camera-video"></i>
                                      <span>{loc("Online (Video)", "Online (Video)")}</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={!canCreate}
                                      onClick={() => {
                                        setNewService({
                                          ...newService,
                                          location: loc("Fysisk & Online (Valgfrit)", "Physical & Online (Flexible)"),
                                        });
                                      }}
                                      className={`btn btn-sm rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 py-1.5 transition-all ${
                                        isLocationBoth
                                          ? "btn-primary text-white shadow-2xs"
                                          : "text-muted hover-bg-light"
                                      }`}
                                      style={{
                                        fontSize: "0.8rem",
                                        backgroundColor: isLocationBoth ? "#4f46e5" : "transparent",
                                        color: isLocationBoth ? "#ffffff" : undefined,
                                      }}
                                    >
                                      <i className="bi bi-arrow-repeat"></i>
                                      <span>{loc("Begge dele", "Both")}</span>
                                    </button>
                                  </div>

                                  {/* Quick chips based on mode */}
                                  {isLocationPhysical && (
                                    <div className="mb-2 d-flex flex-wrap gap-1.5">
                                      <button
                                        type="button"
                                        disabled={!canCreate}
                                        onClick={() => {
                                          setNewService({
                                            ...newService,
                                            location: companyAddress || loc("I klinikken", "At the clinic"),
                                          });
                                        }}
                                        className={`btn btn-sm rounded-pill px-2.5 py-0.5 small fw-semibold transition-all ${
                                          isClinicSelected
                                            ? "text-white shadow-2xs"
                                            : "btn-light border text-muted"
                                        }`}
                                        style={{
                                          fontSize: "0.72rem",
                                          backgroundColor: isClinicSelected ? "#0f766e" : undefined,
                                          borderColor: isClinicSelected ? "#0f766e" : undefined,
                                        }}
                                      >
                                        🏢 {loc("Klinikken", "Clinic")}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canCreate}
                                        onClick={() => {
                                          setNewService({
                                            ...newService,
                                            location: loc("Hos klienten (Hjemmebesøg)", "At client's home"),
                                          });
                                        }}
                                        className={`btn btn-sm rounded-pill px-2.5 py-0.5 small fw-semibold transition-all ${
                                          isAtClientsHome
                                            ? "text-white shadow-2xs"
                                            : "btn-light border text-muted"
                                        }`}
                                        style={{
                                          fontSize: "0.72rem",
                                          backgroundColor: isAtClientsHome ? "#0f766e" : undefined,
                                          borderColor: isAtClientsHome ? "#0f766e" : undefined,
                                        }}
                                      >
                                        🏠 {loc("Hos klienten", "At client's")}
                                      </button>
                                    </div>
                                  )}

                                  {/* Location display: Info card for online / home visit, or text input for in-person / both */}
                                  {isLocationOnline ? (
                                    <div className="p-3 rounded-3 bg-light border border-info-subtle d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2.5 mb-1.5 shadow-2xs">
                                      <div className="d-flex align-items-center gap-2.5">
                                        <div
                                          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 text-white"
                                          style={{ width: "36px", height: "36px", backgroundColor: "#0284c7" }}
                                        >
                                          <i className="bi bi-camera-video-fill fs-6"></i>
                                        </div>
                                        <div>
                                          <div className="fw-bold text-dark" style={{ fontSize: "0.85rem" }}>
                                            {loc("Online videokonsultation via fast link", "Online video session via permanent link")}
                                          </div>
                                          <div className="text-muted small" style={{ fontSize: "0.74rem" }}>
                                            {clinicVideoLink ? (
                                              <span className="d-flex align-items-center gap-1 mt-0.5 text-info-emphasis fw-semibold">
                                                <i className="bi bi-link-45deg"></i>
                                                <span className="text-truncate" style={{ maxWidth: "300px" }}>{clinicVideoLink}</span>
                                              </span>
                                            ) : (
                                              <span>
                                                {loc(
                                                  "Der er ikke angivet et fast videolink endnu. Det kan tilføjes under Clinic Settings.",
                                                  "No permanent video link specified yet. It can be added under Clinic Settings."
                                                )}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setActiveTherapistTab("clinic_cvr")}
                                        className="btn btn-sm btn-outline-info rounded-pill px-2.5 py-1 small fw-semibold flex-shrink-0 align-self-start align-self-sm-center"
                                        style={{ fontSize: "0.72rem" }}
                                      >
                                        <i className="bi bi-gear me-1"></i>
                                        {clinicVideoLink ? loc("Clinic Settings", "Clinic Settings") : loc("Tilføj link", "Add link")}
                                      </button>
                                    </div>
                                  ) : isAtClientsHome ? (
                                    <div className="p-2.5 rounded-3 bg-light border border-teal-subtle d-flex align-items-center gap-2.5 mb-1.5 shadow-2xs">
                                      <div
                                        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 text-white"
                                        style={{ width: "32px", height: "32px", backgroundColor: "#0f766e" }}
                                      >
                                        <i className="bi bi-house-door-fill fs-6"></i>
                                      </div>
                                      <div className="small">
                                        <div className="fw-bold text-dark" style={{ fontSize: "0.82rem" }}>
                                          {loc("Hjemmebesøg hos klienten", "Home visit at client's")}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                                          {loc(
                                            "Du behøver ikke udfylde adressefeltet. Adressen udfyldes automatisk med klientens adresse, når de booker servicen.",
                                            "You do not need to fill the address field. The address is automatically populated with the client's address upon booking."
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <input
                                        type="text"
                                        className="form-control form-control-sm rounded-3 bg-white"
                                        style={{ fontSize: "0.82rem" }}
                                        disabled={!canCreate}
                                        placeholder={
                                          isLocationPhysical
                                            ? (companyAddress || loc("f.eks. Klinikken, Store Torv 4, Lokale 2", "e.g. Clinic, Main St 4, Room 2"))
                                            : loc("f.eks. Fysisk i klinikken eller Online (Klienten vælger)", "e.g. In clinic or Online (Client chooses)")
                                        }
                                        value={newService.location}
                                        onChange={(e) =>
                                          setNewService({ ...newService, location: e.target.value })
                                        }
                                      />
                                      {isClinicSelected && companyAddress && newService.location.trim() === companyAddress.trim() && (
                                        <div className="d-flex align-items-center gap-1.5 mt-1 fw-semibold" style={{ fontSize: "0.73rem", color: "#0f766e" }}>
                                          <i className="bi bi-check-circle-fill"></i>
                                          <span>{loc("Virksomhedens adresse er automatisk valgt.", "Company address is automatically selected.")}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="form-text small" style={{ fontSize: "0.72rem" }}>
                                    {isAtClientsHome
                                      ? loc(
                                          "Terapeuten kører ud til klienten. Adressen fremgår i kalenderen for den enkelte booking.",
                                          "Therapist travels to the client. The exact address appears in the calendar for each booking."
                                        )
                                      : isLocationPhysical
                                      ? loc(
                                          "Klienter møder fysisk op. Bliver udelukket fra kalenderens 'Online kun' tidsrum.",
                                          "In-person session. Excluded from 'Online only' timeslots in schedule."
                                        )
                                      : isLocationOnline
                                      ? null
                                      : loc(
                                          "Klienten kan vælge mellem fremmøde eller online ved booking.",
                                          "Client can choose between in-person or online during booking."
                                        )}
                                  </div>
                                </div>
                              );
                            })()}
                            <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mb-3">
                              <span className="small fw-semibold">
                                {loc(
                                  "Del som fælles klinik-skabelon på tværs af CVR",
                                  "Share as common clinic template across CVR"
                                )}
                              </span>
                              <Switch.Root
                                checked={newService.shareAcrossOrg}
                                disabled={!canCreate}
                                onCheckedChange={(v) =>
                                  setNewService({ ...newService, shareAcrossOrg: v })
                                }
                                className="base-switch-root"
                              >
                                <Switch.Thumb className="base-switch-thumb" />
                              </Switch.Root>
                            </div>
                            {!canCreate && (
                              <div className="small text-danger mt-2 text-center">
                                <i className="bi bi-lock-fill me-1"></i>
                                {loc(
                                  "Formularen er låst indtil de 6 påkrævede oplysninger er udfyldt under Indstillinger.",
                                  "Form is locked until all 6 required details are filled under Settings."
                                )}
                              </div>
                            )}
                          </form>
                        </div>

                    <div className="col-lg-7">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold mb-0">
                          {loc("Dine eksisterende ydelser", "Your Existing Services")}
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
                                <div className="small text-muted d-flex flex-wrap align-items-center gap-1.5 mt-0.5">
                                  <span>{srv.durationMinutes} min • {srv.price} DKK</span>
                                  {(() => {
                                    const sLoc = String(srv.location || "").toLowerCase();
                                    const isBoth = (sLoc.includes("online") || sLoc.includes("video")) &&
                                      (sLoc.includes("fysisk") || sLoc.includes("&") || sLoc.includes("begge") || sLoc.includes("valgfrit"));
                                    const isOnline = !isBoth && (sLoc.includes("online") || sLoc.includes("video") || sLoc.includes("virtuel"));

                                    if (isBoth) {
                                      return (
                                        <span className="badge rounded-pill bg-primary-subtle text-primary-emphasis border border-primary px-2 py-0.5" style={{ fontSize: "0.68rem" }}>
                                          <i className="bi bi-arrow-repeat me-1"></i>{loc("Fysisk & Online", "Physical & Online")}
                                        </span>
                                      );
                                    }
                                    if (isOnline) {
                                      return (
                                        <span className="badge rounded-pill bg-info-subtle text-info-emphasis border border-info px-2 py-0.5" style={{ fontSize: "0.68rem" }}>
                                          <i className="bi bi-camera-video me-1"></i>{loc("Online video", "Online video")}
                                        </span>
                                      );
                                    }
                                    if (srv.location) {
                                      return (
                                        <span className="badge rounded-pill bg-light text-dark border px-2 py-0.5" style={{ fontSize: "0.68rem" }}>
                                          <i className="bi bi-building me-1 text-teal"></i>{srv.location}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
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
                    );
                  })()}
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
                    const clientBundle = effectiveStudioUuid ? clientBundles[effectiveStudioUuid] : null;

                    return (
                      <div className="d-flex flex-column gap-2">
                        {clientBundle?.historyFilterActive && (
                          <div
                            className="alert alert-info py-2 px-3 rounded-3 border-0 small d-flex align-items-center gap-2 mb-1"
                            style={{ backgroundColor: "#e0f2fe", color: "#0369a1" }}
                          >
                            <i className="bi bi-shield-lock-fill fs-6 text-primary"></i>
                            <span>
                              <strong>{loc("JGit Tidsafgrænsning aktiv:", "JGit Time Filter Active:")}</strong>{" "}
                              {loc(
                                `Klienten har afgrænset historikadgangen i dette Handshake til perioden ${clientBundle.historyStartDate || "tidligste"} → ${clientBundle.historyEndDate || "i dag"}. Ældre commits udelades i henhold til samtykket.`,
                                `The client has restricted history access in this Handshake to ${clientBundle.historyStartDate || "earliest"} → ${clientBundle.historyEndDate || "today"}. Earlier commits are excluded in accordance with consent.`
                              )}
                            </span>
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
                          onOpenAppointment={(appointmentRef: string) => {
                            const cleanId = appointmentRef.replace(/^#/, "").split(/[\s(]/)[0].trim();
                            const foundApt = overview.appointments.find(
                              (a: any) =>
                                String(a.id) === cleanId ||
                                appointmentRef.includes(String(a.id))
                            );
                            if (foundApt) {
                              openAppointmentModal(foundApt);
                              notify("info", `Åbnede tilknyttet aftale: ${foundApt.title || cleanAppointmentReference(appointmentRef)}`);
                            } else {
                              notify("info", `Tilknyttet aftale: ${cleanAppointmentReference(appointmentRef)}`);
                            }
                          }}
                          isFilterModalOpen={isFilterModalOpen}
                          onFilterModalOpenChange={setIsFilterModalOpen}
                          onActiveFiltersCountChange={setActiveStudioFiltersCount}
                          toolbarActions={
                            <button
                              type="button"
                              onClick={() => setIsStudioComposerOpen(true)}
                              className="btn btn-sm text-white rounded-pill px-3 py-1 fw-semibold d-flex align-items-center gap-1.5 shadow-2xs"
                              style={{ backgroundColor: "#0f766e" }}
                            >
                              <i className="bi bi-pencil-square"></i>
                              <span>{loc("Nyt notat", "New note")}</span>
                            </button>
                          }
                          underToolbar={null}
                        />
                      </div>
                    );
                  })()}
                </Tabs.Panel>

                {/* TAB 5: CLINIC CVR & WORKING HOURS (SEPARATED FROM PERSONAL CLIENT STAMDATA) */}
                <Tabs.Panel value="clinic_cvr">
                  {(() => {
                    const orgCvr = overview.providerProfile?.organisation?.cvrNumber?.trim() || clinicForm.cvrNumber?.trim() || "";
                    const orgName = overview.providerProfile?.organisation?.name?.trim() || clinicForm.organisationName?.trim() || "";
                    const workingHours = overview.providerProfile?.workingHoursJson?.trim() || clinicForm.workingHoursJson?.trim() || "";
                    const clinicAddress = overview.providerProfile?.organisation?.address?.trim() || clinicForm.address?.trim() || "";
                    const postalCode = overview.providerProfile?.organisation?.postalCode?.trim() || clinicForm.postalCode?.trim() || "";
                    const phoneNumber = overview.providerProfile?.organisation?.phoneNumber?.trim() || clinicForm.phoneNumber?.trim() || "";

                    const hasCvr = Boolean(orgCvr);
                    const hasOrgName = Boolean(orgName);
                    const hasWorkingHours = Boolean(workingHours);
                    const hasAddress = Boolean(clinicAddress);
                    const hasPostalCode = Boolean(postalCode);
                    const hasPhone = Boolean(phoneNumber);

                    const isComplete = hasCvr && hasOrgName && hasWorkingHours && hasAddress && hasPostalCode && hasPhone;

                    return (
                      <div className="d-flex flex-column gap-4">
                        {/* Panel Header */}
                        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                          <div>
                            <div className="d-flex align-items-center gap-2 mb-2">
                              <span className="badge rounded-pill px-3 py-1 bg-success-subtle text-success border border-success-subtle fw-semibold">
                                <i className="bi bi-building me-1"></i> {loc("Virksomhed & Praksis (CVR)", "Company & Practice (CVR)")}
                              </span>
                              <span className="badge rounded-pill px-3 py-1 bg-secondary-subtle text-secondary border">
                                {loc("Adskilt fra personlige stamdata", "Separated from personal data")}
                              </span>
                            </div>
                            <h3 className="fw-bold text-dark mb-1">
                              {loc("Klinikindstillinger", "Clinic Settings")}
                            </h3>
                            <p className="text-muted small mb-0">
                              {loc(
                                "Her administrerer du den virksomhed og praksis, som du styrer eller er en del af som behandler.",
                                "Manage the clinic and business entity you run or are affiliated with as a healthcare provider."
                              )}
                            </p>
                          </div>
                        </div>

                        {clinicSavedMsg && (
                          <div className="alert alert-success rounded-4 shadow-xs mb-0 d-flex align-items-center gap-2">
                            <i className="bi bi-check-circle-fill fs-5"></i>
                            <span>{clinicSavedMsg}</span>
                          </div>
                        )}

                        {clinicErrorMsg && (
                          <div className="alert alert-danger rounded-4 shadow-xs mb-0 d-flex align-items-center gap-2">
                            <i className="bi bi-exclamation-octagon-fill fs-5"></i>
                            <span>{clinicErrorMsg}</span>
                          </div>
                        )}

                        {/* Notice on Master Data Separation */}
                        <div className="alert alert-info border-info border-opacity-25 rounded-4 p-3 shadow-xs mb-0 d-flex align-items-start gap-3">
                          <i className="bi bi-info-circle-fill fs-4 text-info mt-0.5"></i>
                          <div className="flex-grow-1">
                            <div className="fw-bold mb-1">
                              {loc("Adskillelse mellem person og virksomhed", "Separation between person and business entity")}
                            </div>
                            <div className="small text-secondary">
                              {loc(
                                "Dine personlige stamdata (sygesikring, CPR/fødselsdato, privat bopæl) holdes strengt adskilt fra virksomhedens data for at beskytte dit privatliv. Hvis du ønsker at redigere dine personlige oplysninger som privatperson/klient, kan du gøre det her: ",
                                "Your personal client master data (health insurance, CPR/DOB, private home address) is strictly separated from your business entity to protect privacy. If you wish to edit personal client details, you can do so here: "
                              )}
                              <Link href="/dashboard/settings" className="fw-semibold text-primary text-decoration-underline">
                                {loc("Gå til Personlige Stamdata (Klientprofil) →", "Go to Personal Master Data (Client Profile) →")}
                              </Link>
                            </div>
                          </div>
                        </div>

                        {/* Readiness Status Card */}
                        <div
                          className={`card border-0 shadow-xs rounded-4 ${
                            isComplete
                              ? "bg-success-subtle text-success-emphasis border border-success-subtle"
                              : "bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                          }`}
                        >
                          <div className="card-body p-3.5 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
                            <div className="d-flex align-items-center gap-3">
                              <span
                                className={`d-inline-flex align-items-center justify-content-center rounded-circle fs-5 ${
                                  isComplete ? "bg-success text-white" : "bg-warning text-dark"
                                }`}
                                style={{ width: "42px", height: "42px", minWidth: "42px" }}
                              >
                                <i className={`bi ${isComplete ? "bi-check2-circle" : "bi-shield-exclamation"}`}></i>
                              </span>
                              <div>
                                <h6 className="fw-bold mb-0.5">
                                  {isComplete
                                    ? loc(
                                        "Virksomhedsprofil komplet – Godkendt til at oprette og udbyde ydelser",
                                        "Clinic profile complete – Approved to create and offer services"
                                      )
                                    : loc(
                                        "Obligatoriske oplysninger før ydelser kan udbydes i servicekataloget",
                                        "Mandatory requirements before services can be offered in the catalog"
                                      )}
                                </h6>
                                <div className="small opacity-75">
                                  {isComplete
                                    ? loc(
                                        "Alle 6 krav for virksomheden (CVR, firmanavn, arbejdstider, praksisadresse, postnummer og telefon) er opfyldt.",
                                        "All 6 business requirements (CVR, clinic name, work hours, address, postal code, phone) are satisfied."
                                      )
                                    : loc(
                                        "Udfyld nedenstående felter for din virksomhed/klinik for at aktivere oprettelse af ydelser.",
                                        "Fill in the fields below for your clinic/business entity to unlock creating services."
                                      )}
                                </div>
                              </div>
                            </div>

                            <div className="d-flex flex-wrap gap-1.5 align-items-center">
                              <span className={`badge rounded-pill ${hasCvr ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasCvr ? "bi-check" : "bi-x"} me-1`}></i>CVR
                              </span>
                              <span className={`badge rounded-pill ${hasOrgName ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasOrgName ? "bi-check" : "bi-x"} me-1`}></i>{loc("Virksomhed", "Company")}
                              </span>
                              <span className={`badge rounded-pill ${hasWorkingHours ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasWorkingHours ? "bi-check" : "bi-x"} me-1`}></i>{loc("Arbejdstider", "Hours")}
                              </span>
                              <span className={`badge rounded-pill ${hasAddress ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasAddress ? "bi-check" : "bi-x"} me-1`}></i>{loc("Adresse", "Address")}
                              </span>
                              <span className={`badge rounded-pill ${hasPostalCode ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasPostalCode ? "bi-check" : "bi-x"} me-1`}></i>{loc("Postnr", "Zip")}
                              </span>
                              <span className={`badge rounded-pill ${hasPhone ? "bg-success text-white" : "bg-white text-danger border"}`}>
                                <i className={`bi ${hasPhone ? "bi-check" : "bi-x"} me-1`}></i>{loc("Telefon", "Phone")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Form */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSaveClinicSettings(e);
                          }}
                          id="clinic-settings-form"
                        >
                          <div className="card border rounded-4 bg-white mb-4 shadow-xs">
                            <div className="card-header bg-white border-bottom px-4 py-3">
                              <h6 className="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                                <i className="bi bi-buildings text-primary"></i>{" "}
                                {loc("1. Virksomhedsstamdata (CVR & Organisation)", "1. Business Master Data (CVR & Organisation)")}
                              </h6>
                              <div className="text-muted small">
                                {loc(
                                  "Oplysninger om klinikken eller det selskab, som administrerer ydelser og fakturering.",
                                  "Information about the clinic or legal entity that manages services and invoicing."
                                )}
                              </div>
                            </div>
                            <div className="card-body p-4">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label small fw-semibold">
                                    {loc("CVR-nummer (8 cifre)", "CVR Number (8 digits)")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    required
                                    maxLength={8}
                                    placeholder="f.eks. 39485712"
                                    value={clinicForm.cvrNumber}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, cvrNumber: e.target.value }));
                                    }}
                                  />
                                </div>
                                <div className="col-md-8">
                                  <label className="form-label small fw-semibold">
                                    {loc("Virksomhedsnavn / Kliniknavn", "Company / Clinic Name")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="f.eks. Nordic Mind & Trauma Klinik ApS"
                                    value={clinicForm.organisationName}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, organisationName: e.target.value }));
                                    }}
                                  />
                                </div>

                                <div className="col-md-8">
                                  <label className="form-label small fw-semibold">
                                    {loc("Klinikadresse / Praksisadresse", "Clinic / Practice Address")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="f.eks. Vester Voldgade 83, 2. th"
                                    value={clinicForm.address}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, address: e.target.value }));
                                    }}
                                  />
                                  <div className="form-text small">
                                    {loc("Den fysiske adresse hvor behandlinger og konsultationer afholdes.", "The physical address where treatments and consultations take place.")}
                                  </div>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label small fw-semibold">
                                    {loc("Klinik Postnummer & By", "Clinic Postal Code & City")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="f.eks. 1552 København V"
                                    value={clinicForm.postalCode}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, postalCode: e.target.value }));
                                    }}
                                  />
                                </div>

                                <div className="col-md-6">
                                  <label className="form-label small fw-semibold">
                                    {loc("Praksis Telefonnummer", "Practice Phone Number")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="tel"
                                    className="form-control"
                                    required
                                    placeholder="f.eks. +45 33 22 11 00"
                                    value={clinicForm.phoneNumber}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, phoneNumber: e.target.value }));
                                    }}
                                  />
                                  <div className="form-text small">
                                    {loc("Klinikkens telefonnummer til klienthenvendelser.", "Clinic contact phone number for client inquiries.")}
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <label className="form-label small fw-semibold">
                                    {loc("Virksomhedens Kontakt-e-mail", "Company Contact Email")}
                                  </label>
                                  <input
                                    type="email"
                                    className="form-control"
                                    placeholder="f.eks. kontakt@nordicmind.dk"
                                    value={clinicForm.email}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, email: e.target.value }));
                                    }}
                                  />
                                  <div className="form-text small">
                                    {loc("Officiel e-mail for praksissen.", "Official email address for the practice.")}
                                  </div>
                                </div>

                                <div className="col-12">
                                  <label className="form-label small fw-semibold d-flex align-items-center gap-1.5">
                                    <i className="bi bi-camera-video text-info"></i>
                                    <span>{loc("Fast Online Videolink (Google Meet, Whereby, Teams, Zoom osv.)", "Permanent Online Video Link (Google Meet, Whereby, Teams, Zoom, etc.)")}</span>
                                  </label>
                                  <div className="input-group">
                                    <span className="input-group-text bg-light text-muted">
                                      <i className="bi bi-link-45deg"></i>
                                    </span>
                                    <input
                                      type="url"
                                      className="form-control"
                                      placeholder="f.eks. https://meet.google.com/xyz-abcd-efg eller https://whereby.com/din-klinik"
                                      value={clinicForm.videoMeetingUrl}
                                      onChange={(e) => {
                                        setIsClinicFormDirty(true);
                                        setClinicForm((prev) => ({ ...prev, videoMeetingUrl: e.target.value }));
                                      }}
                                    />
                                  </div>
                                  <div className="form-text small">
                                    {loc(
                                      "Dette link anvendes automatisk til alle online konsultationer og services. Både du og klienten vil altid have direkte adgang til dette faste videolink.",
                                      "This link is automatically used for all online consultations and services. Both you and the client will always have direct access to this permanent video link."
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. BEHANDLERPROFIL (THERAPIST PROFILE) */}
                          <div className="card border rounded-4 bg-white mb-4 shadow-xs">
                            <div className="card-header bg-white border-bottom px-4 py-3">
                              <h6 className="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                                <i className="bi bi-person-badge text-primary"></i>{" "}
                                {loc("2. Behandlerprofil", "2. Therapist Profile")}
                              </h6>
                              <div className="text-muted small">
                                {loc(
                                  "Oplysninger om din faglige rolle i klinikken, visningsnavn og faglige specialer.",
                                  "Details on your clinical role, professional title, and clinical specialties."
                                )}
                              </div>
                            </div>
                            <div className="card-body p-4">
                              <div className="row g-3">
                                <div className="col-12">
                                  <label className="form-label small fw-semibold">
                                    {loc("Terapeut Visningsnavn & Titel", "Therapist Display Name & Title")} <span className="text-danger">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    required
                                    placeholder="f.eks. Thomas Skov, Aut. Psykolog"
                                    value={clinicForm.displayName}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, displayName: e.target.value }));
                                    }}
                                  />
                                  <div className="form-text small">
                                    {loc("Det faglige navn der præsenteres for klienter på markedspladsen.", "Professional name presented to clients on the marketplace.")}
                                  </div>
                                </div>
                                <div className="col-12">
                                  <label className="form-label small fw-semibold">
                                    {loc("Klinisk Biografi & Faglige Specialer", "Clinical Biography & Specialties")}
                                  </label>
                                  <textarea
                                    rows={4}
                                    className="form-control"
                                    placeholder="Beskriv klinikkens metoder, terapeutiske tilgange og specialer..."
                                    value={clinicForm.biography}
                                    onChange={(e) => {
                                      setIsClinicFormDirty(true);
                                      setClinicForm((prev) => ({ ...prev, biography: e.target.value }));
                                    }}
                                  />
                                  <div className="form-text small">
                                    {loc("Vises i klinikkens profil i markedspladskataloget.", "Displayed on the clinic's marketplace profile.")}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 3. ARBEJDSTIDER & TIDSPLAN (WORKING HOURS) */}
                          <div className="card border rounded-4 bg-white mb-4 shadow-xs">
                            <div className="card-header bg-white border-bottom px-4 py-3">
                              <h6 className="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                                <i className="bi bi-clock-history text-teal"></i>{" "}
                                {loc("3. Arbejdstider & Tidsplan", "3. Working Hours & Schedule")}
                              </h6>
                              <div className="text-muted small">
                                {loc(
                                  "Definer dine ugentlige arbejdstider, pauser og bookingintervaller direkte på den visuelle 2D tidslinje.",
                                  "Define your weekly working hours, breaks, and booking windows directly on the visual 2D timeline."
                                )}
                              </div>
                            </div>
                            <div className="card-body p-4">
                              <WeeklyScheduleManager
                                value={clinicForm.workingHoursJson}
                                onChange={(newJson) => {
                                  setIsClinicFormDirty(true);
                                  setClinicForm((prev) => ({ ...prev, workingHoursJson: newJson }));
                                }}
                              />
                            </div>
                          </div>

                        </form>
                      </div>
                    );
                  })()}
                </Tabs.Panel>
              </>
            )}
              </div>
            </div>
            {/* Appointment Details & Reschedule Modal Dialog */}
            <Dialog.Root
              open={!!selectedAppointmentModal}
              onOpenChange={(open) => {
                if (!open) setSelectedAppointmentModal(null);
              }}
            >
              <Dialog.Portal>
                <Dialog.Backdrop className="base-dialog-backdrop" />
                <Dialog.Popup className="base-dialog-popup p-4">
                  {selectedAppointmentModal && (() => {
                    const apt = selectedAppointmentModal;
                    const clientObj = overview.clients.find(
                      (c: any) => c.uuid === apt.clientUuid
                    );
                    const isPast =
                      String(apt.startTime).slice(0, 19) <
                      new Date().toISOString().slice(0, 19);

                    return (
                      <div className="d-flex flex-column gap-3">
                        <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
                          <div>
                            <span className="badge bg-primary-subtle text-primary rounded-pill px-2.5 py-1 mb-1 small fw-semibold">
                              <i className="bi bi-calendar-event me-1"></i>
                              {loc("Aftaledetaljer", "Appointment Details")}
                            </span>
                            <h5 className="fw-bold mb-0 text-dark">{apt.title}</h5>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedAppointmentModal(null)}
                            className="btn btn-sm btn-light rounded-circle p-1 d-flex align-items-center justify-content-center"
                            style={{ width: "32px", height: "32px" }}
                            aria-label={loc("Luk", "Close")}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Client & Service Info */}
                        <div className="p-3 rounded-3 bg-light border">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <div className="small text-muted">{loc("Klient", "Client")}</div>
                              <h6 className="fw-bold text-dark mb-0">
                                {apt.clientName || clientObj?.name || "Klient"}
                              </h6>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAppointmentModal(null);
                                  const aptRefKey = `studio_shared_${apt.clientUuid}`;
                                  const aptRefKeyConf = `studio_confidential_${apt.clientUuid}`;
                                  const refObj: LinkedReferenceSelection = {
                                    type: "APPOINTMENT",
                                    appointmentId: apt.id,
                                    appointmentTitle: apt.title,
                                    appointmentDate: String(apt.startTime).replace("T", " ").slice(0, 16),
                                  };
                                  setSelectedRefByKey((prev) => ({
                                    ...prev,
                                    [aptRefKey]: refObj,
                                    [aptRefKeyConf]: refObj,
                                  }));
                                  setActiveTherapistTab("jgit_studio");
                                  setIsStudioComposerOpen(true);
                                }}
                                className="btn btn-sm btn-primary rounded-pill px-3 shadow-xs fw-semibold"
                              >
                                <i className="bi bi-pencil-square me-1"></i>
                                {loc("+ Skriv Journalnotat til aftale", "+ Write Note for Appointment")}
                              </button>
                            </div>
                          </div>

                          <div className="small text-secondary d-flex flex-wrap gap-2 mt-2">
                            <span>
                              <i className="bi bi-briefcase me-1"></i>
                              {apt.serviceName || apt.title}
                            </span>
                            {apt.location && (() => {
                              const isOnline =
                                apt.location.toLowerCase().includes("online") ||
                                apt.location.toLowerCase().includes("video") ||
                                Boolean(apt.videoMeetingUrl);
                              const rawUrl =
                                apt.videoMeetingUrl ||
                                (apt.location.includes("http") ? apt.location.replace(/^Online:\s*/i, "").trim() : "");
                              const videoUrl = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : "";

                              return (
                                <div className={`alert ${isOnline ? "alert-info border-info-subtle" : "alert-light border-danger-subtle"} d-flex align-items-center justify-content-between gap-2 py-2 px-3 my-2 rounded-3 w-100`}>
                                  <div className="d-flex align-items-center gap-2 overflow-hidden">
                                    <i className={`bi ${isOnline ? "bi-camera-video-fill text-info" : "bi-geo-alt-fill text-danger"} fs-5 flex-shrink-0`}></i>
                                    <div>
                                      <div className="small text-muted fw-semibold" style={{ fontSize: "0.72rem" }}>
                                        {isOnline ? loc("Online Videolink", "Online Video Link") : loc("Mødested / Adresse for sessionen", "Session Location / Address")}
                                      </div>
                                      <div className="fw-bold text-dark text-truncate" style={{ maxWidth: "340px" }}>{apt.location}</div>
                                    </div>
                                  </div>
                                  {videoUrl && (
                                    <a
                                      href={videoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-sm btn-info text-white rounded-pill px-3 py-1 fw-bold shadow-2xs flex-shrink-0"
                                    >
                                      <i className="bi bi-camera-video me-1.5"></i>
                                      {loc("Start / Deltag", "Start / Join")}
                                    </a>
                                  )}
                                </div>
                              );
                            })()}
                            {apt.price != null && apt.price !== "" && (
                              <span>• <i className="bi bi-cash me-1"></i>{apt.price} DKK</span>
                            )}
                          </div>

                          <div className="small fw-semibold text-success mt-2 pt-2 border-top">
                            <i className="bi bi-clock me-1"></i>
                            {loc("Tidspunkt:", "Time:")}{" "}
                            {String(apt.startTime).replace("T", " kl. ").slice(0, 19)}
                          </div>
                        </div>

                        {/* Reschedule or Past Lock */}
                        <div className="p-3 rounded-3 border bg-white">
                          {isPast ? (
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <div className="small fw-bold text-secondary">
                                  <i className="bi bi-lock-fill me-1"></i>
                                  {loc("Historisk Aftale (Låst)", "Past Appointment (Locked)")}
                                </div>
                                <div className="text-muted small">
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
                                  "Flyt Aftale",
                                  "Reschedule Appointment"
                                )}
                              </div>
                              {(() => {
                                const currentRescheduleDate =
                                  rescheduleDates[apt.id] || String(apt.startTime).slice(0, 10);
                                const currentRescheduleSlot =
                                  rescheduleSlots[apt.id] || String(apt.startTime).slice(11, 16) || "10:00";
                                const daySched = getScheduleForDate(therapistWeeklySchedule, currentRescheduleDate);
                                const collision = checkCollisionWithBreak(daySched, currentRescheduleSlot);

                                return (
                                  <>
                                    {collision.collides && collision.breakInfo && (
                                      <div className="alert alert-warning py-2 px-3 small rounded-3 mb-2 d-flex align-items-center gap-2">
                                        <i className="bi bi-exclamation-triangle-fill text-warning flex-shrink-0"></i>
                                        <div>
                                          <strong>{loc("Pause-advarsel:", "Break warning:")}</strong>{" "}
                                          {loc(
                                            `Kl. ${currentRescheduleSlot} ligger i din planlagte pause (${collision.breakInfo.start} – ${collision.breakInfo.end}). Som behandler kan du gemme alligevel.`,
                                            `Time ${currentRescheduleSlot} is during your scheduled break (${collision.breakInfo.start} – ${collision.breakInfo.end}). As a therapist, you may override and save anyway.`
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    <div className="row g-2 mb-3">
                                      <div className="col-7">
                                        <label className="form-label small text-muted mb-1">
                                          {loc("Dato", "Date")}
                                        </label>
                                        <input
                                          type="date"
                                          className="form-control form-control-sm"
                                          min={new Date().toISOString().slice(0, 10)}
                                          value={
                                            rescheduleDates[apt.id] ||
                                            String(apt.startTime).slice(0, 10)
                                          }
                                          onChange={(e) =>
                                            setRescheduleDates((prev) => ({
                                              ...prev,
                                              [apt.id]: e.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <div className="col-5">
                                        <label className="form-label small text-muted mb-1">
                                          {loc("Tidspunkt (5 min)", "Time (5 min)")}
                                        </label>
                                        <input
                                          type="time"
                                          step="300"
                                          className="form-control form-control-sm text-center fw-semibold"
                                          value={
                                            rescheduleSlots[apt.id] ||
                                            String(apt.startTime).slice(11, 16) ||
                                            "10:00"
                                          }
                                          onChange={(e) =>
                                            setRescheduleSlots((prev) => ({
                                              ...prev,
                                              [apt.id]: roundTo5Min(e.target.value),
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                  </>
                                );
                              })()}
                              <div className="d-flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRescheduleAppointment(apt)}
                                  className="btn btn-sm btn-primary flex-grow-1 rounded-pill"
                                >
                                  {loc("Gem Nyt Tidspunkt", "Save New Time")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAppointment(apt.id)}
                                  className="btn btn-sm btn-outline-danger rounded-pill px-3"
                                >
                                  {loc("Aflys", "Cancel")}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            {/* Journal Note Creation Modal Dialog (Pop-up Window) */}
            <Dialog.Root
              open={isStudioComposerOpen}
              onOpenChange={(open) => setIsStudioComposerOpen(open)}
            >
              <Dialog.Portal>
                <Dialog.Backdrop className="base-dialog-backdrop" />
                <Dialog.Popup
                  className="base-dialog-popup p-0 overflow-hidden"
                  style={{
                    maxWidth: "700px",
                    width: "95vw",
                    borderRadius: "16px",
                  }}
                >
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
                      <div>
                        {/* Header */}
                        <div
                          className="p-3.5 px-4 border-bottom d-flex justify-content-between align-items-center"
                          style={{
                            background:
                              studioComposerTab === "CONFIDENTIAL"
                                ? "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
                                : "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
                            borderColor: studioComposerTab === "CONFIDENTIAL" ? "#f59e0b" : "#8b5cf6",
                          }}
                        >
                          <div className="d-flex align-items-center gap-2.5">
                            <div
                              className="d-flex align-items-center justify-content-center rounded-circle text-white shadow-2xs"
                              style={{
                                width: "36px",
                                height: "36px",
                                backgroundColor:
                                  studioComposerTab === "CONFIDENTIAL" ? "#b45309" : "#6d28d9",
                              }}
                            >
                              <i
                                className={`bi ${
                                  studioComposerTab === "CONFIDENTIAL"
                                    ? "bi-lock-fill"
                                    : "bi-journal-plus"
                                } fs-5`}
                              ></i>
                            </div>
                            <div>
                              <h5 className="fw-bold mb-0 text-dark">
                                {loc("Opret Journalnotat", "Create Journal Note")}
                              </h5>
                              <div className="small text-muted" style={{ fontSize: "0.78rem" }}>
                                {loc("Klient:", "Client:")}{" "}
                                <strong>{activeStudioClient?.name || "Klient"}</strong>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsStudioComposerOpen(false)}
                            className="btn btn-sm btn-light rounded-circle p-1 d-flex align-items-center justify-content-center border"
                            style={{ width: "32px", height: "32px" }}
                            aria-label={loc("Luk", "Close")}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Body */}
                        <div className="p-4 d-flex flex-column gap-3 bg-white">
                          {/* Mode Switcher */}
                          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-1.5 rounded-3 bg-light border">
                            <div className="d-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setStudioComposerTab("SHARED")}
                                className="btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all"
                                style={{
                                  backgroundColor:
                                    studioComposerTab === "SHARED" ? "#453578" : "transparent",
                                  color: studioComposerTab === "SHARED" ? "#ffffff" : "#453578",
                                  fontSize: "0.82rem",
                                }}
                              >
                                <i className="bi bi-people-fill me-1.5"></i>
                                {loc("Delt opfølgning (Lilla spor)", "Shared Follow-up (Purple Lane)")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setStudioComposerTab("CONFIDENTIAL")}
                                className="btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition-all"
                                style={{
                                  backgroundColor:
                                    studioComposerTab === "CONFIDENTIAL" ? "#6e4720" : "transparent",
                                  color:
                                    studioComposerTab === "CONFIDENTIAL" ? "#ffffff" : "#6e4720",
                                  fontSize: "0.82rem",
                                }}
                              >
                                🔒 {loc("Fortroligt klinisk notat (Rav/Guld)", "Confidential Note (Amber Lane)")}
                              </button>
                            </div>

                            <div>
                              {studioComposerTab === "SHARED" ? (
                                <span
                                  className="badge rounded-pill px-2.5 py-1"
                                  style={{
                                    backgroundColor: "#ddd6fe",
                                    color: "#453578",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  <i className="bi bi-eye me-1"></i>{" "}
                                  {loc("Synlig for", "Visible to")} {activeStudioClient?.name}
                                </span>
                              ) : (
                                <span
                                  className="badge rounded-pill px-2.5 py-1"
                                  style={{
                                    backgroundColor: "#fde68a",
                                    color: "#6e4720",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  🔒 {loc("KUN TERAPEUTER", "THERAPISTS ONLY")}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Client Selector (if multiple clients exist) */}
                          {overview.clients.length > 1 && (
                            <div className="d-flex align-items-center justify-content-between p-2 px-3 rounded-3 bg-light border small">
                              <span className="text-muted fw-semibold">
                                <i className="bi bi-person me-1"></i>
                                {loc("Valgt klient til notatet:", "Selected client for note:")}
                              </span>
                              <select
                                className="form-select form-select-sm w-auto fw-bold"
                                value={effectiveStudioUuid}
                                onChange={(e) => setSelectedStudioClientUuid(e.target.value)}
                              >
                                {overview.clients.map((c: any) => (
                                  <option key={c.uuid} value={c.uuid}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Commit / Appointment Linker & Textarea */}
                          {studioComposerTab === "SHARED" ? (
                            <>
                              <CommitLinkerSelector
                                clientUuid={effectiveStudioUuid}
                                clientName={activeStudioClient?.name || "Klient"}
                                appointments={overview.appointments}
                                commits={studioCommits}
                                selectedRef={
                                  selectedRefByKey[`studio_shared_${effectiveStudioUuid}`] || null
                                }
                                onSelectRef={(ref) =>
                                  setSelectedRefByKey((prev) => ({
                                    ...prev,
                                    [`studio_shared_${effectiveStudioUuid}`]: ref,
                                  }))
                                }
                                loc={loc}
                              />
                              <div>
                                <label className="form-label small fw-bold text-dark mb-1">
                                  {loc("Journaltekst (Delt med klient):", "Journal Content (Shared with client):")}
                                </label>
                                <textarea
                                  rows={5}
                                  className="form-control bg-white border rounded-3"
                                  style={{ fontSize: "0.88rem" }}
                                  placeholder={loc(
                                    `Skriv delt terapeutisk opfølgning til ${activeStudioClient?.name || "klienten"} (vises på det lilla Terapeut-spor i 2D-tidslinjen)...`,
                                    `Write shared therapeutic follow-up for ${activeStudioClient?.name || "the client"} (shown on the purple Therapist lane in the 2D timeline)...`
                                  )}
                                  value={sharedDrafts[effectiveStudioUuid] || ""}
                                  onChange={(e) =>
                                    setSharedDrafts((prev) => ({
                                      ...prev,
                                      [effectiveStudioUuid]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <CommitLinkerSelector
                                clientUuid={effectiveStudioUuid}
                                clientName={activeStudioClient?.name || "Klient"}
                                appointments={overview.appointments}
                                commits={studioCommits}
                                selectedRef={
                                  selectedRefByKey[`studio_confidential_${effectiveStudioUuid}`] || null
                                }
                                onSelectRef={(ref) =>
                                  setSelectedRefByKey((prev) => ({
                                    ...prev,
                                    [`studio_confidential_${effectiveStudioUuid}`]: ref,
                                  }))
                                }
                                loc={loc}
                              />
                              <div>
                                <label className="form-label small fw-bold text-dark mb-1">
                                  🔒 {loc("Fortrolig observation (KUN behandler):", "Confidential observation (Therapist ONLY):")}
                                </label>
                                <textarea
                                  rows={5}
                                  className="form-control bg-white border rounded-3"
                                  style={{ fontSize: "0.88rem" }}
                                  placeholder={loc(
                                    `Skriv fortrolig klinisk observation om ${activeStudioClient?.name || "klienten"} (skjult for klienten — gemmes på '🔒 Fortroligt klinisk spor')...`,
                                    `Write confidential clinical observation about ${activeStudioClient?.name || "the client"} (hidden from client — saved on '🔒 Confidential Clinical Lane')...`
                                  )}
                                  value={confidentialDrafts[effectiveStudioUuid] || ""}
                                  onChange={(e) =>
                                    setConfidentialDrafts((prev) => ({
                                      ...prev,
                                      [effectiveStudioUuid]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 px-4 bg-light border-top d-flex justify-content-between align-items-center">
                          <button
                            type="button"
                            onClick={() => setIsStudioComposerOpen(false)}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3.5 py-1.5"
                          >
                            {loc("Annuller", "Cancel")}
                          </button>

                          {studioComposerTab === "SHARED" ? (
                            <button
                              type="button"
                              disabled={!(sharedDrafts[effectiveStudioUuid] || "").trim()}
                              onClick={async () => {
                                await handleSaveSharedEntry(
                                  effectiveStudioUuid,
                                  activeStudioClient?.name || "Klient",
                                  `studio_shared_${effectiveStudioUuid}`
                                );
                                setIsStudioComposerOpen(false);
                              }}
                              className="btn btn-sm rounded-pill px-4 py-2 fw-bold text-white shadow-xs"
                              style={{ backgroundColor: "#453578" }}
                            >
                              <i className="bi bi-check2-circle me-1.5"></i>{" "}
                              {loc("Gem delt opfølgning i journal", "Save shared follow-up to journal")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!(confidentialDrafts[effectiveStudioUuid] || "").trim()}
                              onClick={async () => {
                                await handleSaveConfidentialNote(
                                  effectiveStudioUuid,
                                  activeStudioClient?.name || "Klient",
                                  `studio_confidential_${effectiveStudioUuid}`
                                );
                                setIsStudioComposerOpen(false);
                              }}
                              className="btn btn-sm rounded-pill px-4 py-2 fw-bold text-white shadow-xs"
                              style={{ backgroundColor: "#6e4720" }}
                            >
                              🔒 {loc("Gem fortroligt notat i journal", "Save confidential note to journal")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </Tabs.Root>
    </div>
  );
}

