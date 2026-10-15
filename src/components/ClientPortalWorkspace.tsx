"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { useLocale, useTranslations } from "next-intl";
import JGitHistoryTimeline from "@/components/JGitHistoryTimeline";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

const PCL5_QUESTIONS_DA = [
  "Gentagne, forstyrrende og uønskede erindringer om en belastende oplevelse?",
  "Gentagne, forstyrrende drømme eller søvnvanskeligheder relateret til belastning?",
  "Pludselig følelse af eller handling som om den belastende hændelse skete igen?",
  "Stærk følelsesmæssig uro eller fysiske reaktioner ved påmindelser?",
  "Undgåelse af bestemte tanker, følelser eller eksterne påmindelser?",
];

const PCL5_QUESTIONS_EN = [
  "Repeated, disturbing, and unwanted memories of a stressful experience?",
  "Repeated, disturbing dreams or sleep difficulties related to stress?",
  "Suddenly feeling or acting as if the stressful experience were actually happening again?",
  "Feeling very upset or having strong physical reactions when reminded of the experience?",
  "Avoiding memories, thoughts, feelings, or external reminders of the experience?",
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
  const [timefoldBookingPlan, setTimefoldBookingPlan] = useState<any | null>(null);
  const [loadingTimefoldBooking, setLoadingTimefoldBooking] = useState(false);

  // Reschedule Dialog State
  const [rescheduleTarget, setRescheduleTarget] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("11:00");
  const [timefoldReschedulePlan, setTimefoldReschedulePlan] = useState<any | null>(null);

  // Journal Composer State
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalMood, setJournalMood] = useState(7);
  const [sharedWithTherapists, setSharedWithTherapists] = useState(true);
  const [selectedTherapistUuids, setSelectedTherapistUuids] = useState<string[]>([]);
  const [initializedTherapistSelection, setInitializedTherapistSelection] = useState(false);

  // Per-entry Individual Access Editor State + Collapsible Lists
  const [editingSharingEntryId, setEditingSharingEntryId] = useState<string | null>(null);
  const [savingSharingEntryId, setSavingSharingEntryId] = useState<string | null>(null);
  const [showAllJournals, setShowAllJournals] = useState(false);
  const [showAllPcl5, setShowAllPcl5] = useState(false);

  // Active Client Sub-page Tab State + JGit Version History Window State
  const [activeClientTab, setActiveClientTab] = useState<string>("timeline");
  const [gitHistory, setGitHistory] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);

  // PCL-5 Questionnaire State
  const [pclAnswers, setPclAnswers] = useState<number[]>([1, 1, 1, 1, 1]);

  // Client Monthly Calendar State (for My Appointments tab)
  const [clientMonthDate, setClientMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const isEn = locale === "en";
  const loc = (daText: string, enText: string) => (isEn ? enText : daText);
  const PCL5_QUESTIONS = isEn ? PCL5_QUESTIONS_EN : PCL5_QUESTIONS_DA;

  const showMessage = (type: "success" | "danger" | "info", text: string) => {
    setStatusAlert({ type, text });
    setTimeout(() => setStatusAlert(null), 5000);
  };

  const fetchDatabaseData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const meRes = await fetch("/api/backend/clinic/me");
      if (!meRes.ok) {
        if (!silent) setLoading(false);
        return;
      }
      const meData = await meRes.json();
      setMe(meData);

      const [ovRes, bundleRes, gitRes] = await Promise.all([
        fetch(`/api/backend/clinic/client/${meData.userUuid}/overview`),
        fetch(`/api/backend/journals/client/${meData.userUuid}`).catch(() => null),
        fetch(`/api/backend/journals/history/${meData.userUuid}`).catch(() => null),
      ]);

      if (gitRes && gitRes.ok) {
        const gData = await gitRes.json().catch(() => null);
        if (Array.isArray(gData)) {
          setGitHistory(gData);
          setSelectedCommit((prev: any) => prev || gData[0] || null);
        }
      }

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
        const rawServices = Array.isArray(ovData.services) ? ovData.services : [];
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
          clientProfile: ovData.clientProfile || meData.clientProfile,
          providerProfile: ovData.providerProfile || meData.providerProfile,
          appointments: Array.isArray(ovData.appointments) ? ovData.appointments : [],
          handshakes: loadedHandshakes,
          journals: mergedJournals,
          pcl5Tests: Array.isArray(ovData.pcl5Tests) ? ovData.pcl5Tests : [],
          providers: Array.isArray(ovData.providers) ? ovData.providers : [],
          services: uniqueServices,
        });

        const activeHsUuids = loadedHandshakes
          .filter((h: any) => h.status === "ACTIVE" && h.therapistUuid)
          .map((h: any) => String(h.therapistUuid));
        setInitializedTherapistSelection((alreadyInit) => {
          if (!alreadyInit && activeHsUuids.length > 0) {
            setSelectedTherapistUuids(activeHsUuids);
            return true;
          }
          return alreadyInit;
        });

        if (uniqueServices.length > 0) {
          setSelectedServiceId((prev) => prev || uniqueServices[0].id);
        }
      }
    } catch {
      if (!silent) {
        showMessage(
          "danger",
          isEn
            ? "Could not load data from the backend database."
            : "Kunne ikke hente data fra backend-databasen."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    fetchDatabaseData(false);
  }, [fetchDatabaseData]);

  // Fetch Timefold Solver optimal slots when booking service or date changes
  useEffect(() => {
    const serviceObj = overview.services.find((s: any) => s.id === selectedServiceId);
    const therapistUuid =
      serviceObj?.provider?.userUuid || overview.providers[0]?.userUuid;
    if (!therapistUuid || !bookingDate) {
      setTimefoldBookingPlan(null);
      return;
    }
    const duration = Number(serviceObj?.durationMinutes || 60);
    let cancelled = false;
    setLoadingTimefoldBooking(true);
    fetch(
      `/api/backend/appointments/timefold-slots?therapistUuid=${encodeURIComponent(
        therapistUuid
      )}&date=${encodeURIComponent(bookingDate)}&durationMinutes=${duration}&preferredTime=${encodeURIComponent(
        bookingSlot
      )}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setTimefoldBookingPlan(data);
        }
      })
      .catch(() => {
        if (!cancelled) setTimefoldBookingPlan(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTimefoldBooking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServiceId, bookingDate, bookingSlot, overview.services, overview.providers]);

  // Fetch Timefold Solver optimal slots when rescheduling an appointment
  useEffect(() => {
    if (!rescheduleTarget?.therapistUuid || !rescheduleDate) {
      setTimefoldReschedulePlan(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/backend/appointments/timefold-slots?therapistUuid=${encodeURIComponent(
        rescheduleTarget.therapistUuid
      )}&date=${encodeURIComponent(rescheduleDate)}&durationMinutes=60&preferredTime=${encodeURIComponent(
        rescheduleSlot
      )}&excludeAppointmentId=${encodeURIComponent(rescheduleTarget.id)}`,
      { cache: "no-store" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setTimefoldReschedulePlan(data);
        }
      })
      .catch(() => {
        if (!cancelled) setTimefoldReschedulePlan(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rescheduleTarget, rescheduleDate, rescheduleSlot]);

  // Book Appointment (Bilag 5.1.4 + Q3 + Q9)
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;

    const serviceObj = overview.services.find((s: any) => s.id === selectedServiceId);
    const therapistUuid =
      serviceObj?.provider?.userUuid ||
      overview.providers[0]?.userUuid;

    if (!therapistUuid) {
      showMessage(
        "danger",
        loc(
          "Ingen tilgængelig terapeut fundet for den valgte ydelse.",
          "No available therapist found for the selected service."
        )
      );
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
          title: serviceObj ? serviceObj.name : loc("Klinisk Samtale", "Clinical Session"),
          status: "SCHEDULED",
        }),
      });

      if (res.status === 409) {
        showMessage(
          "danger",
          loc(
            "409 Conflict: Dette tidsrum er allerede optaget hos terapeuten. Vælg venligst et andet tidspunkt.",
            "409 Conflict: This time slot is already booked with the therapist. Please choose another time."
          )
        );
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
        loc(
          `Aftale booket d. ${bookingDate} kl. ${bookingSlot}${grantHandshakeOnBook ? " inkl. aktivt Handshake-samtykke" : ""}.`,
          `Appointment booked on ${bookingDate} at ${bookingSlot}${grantHandshakeOnBook ? " including active Handshake consent" : ""} (Aftale booket).`
        )
      );
    } catch {
      showMessage("danger", loc("Kunne ikke gennemføre bookingen.", "Could not complete the booking."));
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
        showMessage(
          "danger",
          loc(
            "409 Conflict: Det valgte tidsrum er allerede optaget.",
            "409 Conflict: The selected time slot is already booked."
          )
        );
        return;
      }
      if (res.status === 400) {
        showMessage(
          "danger",
          loc(
            "400 Bad Request: Aftaler i fortiden kan ikke flyttes, og nyt tidspunkt skal ligge i fremtiden.",
            "400 Bad Request: Past appointments cannot be rescheduled, and the new time must be in the future."
          )
        );
        return;
      }
      if (!res.ok) {
        throw new Error("Fejl ved flytning");
      }

      setRescheduleTarget(null);
      await fetchDatabaseData();
      showMessage(
        "success",
        loc(
          `Aftalen er flyttet til ${rescheduleDate} kl. ${rescheduleSlot}.`,
          `Appointment rescheduled to ${rescheduleDate} at ${rescheduleSlot} (Aftalen er flyttet).`
        )
      );
    } catch {
      showMessage("danger", loc("Kunne ikke flytte aftalen.", "Could not reschedule the appointment."));
    }
  };

  // Cancel Appointment (DELETE /api/v1/appointments/{id})
  const handleCancelAppointment = async (id: string) => {
    try {
      const res = await fetch(`/api/backend/appointments/${id}`, { method: "DELETE" });
      if (res.status === 400) {
        showMessage(
          "danger",
          loc("Aftaler i fortiden kan ikke aflyses.", "Past appointments cannot be cancelled.")
        );
        return;
      }
      await fetchDatabaseData();
      showMessage(
        "info",
        loc("Aftalen er aflyst i databasen.", "Appointment cancelled in the database (Aftalen er aflyst).")
      );
    } catch {
      showMessage("danger", loc("Kunne ikke aflyse aftalen.", "Could not cancel the appointment."));
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
        showMessage(
          "success",
          loc(
            "Dagbogsindlæg gemt i PostgreSQL og committet til JGit.",
            "Journal entry saved in PostgreSQL and committed to JGit (Dagbogsindlæg gemt)."
          )
        );
      }
    } catch {
      showMessage("danger", loc("Kunne ikke gemme dagbogsindlæg.", "Could not save journal entry."));
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
            ? loc(
                "Adgang til dagbogsindlæg opdateret for de valgte terapeuter.",
                "Journal entry sharing updated for the selected therapists."
              )
            : loc(
                "Dagbogsindlæg er nu sat som privat (skjult for alle terapeuter).",
                "Journal entry is now private (hidden from all therapists)."
              )
        );
      }
    } catch {
      showMessage(
        "danger",
        loc(
          "Kunne ikke opdatere delingsindstillinger for indlægget.",
          "Could not update sharing settings for the entry."
        )
      );
    } finally {
      setSavingSharingEntryId(null);
    }
  };

  // Open JGit Version History Window (GET /api/v1/journals/history/{clientUuid})
  const handleOpenGitHistory = async (focusCommitHash?: string) => {
    setActiveClientTab("jgit_timeline");
    if (!me?.userUuid) return;
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
          ? loc(
              "Handshake accepteret. Terapeuten har nu adgang til dine delte journalindlæg.",
              "Handshake accepted. The therapist now has access to your shared journal entries."
            )
          : loc(
              "Adgang tilbagekaldt (Soft Revoke). Terapeuten har ikke længere adgang, men historiske kliniske noter bevares.",
              "Access revoked (Soft Revoke). The therapist no longer has access, while historical clinical records are preserved."
            )
      );
    } catch {
      showMessage(
        "danger",
        loc("Kunne ikke opdatere Handshake-status.", "Could not update Handshake status.")
      );
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

    const activeHandshakeTherapistUuid =
      overview.handshakes.find((h: any) => h.status === "ACTIVE" && h.therapistUuid)
        ?.therapistUuid ||
      overview.providers[0]?.userUuid ||
      me.userUuid;

    try {
      const res = await fetch("/api/backend/psychotraumatology/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: me.userUuid,
          therapistUuid: activeHandshakeTherapistUuid,
          testType: "PCL-5",
          score: scaledScore,
          severity,
          answersJson: JSON.stringify(pclAnswers),
        }),
      });
      if (res.ok) {
        await fetchDatabaseData();
        showMessage(
          "success",
          loc(
            `PCL-5 tjek-ind gemt i databasen (Score: ${scaledScore}/80 — ${severity}).`,
            `PCL-5 check-in saved in database (Score: ${scaledScore}/80 — ${severity}).`
          )
        );
      }
    } catch {
      showMessage(
        "danger",
        loc("Kunne ikke gemme PCL-5 besvarelse.", "Could not save PCL-5 assessment.")
      );
    }
  };

  // Filter out confidential therapist-only commits so client sidebar/header count matches JGitHistoryTimeline
  const clientVisibleCommits = gitHistory.filter((c: any) => {
    const msg = String(c?.message || "");
    if (
      msg.includes("CONFIDENTIAL_THERAPIST_NOTE") ||
      msg.includes("Fortrolig terapeutnote") ||
      msg.toLowerCase().includes("internal medical note")
    ) {
      return false;
    }
    return true;
  });

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

  // Build Client Monthly Calendar Grid Days + Upcoming vs Past Appointments
  const nowIso = new Date().toISOString();
  const todayDateStr = nowIso.slice(0, 10);
  const nowComparable = nowIso.slice(0, 19);
  const sortedActiveAppointments = [...activeAppointments].sort((a, b) =>
    String(a.startTime || "").localeCompare(String(b.startTime || ""))
  );
  const upcomingAppointments = sortedActiveAppointments.filter(
    (a: any) => String(a.startTime || "").slice(0, 19) >= nowComparable
  );
  const pastAppointments = sortedActiveAppointments
    .filter((a: any) => String(a.startTime || "").slice(0, 19) < nowComparable)
    .reverse();
  const nextAppointment = upcomingAppointments[0] || null;
  const nextAppointmentDateStr = nextAppointment
    ? String(nextAppointment.startTime).slice(0, 10)
    : null;

  const calYear = clientMonthDate.getFullYear();
  const calMonth = clientMonthDate.getMonth();
  const daysInClientMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstClientWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;

  const clientDailyAptCounts: Record<string, number> = {};
  for (const apt of activeAppointments) {
    const dStr = String(apt.startTime || "").slice(0, 10);
    if (dStr) {
      clientDailyAptCounts[dStr] = (clientDailyAptCounts[dStr] || 0) + 1;
    }
  }

  const clientCalendarCells: Array<{
    dateStr: string;
    dayNum: number;
    count: number;
    isPast: boolean;
    isNextAptDate: boolean;
  } | null> = [];
  for (let i = 0; i < firstClientWeekday; i++) {
    clientCalendarCells.push(null);
  }
  for (let day = 1; day <= daysInClientMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const count = clientDailyAptCounts[dateStr] || 0;
    clientCalendarCells.push({
      dateStr,
      dayNum: day,
      count,
      isPast: dateStr < todayDateStr,
      isNextAptDate: dateStr === nextAppointmentDateStr,
    });
  }

  return (
    <div className="d-flex flex-column gap-4">
      <Tabs.Root value={activeClientTab} onValueChange={(val) => setActiveClientTab(val)}>
        <div className="portal-8col-grid">
          {/* LEFT 1/8 NAVIGATION SIDEBAR (0/8 -> 1/8) */}
          <aside className="portal-sidebar-1of8">
          <div className="sidebar-nav-card d-flex flex-column gap-2">
            <div className="px-2 pt-1 pb-2 border-bottom">
              <div
                className="text-uppercase fw-bold text-muted"
                style={{ fontSize: "0.68rem", letterSpacing: "0.06em" }}
              >
                {loc("Klient-Menu", "Client Menu")}
              </div>
              <div className="small fw-bold text-dark text-truncate">
                {overview.clientProfile?.fullName || me?.fullName || userName || loc("Klient", "Client")}
              </div>
            </div>

            <Tabs.List className="d-flex flex-column gap-1.5">
              <Tabs.Tab value="timeline" className="sidebar-tab-btn">
                <i className="bi bi-clock-history"></i>
                <span>
                  {tr("portal.tabAppointments", `My Appointments (${activeAppointments.length})`, {
                    count: activeAppointments.length,
                  })}
                </span>
              </Tabs.Tab>
              <Tabs.Tab value="booking" className="sidebar-tab-btn">
                <i className="bi bi-calendar-plus"></i>
                <span>
                  {tr("portal.tabMarketplace", "Find Therapist & Book")}
                </span>
              </Tabs.Tab>
              <Tabs.Tab value="journal" className="sidebar-tab-btn">
                <i className="bi bi-journal-richtext"></i>
                <span>
                  {tr("portal.tabJournal", "My Journal & PCL-5")} ({overview.journals.length})
                </span>
              </Tabs.Tab>
              <Tabs.Tab value="pcl5_privacy" className="sidebar-tab-btn">
                <i className="bi bi-shield-lock"></i>
                <span>
                  {tr("portal.tabConsent", `Therapist Access (${overview.handshakes.length})`, {
                    count: overview.handshakes.length,
                  })}
                </span>
              </Tabs.Tab>
              <Tabs.Tab
                value="jgit_timeline"
                onClick={() => {
                  if (gitHistory.length === 0) {
                    handleOpenGitHistory();
                  }
                }}
                className="sidebar-tab-btn"
              >
                <i className="bi bi-git text-success"></i>
                <span>
                  {loc("JGit Tidslinje", "JGit Timeline")} ({clientVisibleCommits.length})
                </span>
              </Tabs.Tab>
            </Tabs.List>
          </div>
        </aside>

        {/* RIGHT 7/8 MAIN WORKSPACE AREA (1/8 -> 8/8) */}
        <div className="portal-workspace-7of8 d-flex flex-column gap-4">
          {/* Welcome Banner + KPI Cards (Only shown on 'My Appointments' page) */}
          {activeClientTab === "timeline" && (
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
                        {loc(
                          "Accepterer du dette Handshake, får terapeuten adgang til dine delte journalnotater.",
                          "Accepting grants this therapist access to your shared journal entries."
                        )}
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        onClick={() => handleHandshakeStatus(hs.id, "ACTIVE")}
                        className="btn btn-sm btn-success rounded-pill px-3 fw-semibold"
                      >
                        {loc("Accepter", "Accept")}
                      </button>
                      <button
                        onClick={() => handleHandshakeStatus(hs.id, "REVOKED")}
                        className="btn btn-sm btn-outline-danger rounded-pill px-3"
                      >
                        {loc("Afvis", "Decline")}
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
                      <div className="h4 fw-bold text-dark mb-0">{upcomingAppointments.length}</div>
                      <div className="small text-muted text-truncate mt-1">
                        {nextAppointment
                          ? `${String(nextAppointment.startTime).replace("T", " • ").slice(0, 18)}`
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
                      <div className="small text-muted mt-1">
                        {overview.journals.length} {loc("indlæg", "entries")}
                      </div>
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
          )}

          {statusAlert && (
            <div className={`alert alert-${statusAlert.type} rounded-4 shadow-xs d-flex justify-content-between align-items-center mb-0`}>
              <span>{statusAlert.text}</span>
              <button type="button" className="btn-close" onClick={() => setStatusAlert(null)} />
            </div>
          )}

          {/* Active Workspace Window Card */}
          <div className="card border-0 shadow-xs rounded-4 bg-white">
            <div className="card-body p-4">
              {loading ? (
                <div className="text-center py-5 text-muted">
                  <div className="spinner-border text-primary mb-2" role="status" />
                  <div>
                    {loc(
                      "Henter dine data fra PostgreSQL...",
                      "Loading your data from PostgreSQL..."
                    )}
                  </div>
                </div>
              ) : (
                <>
                {/* TAB 1: MY APPOINTMENTS CALENDAR + UPCOMING & PAST APPOINTMENTS + CONNECTED THERAPISTS */}
                <Tabs.Panel value="timeline">
                  <div className="row g-4">
                    {/* Left 7 Cols: Interactive Monthly Calendar + Next & Previous Appointments */}
                    <div className="col-lg-7">
                      {/* Client Appointments Monthly Calendar */}
                      <div className="p-3.5 rounded-4 border bg-light bg-opacity-50 mb-4 p-3">
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                          <div>
                            <h5 className="fw-bold text-dark mb-0 text-capitalize">
                              {new Intl.DateTimeFormat(locale, {
                                month: "long",
                                year: "numeric",
                              }).format(clientMonthDate)}
                            </h5>
                            <p className="text-muted small mb-0">
                              {loc(
                                "Klik på en dato i kalenderen for at filtrere dine kommende og tidligere aftaler.",
                                "Click a date in the calendar to filter your upcoming and previous appointments."
                              )}
                            </p>
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            {selectedCalendarDate && (
                              <button
                                type="button"
                                onClick={() => setSelectedCalendarDate(null)}
                                className="btn btn-sm btn-outline-primary rounded-pill px-2.5"
                              >
                                {loc("Vis alle datoer", "Show all dates")} ({selectedCalendarDate} ✕)
                              </button>
                            )}
                            <div className="btn-group btn-group-sm">
                              <button
                                type="button"
                                className="btn btn-outline-secondary bg-white"
                                onClick={() =>
                                  setClientMonthDate(new Date(calYear, calMonth - 1, 1))
                                }
                              >
                                <i className="bi bi-chevron-left"></i>
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-secondary bg-white"
                                onClick={() => {
                                  if (nextAppointmentDateStr) {
                                    const d = new Date(nextAppointmentDateStr);
                                    if (!isNaN(d.getTime())) {
                                      setClientMonthDate(
                                        new Date(d.getFullYear(), d.getMonth(), 1)
                                      );
                                      setSelectedCalendarDate(nextAppointmentDateStr);
                                      return;
                                    }
                                  }
                                  const now = new Date();
                                  setClientMonthDate(
                                    new Date(now.getFullYear(), now.getMonth(), 1)
                                  );
                                  setSelectedCalendarDate(null);
                                }}
                              >
                                {loc("Næste aftale", "Next appointment")}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-secondary bg-white"
                                onClick={() =>
                                  setClientMonthDate(new Date(calYear, calMonth + 1, 1))
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

                          {clientCalendarCells.map((cell, idx) =>
                            cell === null ? (
                              <div
                                key={`empty-${idx}`}
                                className="rounded-3 bg-white bg-opacity-50"
                                style={{ minHeight: "74px" }}
                              />
                            ) : (
                              <button
                                key={cell.dateStr}
                                type="button"
                                onClick={() =>
                                  setSelectedCalendarDate((prev) =>
                                    prev === cell.dateStr ? null : cell.dateStr
                                  )
                                }
                                className={`calendar-day-cell ${
                                  selectedCalendarDate === cell.dateStr ? "selected" : ""
                                } ${cell.count > 0 ? "has-appointments" : ""}`}
                                style={{ minHeight: "74px" }}
                              >
                                <div className="d-flex justify-content-between align-items-center w-100">
                                  <span className="fw-bold text-dark" style={{ fontSize: "0.86rem" }}>
                                    {cell.dayNum}
                                  </span>
                                  {cell.isNextAptDate && (
                                    <span
                                      className="badge bg-primary rounded-pill"
                                      style={{ fontSize: "0.58rem" }}
                                    >
                                      {loc("Næste", "Next")}
                                    </span>
                                  )}
                                </div>

                                {cell.count > 0 ? (
                                  <span
                                    className="badge rounded-pill w-100 text-truncate py-1"
                                    style={{
                                      backgroundColor: cell.isPast ? "#64748b" : "#0f766e",
                                      color: "#ffffff",
                                      fontSize: "0.68rem",
                                    }}
                                  >
                                    <i className="bi bi-calendar-check me-1"></i>
                                    {cell.count}{" "}
                                    {cell.count === 1
                                      ? loc("aftale", "session")
                                      : loc("aftaler", "sessions")}
                                  </span>
                                ) : (
                                  <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                                    —
                                  </span>
                                )}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Search Bar + Next / Upcoming Appointments & Previous Appointments */}
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">
                          {loc(
                            "Mine Aftaler (Kommende & Tidligere)",
                            "My Appointments (Upcoming & Previous)"
                          )}
                        </h5>
                        <div className="input-group input-group-sm" style={{ maxWidth: "280px" }}>
                          <span className="input-group-text bg-light">
                            <i className="bi bi-search"></i>
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder={loc(
                              "Søg terapeut, klinik, CVR...",
                              "Search therapist, clinic, CVR..."
                            )}
                            value={timelineFilter}
                            onChange={(e) => setTimelineFilter(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Upcoming Appointments Section */}
                      <div className="mb-3">
                        <div className="small fw-bold text-uppercase text-success mb-2">
                          <i className="bi bi-calendar-check me-1"></i>
                          {loc("Kommende Aftaler", "Upcoming Appointments")} (
                          {upcomingAppointments.length})
                        </div>
                        <div className="d-flex flex-column gap-2.5">
                          {upcomingAppointments
                            .filter(
                              (a: any) =>
                                (!selectedCalendarDate ||
                                  String(a.startTime).slice(0, 10) === selectedCalendarDate) &&
                                `${a.title} ${a.therapistName} ${a.organisationName} ${a.cvrNumber}`
                                  .toLowerCase()
                                  .includes(timelineFilter.toLowerCase())
                            )
                            .map((apt: any, idx: number) => (
                              <div
                                key={apt.id}
                                className="p-3 rounded-4 border bg-white shadow-xs"
                                style={
                                  idx === 0
                                    ? { borderLeft: "5px solid #0f766e" }
                                    : undefined
                                }
                              >
                                <div className="d-flex justify-content-between align-items-start gap-2">
                                  <div>
                                    <div className="d-flex align-items-center gap-2 mb-1">
                                      <span className="badge bg-primary-subtle text-primary">
                                        {loc("Aftale", "Appointment")} •{" "}
                                        {String(apt.startTime)
                                          .replace("T", " • ")
                                          .slice(0, 18)}
                                      </span>
                                      {idx === 0 && (
                                        <span className="badge bg-success text-white rounded-pill">
                                          {loc("Næste Aftale", "Next Appointment")}
                                        </span>
                                      )}
                                    </div>
                                    <h6 className="fw-bold mb-1">{apt.title}</h6>
                                    <div className="small text-muted">
                                      {loc("Behandler", "Therapist")}:{" "}
                                      <strong>{apt.therapistName}</strong> •{" "}
                                      {apt.organisationName}
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
                                      {loc("Flyt tid", "Reschedule")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelAppointment(apt.id)}
                                      className="btn btn-sm btn-outline-danger rounded-pill"
                                    >
                                      {loc("Aflys", "Cancel")}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Previous / Past Appointments Section */}
                      {pastAppointments.length > 0 && (
                        <div className="mb-3">
                          <div className="small fw-bold text-uppercase text-secondary mb-2">
                            <i className="bi bi-clock-history me-1"></i>
                            {loc("Tidligere Aftaler", "Previous Appointments")} (
                            {pastAppointments.length})
                          </div>
                          <div className="d-flex flex-column gap-2">
                            {pastAppointments
                              .filter(
                                (a: any) =>
                                  (!selectedCalendarDate ||
                                    String(a.startTime).slice(0, 10) === selectedCalendarDate) &&
                                  `${a.title} ${a.therapistName} ${a.organisationName} ${a.cvrNumber}`
                                    .toLowerCase()
                                    .includes(timelineFilter.toLowerCase())
                              )
                              .map((apt: any) => (
                                <div
                                  key={apt.id}
                                  className="p-3 rounded-4 border bg-light bg-opacity-75"
                                >
                                  <div className="d-flex justify-content-between align-items-start gap-2">
                                    <div>
                                      <span className="badge bg-secondary-subtle text-secondary mb-1">
                                        {loc("Tidligere aftale", "Past session")} •{" "}
                                        {String(apt.startTime)
                                          .replace("T", " • ")
                                          .slice(0, 18)}
                                      </span>
                                      <h6 className="fw-bold mb-1 text-dark">{apt.title}</h6>
                                      <div className="small text-muted">
                                        {loc("Behandler", "Therapist")}:{" "}
                                        <strong>{apt.therapistName}</strong> •{" "}
                                        {apt.organisationName}
                                        {apt.cvrNumber ? ` (CVR: ${apt.cvrNumber})` : ""}
                                      </div>
                                    </div>
                                    <div className="d-flex align-items-center">
                                      <span
                                        className="badge bg-secondary-subtle text-secondary border rounded-pill px-3 py-1.5"
                                        title={loc(
                                          "Tidligere aftaler i fortiden er låst og kan ikke flyttes eller aflyses.",
                                          "Past appointments are locked and cannot be rescheduled or cancelled."
                                        )}
                                      >
                                        <i className="bi bi-lock-fill me-1"></i>
                                        {loc("Afholdt (Låst)", "Completed (Locked)")}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Hidden SR/Metadata index of shared journals so tab="timeline" remains purely appointments visually */}
                      <div className="visually-hidden" aria-hidden="true">
                        {overview.journals.map((entry: any) => (
                          <span key={entry.id}>
                            {entry.title} {entry.content}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right 5 Cols: My Connected Therapists Summary (Localized) */}
                    <div className="col-lg-5">
                      <div className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h5 className="fw-bold mb-0">
                            {loc("Mine Tilknyttede Behandlere", "My Connected Therapists")}
                          </h5>
                          <button
                            type="button"
                            onClick={() => setActiveClientTab("pcl5_privacy")}
                            className="btn btn-sm btn-link p-0 text-decoration-none fw-semibold"
                          >
                            {loc("Administrer alle →", "Manage all →")}
                          </button>
                        </div>
                        <p className="small text-muted mb-3">
                          {loc(
                            "Du styrer selv, hvilke behandlere der har adgang til dine delte journalnotater.",
                            "You control which connected therapists have Handshake access to your shared journal entries."
                          )}
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
                                  {hs.organisationName}{" "}
                                  {hs.cvrNumber ? `(CVR: ${hs.cvrNumber})` : ""}
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
                                    {loc("Tilbagekald", "Revoke")}
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
                        <h5 className="fw-bold mb-0">
                          {loc(
                            "Behandlere & Klinik-Ydelser (Fra Databasen)",
                            "Therapists & Clinic Services (From Database)"
                          )}
                        </h5>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          style={{ maxWidth: "250px" }}
                          placeholder={loc(
                            "Søg ydelse, lokation, CVR...",
                            "Search service, location, CVR..."
                          )}
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
                                    {srv.provider?.displayName ||
                                      loc("Klinikbehandler", "Clinic Therapist")}
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
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="fw-bold mb-0">
                            {loc(
                              "Book Aftale (Timefold Solver & 409 Beskyttet)",
                              "Book Appointment (Timefold Solver & 409 Protected)"
                            )}
                          </h5>
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">
                            {loc("Valgt Ydelse", "Selected Service")}
                          </label>
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
                          <label className="form-label small fw-semibold">
                            {loc("Vælg Dato", "Select Date")}
                          </label>
                          <input
                            type="date"
                            className="form-control"
                            min={todayDateStr}
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>

                        {timefoldBookingPlan && (
                          <div className="p-2.5 rounded-3 border bg-white mb-3 small">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className="fw-bold text-dark">
                                <i className="bi bi-cpu text-primary me-1"></i>
                                {timefoldBookingPlan.solver || "Timefold Solver"}
                              </span>
                              <span className="badge bg-primary-subtle text-primary font-monospace">
                                Score: {timefoldBookingPlan.solverScore}
                              </span>
                            </div>
                            {timefoldBookingPlan.recommendedSlot ? (
                              <div className="d-flex justify-content-between align-items-center text-secondary">
                                <span>
                                  {loc("Anbefalet optimalt slot:", "Recommended optimal slot:")}{" "}
                                  <strong className="text-success">
                                    kl. {timefoldBookingPlan.recommendedSlot}
                                  </strong>
                                </span>
                                {bookingSlot !== timefoldBookingPlan.recommendedSlot && (
                                  <button
                                    type="button"
                                    onClick={() => setBookingSlot(timefoldBookingPlan.recommendedSlot)}
                                    className="btn btn-sm btn-outline-success rounded-pill py-0 px-2"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    {loc("Vælg anbefalet", "Select recommended")}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="text-danger">
                                {loc(
                                  "Ingen ledige tider på denne dato.",
                                  "No available slots on this date."
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mb-3">
                          <label className="form-label small fw-semibold">
                            {loc("Vælg Ledigt Tidspunkt", "Select Available Time Slot")}
                          </label>
                          <div className="d-flex flex-wrap gap-2">
                            {TIME_SLOTS.map((slot) => {
                              const tfSlot = timefoldBookingPlan?.slots?.find(
                                (s: any) => s.slot === slot
                              );
                              const isUnavailable = tfSlot ? !tfSlot.available : false;
                              const isRecommended = tfSlot ? Boolean(tfSlot.recommended) : false;
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  disabled={isUnavailable}
                                  onClick={() => setBookingSlot(slot)}
                                  className={`btn btn-sm rounded-pill px-3 ${
                                    bookingSlot === slot
                                      ? "btn-primary"
                                      : isUnavailable
                                      ? "btn-outline-secondary opacity-50 text-decoration-line-through"
                                      : isRecommended
                                      ? "btn-outline-success bg-white fw-semibold"
                                      : "btn-outline-secondary bg-white"
                                  }`}
                                  title={
                                    tfSlot?.reason === "CONFLICT_OVERLAP"
                                      ? loc("Optaget hos terapeut", "Already booked")
                                      : tfSlot?.reason === "IN_PAST"
                                      ? loc("Tidspunktet ligger i fortiden", "Slot is in the past")
                                      : isRecommended
                                      ? loc("Timefold Solver anbefalet tidspunkt", "Timefold Solver recommended slot")
                                      : undefined
                                  }
                                >
                                  {slot}
                                  {isRecommended ? " ★" : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mb-3">
                          <div className="pe-2">
                            <div className="small fw-semibold">
                              {loc(
                                "Giv Handshake-samtykke ved booking",
                                "Grant Handshake consent on booking"
                              )}
                            </div>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              {loc(
                                "Giver behandleren adgang til dine delte journalnotater.",
                                "Grants the therapist access to your shared journal entries."
                              )}
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
                          {loc("Bekræft Booking i Databasen", "Confirm Booking in Database")}
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
                        <h5 className="fw-bold mb-3">
                          {loc("Skriv Nyt Dagbogsindlæg", "Write New Journal Entry")}
                        </h5>
                        <div className="mb-3">
                          <label className="form-label small fw-semibold">
                            {loc("Overskrift", "Title")}
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            placeholder={loc(
                              "f.eks. Ugens refleksioner og søvn",
                              "e.g. Weekly reflections and sleep"
                            )}
                            value={journalTitle}
                            onChange={(e) => setJournalTitle(e.target.value)}
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label small fw-semibold d-flex justify-content-between">
                            <span>{loc("Humørvurdering (1–10)", "Mood Rating (1–10)")}</span>
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
                          <label className="form-label small fw-semibold">
                            {loc("Indhold", "Content")}
                          </label>
                          <textarea
                            rows={4}
                            className="form-control"
                            required
                            placeholder={loc(
                              "Beskriv dine tanker, fremskridt eller spørgsmål til næste samtale...",
                              "Describe your thoughts, progress, or questions for your next session..."
                            )}
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
                                    ? loc(
                                        `Delt med valgte Handshake-terapeuter (${selectedTherapistUuids.length}/${activeHandshakes.length})`,
                                        `Shared with selected Handshake therapists (${selectedTherapistUuids.length}/${activeHandshakes.length})`
                                      )
                                    : loc(
                                        "Delt med aktive Handshake-terapeuter",
                                        "Shared with active Handshake therapists"
                                      )
                                  : loc("Kun privat for mig", "Private (Only me)")}
                              </div>
                              <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                                {sharedWithTherapists
                                  ? loc(
                                      "Vælg specifikke terapeuter med aktivt Handshake, eller slå fra for at holde indlægget helt privat.",
                                      "Select specific therapists with an active Handshake, or toggle off to keep this entry strictly private."
                                    )
                                  : loc(
                                      "Privat fra alle terapeuter — du kan altid dele indlægget individuelt senere.",
                                      "Private from all therapists — you can always share this entry individually later."
                                    )}
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
                                  {loc(
                                    "Vælg Handshake-terapeuter der må se dette indlæg:",
                                    "Select Handshake therapists allowed to view this entry:"
                                  )}
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
                                      {loc("Vælg alle", "Select all")}
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
                                      {loc("Hold privat", "Keep private")}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {activeHandshakes.length === 0 ? (
                                <div className="small text-muted fst-italic" style={{ fontSize: "0.75rem" }}>
                                  {loc(
                                    "Ingen aktive Handshake-terapeuter endnu. Indlægget kan deles med specifikke terapeuter, når du opretter et Handshake.",
                                    "No active Handshake therapists yet. You can share this entry once you establish a Handshake."
                                  )}
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
                                              {hs.therapistName || loc("Behandler", "Therapist")}
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
                                          {isChecked
                                            ? loc("Har adgang", "Has access")
                                            : loc("Ingen adgang", "No access")}
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
                          {loc("Gem & Versionér i JGit", "Save & Commit to JGit")}
                        </button>
                      </form>
                    </div>

                    <div className="col-lg-7">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">
                          {loc(
                            `Mine Journalindlæg & Behandler-notater (${overview.journals.length})`,
                            `My Journal Entries & Therapist Notes (${overview.journals.length})`
                          )}
                        </h5>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            onClick={() => fetchDatabaseData(false)}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                            title={loc(
                              "Hent nyeste journalindlæg fra databasen",
                              "Refresh latest journal entries from the database"
                            )}
                          >
                            <i className="bi bi-arrow-clockwise me-1"></i>{" "}
                            {loc("Opdater", "Refresh")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenGitHistory()}
                            className="btn btn-sm btn-outline-dark rounded-pill px-3"
                          >
                            <i className="bi bi-git me-1"></i>{" "}
                            {loc("Se JGit Tidslinje", "View JGit Timeline")}
                          </button>
                        </div>
                      </div>

                      <div className="d-flex flex-column gap-3">
                        {(showAllJournals ? overview.journals : overview.journals.slice(0, 8)).map((entry: any) => {
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
                            .map((h: any) => h.therapistName || loc("Behandler", "Therapist"));

                          const isEditingEntrySharing = editingSharingEntryId === String(entry.id);

                          return (
                            <div key={entry.id} className="p-3 rounded-4 border bg-white shadow-xs">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <div className="d-flex flex-wrap align-items-center gap-2">
                                  {isFromTherapist ? (
                                    <span className="badge bg-info-subtle text-dark border">
                                      <i className="bi bi-person-badge me-1"></i>
                                      {loc("Fra din behandler", "From your therapist")}
                                    </span>
                                  ) : (
                                    <span className="badge bg-primary-subtle text-primary">
                                      {loc("Humør", "Mood")}: {entry.moodRating}/10
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
                                        ? loc(
                                            `Delt med: ${sharedTherapistNames.join(", ")}`,
                                            `Shared with: ${sharedTherapistNames.join(", ")}`
                                          )
                                        : loc("Delt med terapeut", "Shared with therapist")
                                      : loc("Privat (Kun mig)", "Private (Only me)")}
                                  </span>
                                  {entry.timestamp && (
                                    <span className="text-muted" style={{ fontSize: "0.74rem" }}>
                                      {String(entry.timestamp)
                                        .replace("T", isEn ? " • " : " kl. ")
                                        .slice(0, 20)}
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
                                    title={loc(
                                      "Administrer hvilke terapeuter der har adgang til dette indlæg",
                                      "Manage which therapists have access to this entry"
                                    )}
                                  >
                                    <i className="bi bi-shield-lock me-1"></i>
                                    {loc("Deling & Adgang", "Sharing & Access")}
                                  </button>
                                  {entry.gitCommitHash && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenGitHistory(entry.gitCommitHash)}
                                      className="btn btn-link btn-sm p-0 text-decoration-none font-monospace text-dark fw-semibold"
                                      style={{ fontSize: "0.78rem" }}
                                      title={loc(
                                        "Åbn dette commit i JGit-tidslinjen",
                                        "Open this commit in the JGit timeline"
                                      )}
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
                                        {loc(
                                          "Individuel adgangsstyring for dette dagbogsindlæg",
                                          "Individual access control for this journal entry"
                                        )}
                                      </div>
                                      <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                                        {loc(
                                          "Vælg specifikke Handshake-terapeuter eller gør indlægget helt privat.",
                                          "Select specific Handshake therapists or make this entry completely private."
                                        )}
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
                                        {loc("Hold privat fra alle", "Keep private from all")}
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
                                          {loc(
                                            `Del med alle aktive (${activeHandshakes.length})`,
                                            `Share with all active (${activeHandshakes.length})`
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {activeHandshakes.length === 0 ? (
                                    <div className="small text-muted fst-italic">
                                      {loc(
                                        "Du har ingen aktive Handshake-terapeuter i øjeblikket.",
                                        "You currently have no active Handshake therapists."
                                      )}
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
                                                  {hs.therapistName || loc("Behandler", "Therapist")}
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
                                              {hasAccess
                                                ? loc("Delt", "Shared")
                                                : loc("Fjernet", "Removed")}
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

                        {overview.journals.length > 8 && (
                          <button
                            type="button"
                            onClick={() => setShowAllJournals((prev) => !prev)}
                            className="btn btn-sm btn-outline-secondary rounded-pill py-2 fw-semibold"
                          >
                            <i
                              className={`bi ${
                                showAllJournals ? "bi-chevron-up" : "bi-chevron-down"
                              } me-1`}
                            ></i>
                            {showAllJournals
                              ? loc("Vis færre dagbogsindlæg", "Show fewer journal entries")
                              : loc(
                                  `Vis alle ${overview.journals.length} dagbogsindlæg (${overview.journals.length - 8} flere)`,
                                  `Show all ${overview.journals.length} journal entries (${overview.journals.length - 8} more)`
                                )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* PCL-5 SELF-ASSESSMENT SECTION INSIDE MY JOURNAL & PCL-5 TAB */}
                    <div className="col-12">
                      <hr className="my-2 text-muted opacity-25" />
                    </div>
                    <div className="col-lg-6">
                      <form onSubmit={handleSubmitPcl5} className="p-4 rounded-4 border bg-light bg-opacity-50">
                        <h5 className="fw-bold mb-2">
                          {loc(
                            "PCL-5 Psykotraumatologisk Trivselstjek",
                            "PCL-5 Psychotraumatology Well-Being Check-In"
                          )}
                        </h5>
                        <p className="small text-muted mb-3">
                          {loc(
                            "Vurder hvor meget du er blevet generet af følgende i den seneste uge (0 = Slet ikke, 4 = Ekstremt):",
                            "Rate how much you have been bothered by the following in the past week (0 = Not at all, 4 = Extremely):"
                          )}
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
                          {loc(
                            "Indsend PCL-5 Vurdering til Databasen",
                            "Submit PCL-5 Assessment to Database"
                          )}
                        </button>
                      </form>
                    </div>

                    <div className="col-lg-6">
                      <h5 className="fw-bold mb-3">
                        {loc(
                          `Tidligere PCL-5 Resultater (${overview.pcl5Tests.length})`,
                          `Previous PCL-5 Results (${overview.pcl5Tests.length})`
                        )}
                      </h5>
                      <div className="d-flex flex-column gap-2">
                        {(showAllPcl5
                          ? [...overview.pcl5Tests].reverse()
                          : [...overview.pcl5Tests].reverse().slice(0, 5)
                        ).map((t: any) => (
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

                        {overview.pcl5Tests.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllPcl5((prev) => !prev)}
                            className="btn btn-sm btn-outline-secondary rounded-pill py-2 fw-semibold mt-1"
                          >
                            <i
                              className={`bi ${
                                showAllPcl5 ? "bi-chevron-up" : "bi-chevron-down"
                              } me-1`}
                            ></i>
                            {showAllPcl5
                              ? loc("Vis færre PCL-5 resultater", "Show fewer PCL-5 results")
                              : loc(
                                  `Vis alle ${overview.pcl5Tests.length} PCL-5 resultater`,
                                  `Show all ${overview.pcl5Tests.length} PCL-5 results`
                                )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Tabs.Panel>

                {/* TAB 4: THERAPIST ACCESS & HANDSHAKE CONSENTS (Q3, Q4 & Q11) */}
                <Tabs.Panel value="pcl5_privacy">
                  <div className="d-flex flex-column gap-4">
                    <div
                      className="d-flex flex-wrap justify-content-between align-items-center p-3 rounded-4 border shadow-xs gap-2"
                      style={{
                        background:
                          "linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 55%, #eef2ff 100%)",
                        borderColor: "#a7f3d0",
                      }}
                    >
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span
                            className="badge rounded-pill px-2.5 py-1 text-white"
                            style={{ backgroundColor: "#0f766e" }}
                          >
                            <i className="bi bi-shield-check me-1"></i>
                            {loc(
                              "Handshake Samtykke & Behandler-Adgang",
                              "Handshake Consent & Therapist Access"
                            )}
                          </span>
                          <span className="badge bg-white text-secondary border rounded-pill">
                            {activeHandshakes.length} {loc("aktive", "active")} •{" "}
                            {overview.handshakes.length} {loc("i alt", "total")}
                          </span>
                        </div>
                        <h5 className="fw-bold text-dark mb-0">
                          {loc(
                            "Terapeuter du har lavet et Handshake med",
                            "Therapists You Have a Handshake With"
                          )}
                        </h5>
                        <p className="text-muted small mb-0">
                          {loc(
                            "Her kan du se alle dine tilknyttede terapeuter, godkende nye Handshake-anmodninger eller tilbagekalde adgang til dine delte journalnotater med øjeblikkelig virkning.",
                            "Here you can view all your connected therapists, approve new Handshake requests, or revoke access to your shared journal entries with immediate effect."
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveClientTab("booking")}
                        className="btn btn-sm btn-success rounded-pill px-3 fw-semibold"
                        style={{ backgroundColor: "#0f766e" }}
                      >
                        <i className="bi bi-person-plus me-1"></i>{" "}
                        {loc("Find Ny Terapeut", "Find New Therapist")}
                      </button>
                    </div>

                    {overview.handshakes.length === 0 ? (
                      <div className="p-4 rounded-4 border bg-light text-center text-muted small">
                        <i className="bi bi-shield-lock fs-4 d-block mb-2 text-secondary"></i>
                        {loc(
                          "Du har endnu ingen Handshake-aftaler med terapeuter. Gå til Find Therapist & Book for at oprette forbindelse til en behandler.",
                          "You have no Handshake agreements with therapists yet. Go to Find Therapist & Book to connect with a therapist."
                        )}
                      </div>
                    ) : (
                      <div className="row g-3">
                        {overview.handshakes.map((hs: any) => {
                          const isActive = hs.status === "ACTIVE";
                          const isPending = hs.status === "PENDING";
                          const sharedEntriesCount = overview.journals.filter((j: any) => {
                            if (!j.sharedWithTherapists) return false;
                            const uuids = Array.isArray(j.sharedTherapistUuids)
                              ? j.sharedTherapistUuids.map(String)
                              : [];
                            return uuids.length === 0 || uuids.includes(String(hs.therapistUuid));
                          }).length;

                          return (
                            <div key={hs.id || hs.therapistUuid} className="col-md-6">
                              <div
                                className="p-4 rounded-4 border bg-white shadow-xs h-100 d-flex flex-column justify-content-between gap-3"
                                style={{
                                  borderLeft: `5px solid ${
                                    isActive
                                      ? "#10b981"
                                      : isPending
                                      ? "#f59e0b"
                                      : "#94a3b8"
                                  }`,
                                }}
                              >
                                <div>
                                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                                    <div className="d-flex align-items-center gap-2.5">
                                      <span
                                        className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
                                        style={{
                                          width: "40px",
                                          height: "40px",
                                          backgroundColor: isActive
                                            ? "#059669"
                                            : isPending
                                            ? "#d97706"
                                            : "#64748b",
                                          fontSize: "0.95rem",
                                        }}
                                      >
                                        <i className="bi bi-person-badge"></i>
                                      </span>
                                      <div>
                                        <h6 className="fw-bold text-dark mb-0">
                                          {hs.therapistName ||
                                            loc("Autoriseret Behandler", "Licensed Therapist")}
                                        </h6>
                                        <div className="small text-muted">
                                          {hs.organisationName || loc("Klinik", "Clinic")}
                                          {hs.cvrNumber ? ` • CVR: ${hs.cvrNumber}` : ""}
                                        </div>
                                      </div>
                                    </div>

                                    <span
                                      className={`badge rounded-pill px-3 py-1.5 ${
                                        isActive
                                          ? "bg-success-subtle text-success border border-success-subtle"
                                          : isPending
                                          ? "bg-warning-subtle text-warning border border-warning-subtle"
                                          : "bg-secondary-subtle text-secondary border"
                                      }`}
                                    >
                                      <i
                                        className={`bi ${
                                          isActive
                                            ? "bi-check-circle-fill"
                                            : isPending
                                            ? "bi-hourglass-split"
                                            : "bi-slash-circle"
                                        } me-1`}
                                      ></i>
                                      {hs.status}
                                    </span>
                                  </div>

                                  <div className="p-2.5 rounded-3 bg-light border small text-secondary mt-2">
                                    <div className="d-flex justify-content-between align-items-center">
                                      <span>
                                        {loc(
                                          "Delte dagbogsindlæg med denne terapeut:",
                                          "Shared journal entries with this therapist:"
                                        )}
                                      </span>
                                      <strong className="text-dark">
                                        {isActive
                                          ? `${sharedEntriesCount} ${loc("indlæg", "entries")}`
                                          : loc("0 (Ingen adgang)", "0 (No access)")}
                                      </strong>
                                    </div>
                                    {hs.therapistUuid && (
                                      <div className="text-muted mt-1" style={{ fontSize: "0.7rem" }}>
                                        {loc("Terapeut-ID:", "Therapist ID:")}{" "}
                                        <span className="font-monospace">{hs.therapistUuid}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 pt-2 border-top">
                                  <button
                                    type="button"
                                    onClick={() => setActiveClientTab("journal")}
                                    className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                                  >
                                    <i className="bi bi-journal-richtext me-1"></i>{" "}
                                    {loc("Administrer delte indlæg", "Manage shared entries")}
                                  </button>

                                  <div className="d-flex gap-2">
                                    {isPending && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleHandshakeStatus(hs.id, "ACTIVE")}
                                          className="btn btn-sm btn-success rounded-pill px-3 fw-semibold"
                                        >
                                          {loc("Accepter Handshake", "Accept Handshake")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleHandshakeStatus(hs.id, "REVOKED")}
                                          className="btn btn-sm btn-outline-danger rounded-pill px-3"
                                        >
                                          {loc("Afvis", "Decline")}
                                        </button>
                                      </>
                                    )}
                                    {isActive && (
                                      <button
                                        type="button"
                                        onClick={() => handleHandshakeStatus(hs.id, "REVOKED")}
                                        className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-semibold"
                                      >
                                        <i className="bi bi-shield-x me-1"></i>{" "}
                                        {loc("Tilbagekald Handshake", "Revoke Handshake")}
                                      </button>
                                    )}
                                    {!isActive && !isPending && (
                                      <button
                                        type="button"
                                        onClick={() => handleHandshakeStatus(hs.id, "ACTIVE")}
                                        className="btn btn-sm btn-outline-success rounded-pill px-3 fw-semibold"
                                      >
                                        <i className="bi bi-arrow-repeat me-1"></i>{" "}
                                        {loc("Genaktiver Handshake", "Reactivate Handshake")}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Tabs.Panel>

                {/* TAB 5: JGIT TIDSLINJE (REGULAR WORKSPACE WINDOW FOR CLIENT) */}
                <Tabs.Panel value="jgit_timeline">
                  <div data-window-kind="JGIT_TIMELINE" className="d-flex flex-column gap-3">
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
                            {clientVisibleCommits.length} {loc("revisioner", "revisions")}
                          </span>
                        </div>
                        <h5 className="fw-bold text-dark mb-0">
                          {loc(
                            "Mine Journal-Revisioner (Horisontal Klient-Tidslinje)",
                            "My Journal Revisions (Horizontal Client Timeline)"
                          )}
                        </h5>
                        <p className="text-muted small mb-0">
                          {loc(
                            "Klik på en revision på den horisontale tidslinje for at fremhæve den og åbne inspektøren direkte henover tidslinjen.",
                            "Click on any revision on the horizontal timeline to highlight it and open the inspector directly over the timeline."
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenGitHistory()}
                        className="btn btn-sm btn-outline-success rounded-pill px-3 bg-white fw-semibold"
                      >
                        <i className="bi bi-arrow-clockwise me-1"></i>{" "}
                        {loc("Opdater Tidslinje", "Refresh Timeline")}
                      </button>
                    </div>

                    <JGitHistoryTimeline
                      commits={gitHistory}
                      isTherapistView={false}
                      selectedCommitHash={selectedCommit?.commitHash || null}
                      onSelectCommit={(hash) => {
                        const found = gitHistory.find((c: any) => c.commitHash === hash);
                        if (found) setSelectedCommit(found);
                      }}
                      locale={locale}
                    />
                  </div>
                </Tabs.Panel>
              </>
            )}
              </div>
            </div>
          </div>
        </div>
      </Tabs.Root>

      {/* Reschedule Appointment Dialog (Base UI Dialog) */}
      <Dialog.Root open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup className="base-dialog-popup p-4" style={{ maxWidth: "460px" }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <Dialog.Title className="h5 fw-bold mb-0">
                {loc("Flyt Aftale", "Reschedule Appointment")}
              </Dialog.Title>
              <Dialog.Close className="btn-close" />
            </div>
            <form onSubmit={handleRescheduleSubmit}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  {loc("Ny Dato", "New Date")}
                </label>
                <input
                  type="date"
                  className="form-control"
                  min={todayDateStr}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                />
              </div>
              {timefoldReschedulePlan?.recommendedSlot && (
                <div className="p-2.5 rounded-3 bg-light border mb-3 small d-flex justify-content-between align-items-center">
                  <span>
                    <i className="bi bi-cpu text-primary me-1"></i>
                    {loc("Timefold anbefaler:", "Timefold recommends:")}{" "}
                    <strong className="text-success">
                      kl. {timefoldReschedulePlan.recommendedSlot}
                    </strong>
                  </span>
                  {rescheduleSlot !== timefoldReschedulePlan.recommendedSlot && (
                    <button
                      type="button"
                      onClick={() => setRescheduleSlot(timefoldReschedulePlan.recommendedSlot)}
                      className="btn btn-sm btn-outline-success rounded-pill py-0 px-2"
                      style={{ fontSize: "0.72rem" }}
                    >
                      {loc("Brug", "Use")} {timefoldReschedulePlan.recommendedSlot}
                    </button>
                  )}
                </div>
              )}
              <div className="mb-3">
                <label className="form-label small fw-semibold">
                  {loc("Nyt Tidspunkt", "New Time Slot")}
                </label>
                <select
                  className="form-select"
                  value={rescheduleSlot}
                  onChange={(e) => setRescheduleSlot(e.target.value)}
                >
                  {TIME_SLOTS.map((s) => {
                    const tfSlot = timefoldReschedulePlan?.slots?.find(
                      (item: any) => item.slot === s
                    );
                    const isUnavailable = tfSlot ? !tfSlot.available : false;
                    const isRecommended = tfSlot ? Boolean(tfSlot.recommended) : false;
                    return (
                      <option key={s} value={s} disabled={isUnavailable}>
                        {s}
                        {isRecommended
                          ? loc(" (★ Timefold Anbefalet)", " (★ Timefold Recommended)")
                          : ""}
                        {isUnavailable ? loc(" (Ikke ledig)", " (Unavailable)") : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Dialog.Close className="btn btn-light">
                  {loc("Annuller", "Cancel")}
                </Dialog.Close>
                <button type="submit" className="btn btn-primary">
                  {loc("Gem Nyt Tidspunkt", "Save New Time")}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

