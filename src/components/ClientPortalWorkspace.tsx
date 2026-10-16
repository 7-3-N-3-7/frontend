"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { Switch } from "@base-ui/react/switch";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useI18nCache } from "@/components/CachedI18nProvider";
import JGitHistoryTimeline from "@/components/JGitHistoryTimeline";
import {
  parseWeeklySchedule,
  getScheduleForDate,
  checkCollisionWithBreak,
  isDayClosed,
  timeToMinutes,
  minutesToTime,
} from "@/components/WeeklyScheduleManager";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

const I18N_AVAILABILITY: Record<string, { available: string; unavailable: string }> = {
  en: { available: "Available", unavailable: "Unavailable" },
  da: { available: "Tilgængelig", unavailable: "Utilgængelig" },
  fr: { available: "Disponible", unavailable: "Indisponible" },
  es: { available: "Disponible", unavailable: "No disponible" },
  de: { available: "Verfügbar", unavailable: "Nicht verfügbar" },
  sv: { available: "Tillgänglig", unavailable: "Ej tillgänglig" },
  no: { available: "Tilgjengelig", unavailable: "Ikke tilgjengelig" },
  nl: { available: "Beschikbaar", unavailable: "Niet beschikbaar" },
  it: { available: "Disponibile", unavailable: "Non disponibile" },
  pl: { available: "Dostępny", unavailable: "Niedostępny" },
  fi: { available: "Saatavilla", unavailable: "Ei saatavilla" },
  pt: { available: "Disponível", unavailable: "Indisponível" },
  is: { available: "Í boði", unavailable: "Ekki í boði" },
};

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

const THERAPIST_MONITOR_QUESTIONS_DA = [
  {
    id: "sleep",
    title: "Søvnkvalitet & Udhvilethed",
    description: "Hvordan har din søvnkvalitet og følelse af at være udhvilet været i den forgangne uge?",
    lowLabel: "Meget dårlig (1)",
    highLabel: "Fremragende (10)",
  },
  {
    id: "stress",
    title: "Stress & Indre Ro",
    description: "Hvor meget indre ro og balance har du oplevet i mødet med hverdagens krav?",
    lowLabel: "Konstant overvældet (1)",
    highLabel: "Helt rolig og i balance (10)",
  },
  {
    id: "mastery",
    title: "Mestring & Øvelser",
    description: "I hvilken grad har du formået at afprøve de aftalte øvelser, teknikker eller refleksioner?",
    lowLabel: "Slet ikke (1)",
    highLabel: "Fuldt integreret (10)",
  },
  {
    id: "mood",
    title: "Humør & Psykisk Overskud",
    description: "Hvordan vil du vurdere dit generelle humør og mentale overskud i denne uge?",
    lowLabel: "Meget lavt (1)",
    highLabel: "Højt overskud (10)",
  },
];

const THERAPIST_MONITOR_QUESTIONS_EN = [
  {
    id: "sleep",
    title: "Sleep Quality & Restfulness",
    description: "How has your sleep quality and sense of restfulness been over the past week?",
    lowLabel: "Very poor (1)",
    highLabel: "Excellent (10)",
  },
  {
    id: "stress",
    title: "Stress & Inner Calm",
    description: "How much inner calm and balance have you experienced facing daily challenges?",
    lowLabel: "Constantly overwhelmed (1)",
    highLabel: "Completely calm (10)",
  },
  {
    id: "mastery",
    title: "Coping & Exercises",
    description: "To what extent have you practiced the agreed exercises or therapeutic techniques?",
    lowLabel: "Not at all (1)",
    highLabel: "Fully integrated (10)",
  },
  {
    id: "mood",
    title: "Mood & Mental Energy",
    description: "How would you rate your overall mood and mental energy this past week?",
    lowLabel: "Very low (1)",
    highLabel: "High energy (10)",
  },
];

export default function ClientPortalWorkspace({
  userName,
  secureStatus,
}: {
  userName?: string;
  secureStatus?: string | null;
}) {
  const locale = useLocale();
  const isEn = locale === "en";
  const loc = (daText: string, enText: string) => (isEn ? enText : daText);
  const i18nCache = useI18nCache();
  const currentLang = (i18nCache?.locale || locale || "en").toLowerCase().split("-")[0];
  const langEntry = I18N_AVAILABILITY[currentLang] || I18N_AVAILABILITY.en;
  const t = useTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, any>) => {
    try {
      return t.has(key as any) ? t(key as any, { count: 0, ...values }) : fallback;
    } catch {
      return fallback;
    }
  };
  const availableLabel = tr("portal.available", langEntry.available);
  const unavailableLabel = tr("portal.unavailable", langEntry.unavailable);
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
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Pop-up Calendar & Time Slot Picker State
  const [isBookingPickerOpen, setIsBookingPickerOpen] = useState(false);
  const [pickerMonthDate, setPickerMonthDate] = useState(() => new Date());
  const [tempBookingDate, setTempBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tempBookingSlot, setTempBookingSlot] = useState("10:00");

  // Reschedule Dialog State
  const [rescheduleTarget, setRescheduleTarget] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("11:00");
  const [timefoldReschedulePlan, setTimefoldReschedulePlan] = useState<any | null>(null);
  const [loadingTimefoldReschedule, setLoadingTimefoldReschedule] = useState(false);

  // Selected service and therapist weekly schedule
  const selectedServiceObj = useMemo(() => {
    return overview.services.find((s: any) => s.id === selectedServiceId);
  }, [overview.services, selectedServiceId]);

  const selectedTherapistProfile = useMemo(() => {
    const tUuid = selectedServiceObj?.provider?.userUuid || overview.providers[0]?.userUuid;
    return selectedServiceObj?.provider || overview.providers.find((p: any) => p.userUuid === tUuid);
  }, [selectedServiceObj, overview.providers]);

  const selectedTherapistSchedule = useMemo(() => {
    return parseWeeklySchedule(selectedTherapistProfile?.workingHoursJson);
  }, [selectedTherapistProfile?.workingHoursJson]);

  // Date Formatting Helpers for Pop-up Calendar
  const formatFriendlyDate = useCallback(
    (dateStr: string) => {
      if (!dateStr) return "-";
      const [y, m, d] = dateStr.split("-").map(Number);
      if (!y || !m || !d) return dateStr;
      const dateObj = new Date(y, m - 1, d);
      const dayNamesDa = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
      const dayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const monthNamesDa = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
      const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const dayName = isEn ? dayNamesEn[dateObj.getDay()] : dayNamesDa[dateObj.getDay()];
      const monthName = isEn ? monthNamesEn[m - 1] : monthNamesDa[m - 1];
      return `${dayName}. ${d}. ${monthName} ${y}`;
    },
    [isEn]
  );

  const formatFullDate = useCallback(
    (dateStr: string) => {
      if (!dateStr) return "-";
      const [y, m, d] = dateStr.split("-").map(Number);
      if (!y || !m || !d) return dateStr;
      const dateObj = new Date(y, m - 1, d);
      const dayNamesDa = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
      const dayNamesEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const monthNamesDa = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
      const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const dayName = isEn ? dayNamesEn[dateObj.getDay()] : dayNamesDa[dateObj.getDay()];
      const monthName = isEn ? monthNamesEn[m - 1] : monthNamesDa[m - 1];
      return isEn ? `${dayName}, ${monthName} ${d}, ${y}` : `${dayName} d. ${d}. ${monthName} ${y}`;
    },
    [isEn]
  );

  // Calculates ONLY the truly available slots for a therapist on a given date
  const getTherapistAvailableSlots = useCallback(
    (targetDate: string, targetDuration?: number) => {
      if (!targetDate) return [];
      const duration = targetDuration ?? Number(selectedServiceObj?.durationMinutes || 45);
      const isClosed = isDayClosed(selectedTherapistSchedule, targetDate);
      if (isClosed) return [];

      const now = new Date();
      const nowIso = now.toISOString();
      const todayStr = nowIso.slice(0, 10);
      if (targetDate < todayStr) return [];

      const daySched = getScheduleForDate(selectedTherapistSchedule, targetDate);
      const therapistUuid = String(selectedTherapistProfile?.userUuid || "");

      // Relevant active appointments for this therapist
      const dailyAppointments = overview.appointments.filter((apt: any) => {
        if (apt.status === "CANCELLED") return false;
        const aptTUuid = String(apt.therapistUuid || apt.provider?.userUuid || "");
        if (therapistUuid && aptTUuid && aptTUuid !== therapistUuid) return false;
        return String(apt.startTime || "").startsWith(targetDate);
      });

      return TIME_SLOTS.filter((slot) => {
        // 1. Not in past today
        const slotIso = `${targetDate}T${slot}:00`;
        if (slotIso < nowIso.slice(0, 16)) return false;

        // 2. Collision with therapist break
        const breakColl = checkCollisionWithBreak(daySched, slot, duration);
        if (breakColl.collides) return false;

        // 3. Inside working intervals
        if (daySched?.intervals?.length) {
          const slotStartM = timeToMinutes(slot);
          const slotEndM = slotStartM + duration;
          const matchingInterval = daySched.intervals.find((int: any) => {
            const intStartM = timeToMinutes(int.start);
            const intEndM = timeToMinutes(int.end, true);
            return slotStartM >= intStartM && slotEndM <= intEndM;
          });
          if (!matchingInterval) return false;

          // If the matching working hours slot is "online only", ensure the service can be conducted online
          if (matchingInterval.isOnlineOnly) {
            const srvLoc = String(selectedServiceObj?.location || "").toLowerCase();
            const canBeOnline =
              srvLoc.includes("online") ||
              srvLoc.includes("video") ||
              srvLoc.includes("virtuel") ||
              srvLoc.includes("begge") ||
              srvLoc.includes("&") ||
              srvLoc.includes("valgfrit");
            if (!canBeOnline) return false;
          }
        }

        // 4. Overlap with existing booked appointments
        const slotStartM = timeToMinutes(slot);
        const slotEndM = slotStartM + duration;
        const overlaps = dailyAppointments.some((apt: any) => {
          const aStartStr = String(apt.startTime || "").slice(11, 16);
          const aEndStr = String(apt.endTime || "").slice(11, 16);
          if (!aStartStr || !aEndStr) return false;
          const aStartM = timeToMinutes(aStartStr);
          const aEndM = timeToMinutes(aEndStr, true);
          return slotStartM < aEndM && slotEndM > aStartM;
        });
        if (overlaps) return false;

        // 5. Timefold validation check
        if (timefoldBookingPlan && timefoldBookingPlan.slots && targetDate === bookingDate) {
          const tfSlot = timefoldBookingPlan.slots.find((s: any) => s.slot === slot);
          if (tfSlot && tfSlot.available === false) return false;
        }

        return true;
      });
    },
    [
      selectedServiceObj,
      selectedTherapistSchedule,
      selectedTherapistProfile?.userUuid,
      overview.appointments,
      timefoldBookingPlan,
      bookingDate,
    ]
  );

  // Auto-select nearest available date & slot when service/therapist changes if current slot is unavailable
  useEffect(() => {
    const currentSlots = getTherapistAvailableSlots(bookingDate);
    if (!currentSlots.includes(bookingSlot)) {
      if (currentSlots.length > 0) {
        setBookingSlot(currentSlots[0]);
      } else {
        const now = new Date();
        for (let i = 0; i < 30; i++) {
          const checkD = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
          const dStr = checkD.toISOString().slice(0, 10);
          const slots = getTherapistAvailableSlots(dStr);
          if (slots.length > 0) {
            setBookingDate(dStr);
            setBookingSlot(slots[0]);
            break;
          }
        }
      }
    }
  }, [selectedServiceId, selectedTherapistProfile?.userUuid, getTherapistAvailableSlots]);

  // Time Slot Approval Status (ensures booking/rescheduling is only possible when approved)
  const currentBookingSlotObj = useMemo(() => {
    return timefoldBookingPlan?.slots?.find((s: any) => s.slot === bookingSlot);
  }, [timefoldBookingPlan, bookingSlot]);

  const isBookingApproved = useMemo(() => {
    if (!bookingDate || !bookingSlot) return false;
    const nowIso = new Date().toISOString();
    const targetIso = `${bookingDate}T${bookingSlot}:00`;
    if (targetIso < nowIso.slice(0, 16)) return false;

    // Strict exclusion of therapist closed days
    if (isDayClosed(selectedTherapistSchedule, bookingDate)) {
      return false;
    }
    // Strict exclusion of therapist breaks
    const daySched = getScheduleForDate(selectedTherapistSchedule, bookingDate);
    const breakColl = checkCollisionWithBreak(
      daySched,
      bookingSlot,
      Number(selectedServiceObj?.durationMinutes || 60)
    );
    if (breakColl.collides) {
      return false;
    }

    if (currentBookingSlotObj) {
      return Boolean(currentBookingSlotObj.available);
    }
    if (timefoldBookingPlan) {
      return Boolean(timefoldBookingPlan.feasible ?? timefoldBookingPlan.recommendedSlot);
    }
    return true;
  }, [bookingDate, bookingSlot, currentBookingSlotObj, timefoldBookingPlan, selectedTherapistSchedule, selectedServiceObj]);

  const rescheduleTherapistProfile = useMemo(() => {
    if (!rescheduleTarget) return null;
    const tUuid = rescheduleTarget.therapistUuid;
    return overview.providers.find((p: any) => p.userUuid === tUuid) || overview.providerProfile;
  }, [rescheduleTarget, overview.providers, overview.providerProfile]);

  const rescheduleTherapistSchedule = useMemo(() => {
    return parseWeeklySchedule(rescheduleTherapistProfile?.workingHoursJson);
  }, [rescheduleTherapistProfile?.workingHoursJson]);

  const currentRescheduleSlotObj = useMemo(() => {
    return timefoldReschedulePlan?.slots?.find((item: any) => item.slot === rescheduleSlot);
  }, [timefoldReschedulePlan, rescheduleSlot]);

  const isRescheduleApproved = useMemo(() => {
    if (!rescheduleDate || !rescheduleSlot) return false;
    const nowIso = new Date().toISOString();
    const targetSlotIso = `${rescheduleDate}T${rescheduleSlot}:00`;
    if (targetSlotIso < nowIso.slice(0, 16)) return false;

    if (isDayClosed(rescheduleTherapistSchedule, rescheduleDate)) {
      return false;
    }
    const daySched = getScheduleForDate(rescheduleTherapistSchedule, rescheduleDate);
    const breakColl = checkCollisionWithBreak(daySched, rescheduleSlot, 60);
    if (breakColl.collides) {
      return false;
    }

    if (currentRescheduleSlotObj) {
      return Boolean(currentRescheduleSlotObj.available);
    }
    if (timefoldReschedulePlan) {
      return Boolean(timefoldReschedulePlan.feasible ?? timefoldReschedulePlan.recommendedSlot);
    }
    return true;
  }, [rescheduleDate, rescheduleSlot, currentRescheduleSlotObj, timefoldReschedulePlan, rescheduleTherapistSchedule]);

  // Journal Composer State
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalMood, setJournalMood] = useState(7);
  const [sharedWithTherapists, setSharedWithTherapists] = useState(true);
  const [selectedTherapistUuids, setSelectedTherapistUuids] = useState<string[]>([]);
  const [initializedTherapistSelection, setInitializedTherapistSelection] = useState(false);
  const [submittingJournal, setSubmittingJournal] = useState(false);

  // Per-entry Individual Access Editor State + Progressive Journal Chunking
  const [editingSharingEntryId, setEditingSharingEntryId] = useState<string | null>(null);
  const [savingSharingEntryId, setSavingSharingEntryId] = useState<string | null>(null);
  const [journalChunkSize, setJournalChunkSize] = useState(10);
  const [journalSearchFilter, setJournalSearchFilter] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllPcl5, setShowAllPcl5] = useState(false);

  // Handshake Validity & Historical JGit Interval Editor State
  const [editingHandshakeId, setEditingHandshakeId] = useState<string | null>(null);
  const [savingHandshakeId, setSavingHandshakeId] = useState<string | null>(null);
  const [selectedHandshakeId, setSelectedHandshakeId] = useState<string | null>(null);
  const [handshakeIntervalDraft, setHandshakeIntervalDraft] = useState<{
    validFrom: string;
    validTo: string;
    historyStartDate: string;
    historyEndDate: string;
  }>({
    validFrom: "",
    validTo: "",
    historyStartDate: "",
    historyEndDate: "",
  });

  const currentHandshake = useMemo(() => {
    return (
      overview.handshakes.find((h: any) => String(h.id) === String(selectedHandshakeId)) ||
      overview.handshakes[0] ||
      null
    );
  }, [overview.handshakes, selectedHandshakeId]);

  // Optional booking interval states
  const [bookingValidTo, setBookingValidTo] = useState<string>("");
  const [bookingHistoryStart, setBookingHistoryStart] = useState<string>("");
  const [showBookingIntervalOptions, setShowBookingIntervalOptions] = useState(false);

  // Active Client Sub-page Tab State + JGit Version History Window State
  const [activeClientTab, setActiveClientTab] = useState<string>("timeline");
  const [gitHistory, setGitHistory] = useState<any[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);
  const [isRefreshingGit, setIsRefreshingGit] = useState(false);

  // Journal Sub-Mode State: "entry" | "quiz" | "questions"
  const [journalSubMode, setJournalSubMode] = useState<"entry" | "quiz" | "questions">("entry");

  // PCL-5 Questionnaire State
  const [pclAnswers, setPclAnswers] = useState<number[]>([1, 1, 1, 1, 1]);
  const [submittingPcl5, setSubmittingPcl5] = useState(false);

  // Therapist 1-10 Questions State
  const [therapistAnswers, setTherapistAnswers] = useState<Record<string, number>>({
    sleep: 7,
    stress: 6,
    mastery: 8,
    mood: 7,
  });
  const [therapistQuestionNote, setTherapistQuestionNote] = useState("");
  const [submittingTherapistQuestions, setSubmittingTherapistQuestions] = useState(false);

  const THERAPIST_QUESTIONS = isEn ? THERAPIST_MONITOR_QUESTIONS_EN : THERAPIST_MONITOR_QUESTIONS_DA;

  const currentPcl5RawSum = useMemo(() => pclAnswers.reduce((a, b) => a + b, 0), [pclAnswers]);
  const currentPcl5ScaledScore = currentPcl5RawSum * 4;
  const currentPcl5Severity = useMemo(() => {
    return currentPcl5ScaledScore >= 33
      ? "High Symptoms (Above Clinical Threshold)"
      : currentPcl5ScaledScore >= 20
      ? "Moderate Symptoms"
      : "Mild Symptoms";
  }, [currentPcl5ScaledScore]);

  const currentTherapistAvgScore = useMemo(() => {
    const vals = Object.values(therapistAnswers);
    if (vals.length === 0) return 7;
    return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  }, [therapistAnswers]);

  // Client Monthly Calendar State (for My Appointments tab)
  const [clientMonthDate, setClientMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

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

      // Fast single overview fetch from PostgreSQL (journals already included and sorted)
      const ovRes = await fetch(`/api/backend/clinic/client/${meData.userUuid}/overview`);

      if (ovRes.ok) {
        const ovData = await ovRes.json();
        const ovJournals = Array.isArray(ovData.journals) ? ovData.journals : [];
        const mergedJournals = [...ovJournals].sort((a, b) =>
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchDatabaseData(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Personal Stamdata Form State
  const [clientProfileForm, setClientProfileForm] = useState({
    userId: "",
    fullName: "",
    dateOfBirth: "",
    homeAddress: "",
    postalCode: "",
    phoneNumber: "",
    email: "",
  });
  const [savingClientProfile, setSavingClientProfile] = useState(false);
  const [clientProfileSavedMsg, setClientProfileSavedMsg] = useState<string | null>(null);

  const isSelectedServiceAtClient = useMemo(() => {
    const locStr = String(selectedServiceObj?.location || "").toLowerCase();
    return locStr.includes("klient") || locStr.includes("client") || locStr.includes("hjemmebesøg");
  }, [selectedServiceObj]);

  const [bookingClientAddress, setBookingClientAddress] = useState("");

  useEffect(() => {
    const profileAddr = [
      clientProfileForm.homeAddress || overview.clientProfile?.homeAddress,
      clientProfileForm.postalCode || overview.clientProfile?.postalCode,
    ].filter(Boolean).join(", ");
    if (profileAddr && !bookingClientAddress) {
      setBookingClientAddress(profileAddr);
    }
  }, [clientProfileForm.homeAddress, clientProfileForm.postalCode, overview.clientProfile, bookingClientAddress]);

  useEffect(() => {
    const cp = overview.clientProfile || me?.clientProfile || {};
    setClientProfileForm({
      userId: cp.userId || me?.userUuid || "",
      fullName: cp.fullName || me?.fullName || userName || "",
      dateOfBirth: cp.dateOfBirth || "",
      homeAddress: cp.homeAddress || "",
      postalCode: cp.postalCode || "",
      phoneNumber: cp.phoneNumber || "",
      email: cp.email || me?.email || "",
    });
  }, [overview.clientProfile, me, userName]);

  const handleSaveClientProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClientProfile(true);
    try {
      const res = await fetch("/api/backend/clinic/client-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientProfileForm),
      });
      if (res.ok) {
        setClientProfileSavedMsg(
          loc(
            "Dine personlige stamdata er opdateret.",
            "Your personal profile data has been updated."
          )
        );
        setTimeout(() => setClientProfileSavedMsg(null), 4000);
        showMessage(
          "success",
          loc(
            "Dine personlige stamdata er gemt.",
            "Your personal profile data has been saved."
          )
        );
        fetchDatabaseData(true);
      } else {
        showMessage(
          "danger",
          loc("Kunne ikke gemme stamdata.", "Could not save profile data.")
        );
      }
    } catch {
      showMessage(
        "danger",
        loc("Fejl ved lagring af stamdata.", "Error saving profile data.")
      );
    } finally {
      setSavingClientProfile(false);
    }
  };

  useEffect(() => {
    fetchDatabaseData(false);
  }, [fetchDatabaseData]);

  // Non-blocking background fetch for Git history
  useEffect(() => {
    if (me?.userUuid && gitHistory.length === 0) {
      fetch(`/api/backend/journals/history/${me.userUuid}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((gData) => {
          if (Array.isArray(gData)) {
            setGitHistory(gData);
            setSelectedCommit((prev: any) => prev || gData[0] || null);
          }
        })
        .catch(() => {});
    }
  }, [me?.userUuid, gitHistory.length]);

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

  // Fetch optimal slots when rescheduling an appointment
  useEffect(() => {
    if (!rescheduleTarget?.therapistUuid || !rescheduleDate) {
      setTimefoldReschedulePlan(null);
      setLoadingTimefoldReschedule(false);
      return;
    }
    let cancelled = false;
    setLoadingTimefoldReschedule(true);
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
      })
      .finally(() => {
        if (!cancelled) setLoadingTimefoldReschedule(false);
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

    if (!isBookingApproved) {
      showMessage(
        "danger",
        loc(
          "Tidspunktet er ikke godkendt. Vælg venligst et godkendt tidspunkt.",
          "The time slot is not approved. Please select an approved time slot."
        )
      );
      return;
    }

    const startIso = `${bookingDate}T${bookingSlot}:00`;
    const [h, m] = bookingSlot.split(":");
    const endHour = String(Number(h) + 1).padStart(2, "0");
    const endIso = `${bookingDate}T${endHour}:${m}:00`;

    setSubmittingBooking(true);
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
          location: isSelectedServiceAtClient
            ? ((bookingClientAddress.trim() || [
                clientProfileForm.homeAddress || overview.clientProfile?.homeAddress,
                clientProfileForm.postalCode || overview.clientProfile?.postalCode,
              ].filter(Boolean).join(", ")).trim()
                ? `${loc("Hos klienten:", "At client's:")} ${(bookingClientAddress.trim() || [
                    clientProfileForm.homeAddress || overview.clientProfile?.homeAddress,
                    clientProfileForm.postalCode || overview.clientProfile?.postalCode,
                  ].filter(Boolean).join(", ")).trim()}`
                : loc("Hos klienten (Hjemmebesøg)", "At client's home"))
            : (serviceObj?.location || null),
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

      if (isSelectedServiceAtClient && bookingClientAddress.trim() && !clientProfileForm.homeAddress) {
        fetch("/api/backend/clinic/client-profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...clientProfileForm,
            userId: me.userUuid,
            homeAddress: bookingClientAddress.trim(),
          }),
        }).catch(() => {});
      }
      if (grantHandshakeOnBook) {
        await fetch("/api/backend/clinic/handshakes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientUuid: me.userUuid,
            therapistUuid,
            status: "ACTIVE",
            validFrom: new Date().toISOString().slice(0, 10),
            validTo: bookingValidTo || null,
            historyStartDate: bookingHistoryStart || null,
            historyEndDate: null,
          }),
        });
        setBookingValidTo("");
        setBookingHistoryStart("");
        setShowBookingIntervalOptions(false);
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
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Reschedule Appointment (PUT /api/v1/appointments/{id})
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;

    if (!isRescheduleApproved) {
      showMessage(
        "danger",
        loc(
          "Tidspunktet er ikke godkendt. Vælg venligst et godkendt tidspunkt.",
          "The time slot is not approved. Please select an approved time slot."
        )
      );
      return;
    }

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

    setSubmittingJournal(true);
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
            "Dagbogsindlæg gemt og synkroniseret med journalhistorik.",
            "Journal entry saved and synced with history."
          )
        );
      }
    } catch {
      showMessage("danger", loc("Kunne ikke gemme dagbogsindlæg.", "Could not save journal entry."));
    } finally {
      setSubmittingJournal(false);
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
    setIsRefreshingGit(true);
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
    } finally {
      setIsRefreshingGit(false);
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

  // Open Handshake Interval Editor
  const openHandshakeIntervalEditor = (hs: any) => {
    setEditingHandshakeId(String(hs.id));
    setHandshakeIntervalDraft({
      validFrom: hs.validFrom || "",
      validTo: hs.validTo || "",
      historyStartDate: hs.historyStartDate || "",
      historyEndDate: hs.historyEndDate || "",
    });
  };

  // Save Handshake Validity & Historical JGit Interval
  const handleSaveHandshakeIntervals = async (handshakeId: string | number) => {
    setSavingHandshakeId(String(handshakeId));
    try {
      const res = await fetch(`/api/backend/clinic/handshakes/${handshakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validFrom: handshakeIntervalDraft.validFrom || null,
          validTo: handshakeIntervalDraft.validTo || null,
          historyStartDate: handshakeIntervalDraft.historyStartDate || null,
          historyEndDate: handshakeIntervalDraft.historyEndDate || null,
        }),
      });
      if (!res.ok) {
        throw new Error("Fejl ved lagring af tidsintervaller");
      }
      await fetchDatabaseData();
      setEditingHandshakeId(null);
      showMessage(
        "success",
        loc(
          "Tidsintervaller for Handshake og JGit er opdateret.",
          "Time intervals for Handshake and JGit have been updated."
        )
      );
    } catch {
      showMessage(
        "danger",
        loc(
          "Kunne ikke opdatere tidsintervaller for dette Handshake.",
          "Could not update time intervals for this Handshake."
        )
      );
    } finally {
      setSavingHandshakeId(null);
    }
  };

  // Submit PCL-5 Test (POST /api/v1/psychotraumatology/tests)
  const handleSubmitPcl5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;

    setSubmittingPcl5(true);
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
    } finally {
      setSubmittingPcl5(false);
    }
  };

  // Submit Therapist 1-10 Monitoring Questions as JGit-versioned Journal Entry (POST /api/v1/journals)
  const handleSubmitTherapistQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.userUuid) return;

    setSubmittingTherapistQuestions(true);
    const avgScore = currentTherapistAvgScore;
    const questionsList = isEn ? THERAPIST_MONITOR_QUESTIONS_EN : THERAPIST_MONITOR_QUESTIONS_DA;
    const breakdownText = questionsList
      .map((q) => `- **${q.title}**: ${therapistAnswers[q.id] || 0} / 10 (${q.description})`)
      .join("\n");

    const fullContent = [
      loc("### Ugentlig Monitorering til Behandler", "### Weekly Therapist Check-In"),
      loc(`**Samlet gennemsnit:** ${avgScore} / 10`, `**Overall average:** ${avgScore} / 10`),
      "",
      loc("#### Besvarelser på 1–10 skala:", "#### Answers on 1–10 scale:"),
      breakdownText,
      "",
      therapistQuestionNote.trim()
        ? loc(`#### Klientens kommentar:\n${therapistQuestionNote.trim()}`, `#### Client comments:\n${therapistQuestionNote.trim()}`)
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const activeHs = overview.handshakes.filter((h: any) => h.status === "ACTIVE");
    const activeHsUuids = activeHs.map((h: any) => String(h.therapistUuid));

    try {
      const res = await fetch("/api/backend/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: me.userUuid,
          title: loc(
            `Behandler-spørgsmål: Monitorering (${avgScore}/10)`,
            `Therapist Questions: Monitoring (${avgScore}/10)`
          ),
          content: fullContent,
          moodRating: Math.min(10, Math.max(1, Math.round(avgScore))),
          sharedWithTherapists: true,
          sharedTherapistUuids: activeHsUuids,
        }),
      });

      if (res.ok) {
        setTherapistQuestionNote("");
        await fetchDatabaseData();
        showMessage(
          "success",
          loc(
            `Besvarelse indsendt til din behandler (Gennemsnit: ${avgScore}/10). Synkroniseret med JGit.`,
            `Answers submitted to your therapist (Average: ${avgScore}/10). Synced with JGit.`
          )
        );
      }
    } catch {
      showMessage(
        "danger",
        loc("Kunne ikke indsende besvarelse til behandler.", "Could not submit answers to therapist.")
      );
    } finally {
      setSubmittingTherapistQuestions(false);
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

  // Filtered & Progressive Chunked Journals for Fast Rendering
  const filteredJournals = overview.journals.filter((entry: any) => {
    if (!journalSearchFilter.trim()) return true;
    const q = journalSearchFilter.toLowerCase();
    const title = String(entry.title || "").toLowerCase();
    const content = String(entry.content || "").toLowerCase();
    return title.includes(q) || content.includes(q);
  });
  const visibleJournals = filteredJournals.slice(0, journalChunkSize);
  const hasMoreJournals = filteredJournals.length > journalChunkSize;

  const therapistQuestionJournals = overview.journals.filter((entry: any) => {
    const title = String(entry.title || "");
    return title.includes("Behandler-spørgsmål") || title.includes("Therapist Questions");
  });

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
                <span>{loc("Mine Aftaler", "My Appointments")}</span>
              </Tabs.Tab>
              <Tabs.Tab value="booking" className="sidebar-tab-btn">
                <i className="bi bi-calendar-plus"></i>
                <span>{loc("Find Behandler & Book", "Find Therapist & Book")}</span>
              </Tabs.Tab>
              <Tabs.Tab value="journal" className="sidebar-tab-btn">
                <i className="bi bi-journal-richtext"></i>
                <span>{loc("Min Dagbog & PCL-5", "My Journal & PCL-5")}</span>
              </Tabs.Tab>
              <Tabs.Tab value="pcl5_privacy" className="sidebar-tab-btn">
                <i className="bi bi-shield-lock"></i>
                <span>{loc("Behandler-Adgang", "Therapist Access")}</span>
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
                <span>{loc("JGit Tidslinje", "JGit Timeline")}</span>
              </Tabs.Tab>
              <Tabs.Tab value="stamdata" className="sidebar-tab-btn">
                <i className="bi bi-person-vcard text-primary"></i>
                <span>{loc("Mine Stamdata", "My Profile Data")}</span>
              </Tabs.Tab>
            </Tabs.List>

            {/* Book Aftale Form in Left Sidebar */}
            {activeClientTab === "booking" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2.5">
                <form id="client-booking-form" onSubmit={handleBookAppointment} className="d-flex flex-column gap-2.5">
                  <div
                    className="d-flex justify-content-between align-items-center"
                    style={{ paddingLeft: "0.8rem", paddingRight: "0.8rem" }}
                  >
                    <span
                      className="fw-bold text-dark small d-inline-flex align-items-center"
                      style={{ fontSize: "0.82rem", gap: "0.55rem" }}
                    >
                      <i className="bi bi-calendar-plus text-primary"></i>
                      <span>{loc("Book Aftale", "Book Appointment")}</span>
                    </span>
                  </div>

                  <div>
                    <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.75rem" }}>
                      {loc("Valgt Ydelse", "Selected Service")}
                    </label>
                    <select
                      className="form-select form-select-sm rounded-3"
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      required
                      style={{ fontSize: "0.78rem" }}
                    >
                      {overview.services.map((srv: any) => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} ({srv.durationMinutes}m • {srv.price} DKK)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Modern Date & Time Picker Trigger Card */}
                  <div>
                    <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.75rem" }}>
                      {loc("Vælg Dato & Tidspunkt (Kun Ledige Tider)", "Select Date & Time (Only Available Slots)")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTempBookingDate(bookingDate);
                        setTempBookingSlot(bookingSlot);
                        const [y, m] = (bookingDate || todayDateStr).split("-").map(Number);
                        if (y && m) setPickerMonthDate(new Date(y, m - 1, 1));
                        setIsBookingPickerOpen(true);
                      }}
                      className="btn btn-outline-secondary bg-white w-100 text-start p-2.5 rounded-3 d-flex align-items-center justify-content-between shadow-xs border transition-all"
                      style={{ borderColor: "#cbd5e1" }}
                      title={loc("Klik for at åbne kalenderen og vælge en ledig tid", "Click to open calendar and choose an available time")}
                    >
                      <div className="d-flex align-items-center gap-2 text-truncate me-2">
                        <div
                          className="d-flex align-items-center justify-content-center rounded-2 bg-success-subtle text-success flex-shrink-0"
                          style={{ width: "34px", height: "34px" }}
                        >
                          <i className="bi bi-calendar-check fs-6"></i>
                        </div>
                        <div className="text-truncate">
                          <div className="fw-bold text-dark text-truncate" style={{ fontSize: "0.82rem" }}>
                            {formatFriendlyDate(bookingDate)}
                          </div>
                          <div className="text-success fw-semibold d-flex align-items-center gap-1" style={{ fontSize: "0.72rem" }}>
                            <i className="bi bi-clock"></i>
                            <span>kl. {bookingSlot}</span>
                            <span className="badge bg-success-subtle text-success border border-success-subtle ms-1" style={{ fontSize: "0.62rem" }}>
                              {loc("Ledigt", "Available")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="badge bg-success text-white rounded-pill px-2.5 py-1.5 flex-shrink-0" style={{ fontSize: "0.68rem" }}>
                        {loc("Skift tid", "Change")}
                      </span>
                    </button>
                    {/* Hidden inputs to preserve form submission values */}
                    <input type="hidden" name="bookingDate" value={bookingDate} required />
                    <input type="hidden" name="bookingSlot" value={bookingSlot} required />
                  </div>
                  {/* Home visit address card if service is at client's home */}
                  {isSelectedServiceAtClient && (
                    <div className="p-2.5 rounded-3 bg-light border border-teal-subtle">
                      <div className="d-flex align-items-center gap-1.5 mb-1 text-teal fw-semibold" style={{ fontSize: "0.75rem" }}>
                        <i className="bi bi-house-door-fill"></i>
                        <span>{loc("Hjemmebesøg – Din adresse", "Home visit – Your address")}</span>
                      </div>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-2 bg-white"
                        style={{ fontSize: "0.76rem" }}
                        placeholder={loc("f.eks. Strandvejen 42, 2. th, 2100 København Ø", "e.g. Main St 42, 2100 Copenhagen")}
                        value={bookingClientAddress}
                        onChange={(e) => setBookingClientAddress(e.target.value)}
                        required
                      />
                      <div className="text-muted mt-1" style={{ fontSize: "0.66rem" }}>
                        {loc(
                          "Udfyldes automatisk på aftalen, så terapeuten ved præcis, hvor sessionen afholdes.",
                          "Automatically populated on appointment so therapist knows where to arrive."
                        )}
                      </div>
                    </div>
                  )}

                  <div className="d-flex align-items-center justify-content-between p-2 rounded-3 bg-white border">
                    <div className="pe-2">
                      <div className="small fw-semibold" style={{ fontSize: "0.74rem" }}>
                        {loc("Handshake-samtykke", "Handshake consent")}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.66rem" }}>
                        {loc("Deler journalnotater med behandler.", "Shares journals with therapist.")}
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

                  {grantHandshakeOnBook && (
                    <div className="text-start">
                      <button
                        type="button"
                        onClick={() => setShowBookingIntervalOptions(!showBookingIntervalOptions)}
                        className="btn btn-link p-0 text-decoration-none small text-secondary fw-semibold d-inline-flex align-items-center gap-1"
                        style={{ fontSize: "0.72rem" }}
                      >
                        <i className={`bi bi-chevron-${showBookingIntervalOptions ? "down" : "right"}`}></i>
                        <span>{loc("Tilpas adgangsintervaller", "Customize access intervals")}</span>
                      </button>

                      {showBookingIntervalOptions && (
                        <div className="p-2 rounded-3 bg-white border mt-1.5 d-flex flex-column gap-1.5">
                          <div>
                            <label className="form-label small fw-semibold text-dark mb-0.5" style={{ fontSize: "0.7rem" }}>
                              {loc("Udløbsdato (til):", "Expiration date (to):")}
                            </label>
                            <input
                              type="date"
                              className="form-control form-control-sm"
                              value={bookingValidTo}
                              onChange={(e) => setBookingValidTo(e.target.value)}
                              style={{ fontSize: "0.73rem" }}
                            />
                          </div>

                          <div>
                            <label className="form-label small fw-semibold text-dark mb-0.5" style={{ fontSize: "0.7rem" }}>
                              {loc("Historikstart (fra):", "History start (from):")}
                            </label>
                            <input
                              type="date"
                              className="form-control form-control-sm"
                              value={bookingHistoryStart}
                              onChange={(e) => setBookingHistoryStart(e.target.value)}
                              style={{ fontSize: "0.73rem" }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isBookingApproved || loadingTimefoldBooking || submittingBooking}
                    className="btn btn-primary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 mt-1"
                    style={{ fontSize: "0.85rem", backgroundColor: "#2563eb", borderColor: "#2563eb" }}
                    title={loc("Bekræft booking i databasen", "Confirm booking in database")}
                  >
                    {submittingBooking ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" />
                        <span>{loc("Booker...", "Booking...")}</span>
                      </>
                    ) : (
                      <>
                        <i className="bi bi-calendar-check"></i>
                        <span>{loc("Bekræft Booking i Databasen", "Confirm Booking in Database")}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Save Stamdata Button in Left Sidebar */}
            {activeClientTab === "stamdata" && (
              <div className="pt-2 border-top mt-1">
                <button
                  type="submit"
                  form="client-profile-form"
                  disabled={savingClientProfile}
                  className="btn btn-primary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.85rem" }}
                  title={loc("Gem dine personlige stamdata", "Save your profile data")}
                >
                  {savingClientProfile ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>{loc("Gemmer...", "Saving...")}</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2"></i>
                      <span>{loc("Gem stamdata", "Save profile data")}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Refresh Timeline Button in Left Sidebar */}
            {activeClientTab === "jgit_timeline" && (
              <div className="pt-2 border-top mt-1">
                <button
                  type="button"
                  onClick={() => handleOpenGitHistory()}
                  disabled={isRefreshingGit}
                  className="btn btn-outline-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{ fontSize: "0.85rem" }}
                  title={loc("Genindlæs tidslinjen med de nyeste journal-revisioner", "Reload timeline with latest revisions")}
                >
                  <i className={`bi bi-arrow-clockwise ${isRefreshingGit ? "spin" : ""}`}></i>
                  <span>{isRefreshingGit ? loc("Opdaterer...", "Refreshing...") : loc("Opdater Tidslinje", "Refresh Timeline")}</span>
                </button>
              </div>
            )}

            {/* Contextual Action Button & Info in Left Sidebar for Journal Modes */}
            {activeClientTab === "journal" && journalSubMode === "entry" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                <button
                  type="submit"
                  form="journal-composer-form"
                  disabled={submittingJournal}
                  className="btn btn-primary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.85rem", backgroundColor: "#23533d", borderColor: "#23533d" }}
                  title={loc("Gem dit dagbogsindlæg", "Save your journal entry")}
                >
                  {submittingJournal ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>{loc("Gemmer...", "Saving...")}</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-journal-check"></i>
                      <span>{loc("Gem indlæg", "Save entry")}</span>
                    </>
                  )}
                </button>

                {/* Handshake Sharing UI */}
                <div className="p-2.5 rounded-3 bg-white border">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <div className="fw-semibold text-dark" style={{ fontSize: "0.78rem" }}>
                        {sharedWithTherapists
                          ? activeHandshakes.length > 0
                            ? loc(
                                `Delt med Handshake (${selectedTherapistUuids.length}/${activeHandshakes.length})`,
                                `Shared with Handshake (${selectedTherapistUuids.length}/${activeHandshakes.length})`
                              )
                            : loc(
                                "Delt med Handshake",
                                "Shared with Handshake"
                              )
                          : loc("Kun privat for mig", "Private (Only me)")}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                        {sharedWithTherapists
                          ? loc(
                              "Vælg Handshake-terapeuter nedenfor.",
                              "Select Handshake therapists below."
                            )
                          : loc(
                              "Helt privat fra alle behandlere.",
                              "Strictly private from all therapists."
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
                    <div className="mt-2 pt-2 border-top">
                      <div className="d-flex justify-content-between align-items-center mb-1.5">
                        <span className="text-muted fw-semibold" style={{ fontSize: "0.72rem" }}>
                          {loc(
                            "Vælg Handshake-terapeuter:",
                            "Select Handshake therapists:"
                          )}
                        </span>
                        {activeHandshakes.length > 1 && (
                          <div className="d-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTherapistUuids(
                                  activeHandshakes.map((h: any) => String(h.therapistUuid))
                                );
                                setSharedWithTherapists(true);
                              }}
                              className="btn btn-link btn-sm p-0 text-decoration-none"
                              style={{ fontSize: "0.7rem" }}
                            >
                              {loc("Alle", "All")}
                            </button>
                            <span className="text-muted" style={{ fontSize: "0.7rem" }}>•</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTherapistUuids([]);
                                setSharedWithTherapists(false);
                              }}
                              className="btn btn-link btn-sm p-0 text-decoration-none text-secondary"
                              style={{ fontSize: "0.7rem" }}
                            >
                              {loc("Privat", "None")}
                            </button>
                          </div>
                        )}
                      </div>

                      {activeHandshakes.length === 0 ? (
                        <div className="small text-muted fst-italic" style={{ fontSize: "0.72rem" }}>
                          {loc(
                            "Ingen aktive Handshake-terapeuter endnu.",
                            "No active Handshake therapists yet."
                          )}
                        </div>
                      ) : (
                        <div className="d-flex flex-column gap-1">
                          {activeHandshakes.map((hs: any) => {
                            const tUuid = String(hs.therapistUuid);
                            const isChecked = selectedTherapistUuids.includes(tUuid);
                            return (
                              <label
                                key={hs.id || tUuid}
                                className={`d-flex align-items-center justify-content-between p-1.5 rounded-2 border ${
                                  isChecked ? "bg-success-subtle border-success-subtle" : "bg-light"
                                }`}
                                style={{ cursor: "pointer", fontSize: "0.75rem" }}
                              >
                                <div className="d-flex align-items-center gap-1.5 text-truncate me-1">
                                  <input
                                    type="checkbox"
                                    className="form-check-input mt-0 flex-shrink-0"
                                    checked={isChecked}
                                    onChange={() => toggleComposerTherapist(tUuid)}
                                  />
                                  <div className="text-truncate">
                                    <div className="fw-semibold text-dark text-truncate" style={{ fontSize: "0.74rem" }}>
                                      {hs.therapistName || loc("Behandler", "Therapist")}
                                    </div>
                                    {hs.organisationName && (
                                      <div className="text-muted text-truncate" style={{ fontSize: "0.66rem" }}>
                                        {hs.organisationName}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`badge flex-shrink-0 ${
                                    isChecked
                                      ? "bg-success text-white"
                                      : "bg-secondary-subtle text-secondary"
                                  }`}
                                  style={{ fontSize: "0.62rem" }}
                                >
                                  {isChecked
                                    ? loc("Har adgang", "Access")
                                    : loc("Ingen", "None")}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quiz / PCL-5 Left Sidebar Action Button & Status */}
            {activeClientTab === "journal" && journalSubMode === "quiz" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                <button
                  type="submit"
                  form="pcl5-form"
                  disabled={submittingPcl5}
                  className="btn btn-primary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.85rem", backgroundColor: "#23533d", borderColor: "#23533d" }}
                  title={loc("Indsend din PCL-5 vurdering", "Submit your PCL-5 assessment")}
                >
                  {submittingPcl5 ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>{loc("Indsender...", "Submitting...")}</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle"></i>
                      <span>{loc("Indsend PCL-5 Vurdering", "Submit PCL-5 Assessment")}</span>
                    </>
                  )}
                </button>

                <div className="p-2.5 rounded-3 bg-white border">
                  <div className="d-flex align-items-center justify-content-between mb-1.5">
                    <span className="fw-semibold text-dark" style={{ fontSize: "0.78rem" }}>
                      {loc("Estimeret PCL-5", "Estimated PCL-5")}
                    </span>
                    <span className="badge bg-primary text-white rounded-pill px-2 py-1" style={{ fontSize: "0.72rem" }}>
                      {currentPcl5ScaledScore} / 80
                    </span>
                  </div>
                  <div className="fw-bold text-dark mb-1" style={{ fontSize: "0.74rem" }}>
                    {currentPcl5Severity}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                    {loc(
                      "Gemmes direkte i databasen og synkroniseres med din behandler.",
                      "Saved directly to database and synced with your therapist."
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Therapist 1-10 Questions Left Sidebar Action Button & Status */}
            {activeClientTab === "journal" && journalSubMode === "questions" && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                <button
                  type="submit"
                  form="therapist-questions-form"
                  disabled={submittingTherapistQuestions}
                  className="btn btn-primary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2"
                  style={{ fontSize: "0.85rem", backgroundColor: "#23533d", borderColor: "#23533d" }}
                  title={loc("Indsend svar til din behandler", "Submit answers to your therapist")}
                >
                  {submittingTherapistQuestions ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>{loc("Indsender svar...", "Submitting answers...")}</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send-check"></i>
                      <span>{loc("Indsend Svar til Behandler", "Submit Answers to Therapist")}</span>
                    </>
                  )}
                </button>

                <div className="p-2.5 rounded-3 bg-white border">
                  <div className="d-flex align-items-center justify-content-between mb-1.5">
                    <span className="fw-semibold text-dark" style={{ fontSize: "0.78rem" }}>
                      {loc("Gennemsnitlig score", "Average score")}
                    </span>
                    <span className="badge bg-success text-white rounded-pill px-2 py-1" style={{ fontSize: "0.72rem" }}>
                      {currentTherapistAvgScore} / 10
                    </span>
                  </div>
                  <div className="text-muted mb-1" style={{ fontSize: "0.72rem" }}>
                    {activeHandshakes.length > 0
                      ? loc(
                          `Deles automatisk med ${activeHandshakes.length} aktiv(e) Handshake-behandler(e).`,
                          `Automatically shared with ${activeHandshakes.length} active Handshake therapist(s).`
                        )
                      : loc(
                          "Gemmes i din private journal (ingen aktiv behandler tilknyttet endnu).",
                          "Saved in your private journal (no active therapist linked yet)."
                        )}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.68rem" }}>
                    {loc(
                      "Synkroniseres automatisk med JGit versionshistorik.",
                      "Automatically synced with JGit version history."
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Handshake Action Buttons in Left Sidebar */}
            {(activeClientTab === "pcl5_privacy" || activeClientTab === "handshake") && (
              <div className="pt-2 border-top mt-1 d-flex flex-column gap-2">
                {overview.handshakes.length > 1 && (
                  <div className="mb-1">
                    <label className="form-label small text-muted mb-1" style={{ fontSize: "0.72rem" }}>
                      {loc("Valgt behandler:", "Selected therapist:")}
                    </label>
                    <select
                      className="form-select form-select-sm rounded-pill"
                      value={currentHandshake?.id || ""}
                      onChange={(e) => setSelectedHandshakeId(e.target.value)}
                      style={{ fontSize: "0.78rem" }}
                    >
                      {overview.handshakes.map((h: any) => (
                        <option key={h.id} value={h.id}>
                          {h.therapistName || loc("Behandler", "Therapist")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 1. Administrer delte indlæg */}
                <button
                  type="button"
                  onClick={() => setActiveClientTab("journal")}
                  className="btn btn-outline-secondary w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                  style={{ fontSize: "0.82rem" }}
                  title={loc("Gå til dagbog og administrer hvilke indlæg der deles", "Go to diary and manage which entries are shared")}
                >
                  <i className="bi bi-journal-richtext"></i>
                  <span>{loc("Administrer delte indlæg", "Manage shared entries")}</span>
                </button>

                {/* 2. Indstil JGit & Tidsintervaller */}
                <button
                  type="button"
                  disabled={!currentHandshake}
                  onClick={() => {
                    if (!currentHandshake) return;
                    editingHandshakeId === String(currentHandshake.id)
                      ? setEditingHandshakeId(null)
                      : openHandshakeIntervalEditor(currentHandshake);
                  }}
                  className={`btn w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 ${
                    currentHandshake && editingHandshakeId === String(currentHandshake.id)
                      ? "btn-secondary"
                      : "btn-outline-primary bg-white"
                  }`}
                  style={{ fontSize: "0.82rem" }}
                  title={loc("Indstil tidsperiode og JGit historikadgang for denne behandler", "Set time window and JGit history access")}
                >
                  <i className="bi bi-sliders"></i>
                  <span>
                    {currentHandshake && editingHandshakeId === String(currentHandshake.id)
                      ? loc("Luk indstillinger", "Close settings")
                      : loc("Indstil JGit & Tidsintervaller", "Set JGit & Time Intervals")}
                  </span>
                </button>

                {/* 3. Tilbagekald Handshake (eller Accepter/Genaktiver) */}
                {(!currentHandshake || currentHandshake.status === "ACTIVE") && (
                  <button
                    type="button"
                    disabled={!currentHandshake}
                    onClick={() => currentHandshake && handleHandshakeStatus(currentHandshake.id, "REVOKED")}
                    className="btn btn-outline-danger w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                    style={{ fontSize: "0.82rem" }}
                    title={loc("Tilbagekald behandlerens adgang øjeblikkeligt", "Revoke therapist access immediately")}
                  >
                    <i className="bi bi-shield-x"></i>
                    <span>{loc("Tilbagekald Handshake", "Revoke Handshake")}</span>
                  </button>
                )}
                {currentHandshake && currentHandshake.status === "PENDING" && (
                  <div className="d-flex flex-column gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleHandshakeStatus(currentHandshake.id, "ACTIVE")}
                      className="btn btn-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <i className="bi bi-check-circle"></i>
                      <span>{loc("Accepter Handshake", "Accept Handshake")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHandshakeStatus(currentHandshake.id, "REVOKED")}
                      className="btn btn-outline-danger w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <i className="bi bi-x-circle"></i>
                      <span>{loc("Afvis", "Decline")}</span>
                    </button>
                  </div>
                )}
                {currentHandshake && currentHandshake.status !== "ACTIVE" && currentHandshake.status !== "PENDING" && (
                  <button
                    type="button"
                    onClick={() => handleHandshakeStatus(currentHandshake.id, "ACTIVE")}
                    className="btn btn-outline-success w-100 rounded-pill py-2 px-3 fw-semibold shadow-xs d-inline-flex align-items-center justify-content-center gap-2 bg-white"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <i className="bi bi-arrow-repeat"></i>
                    <span>{loc("Genaktiver Handshake", "Reactivate Handshake")}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT 7/8 MAIN WORKSPACE AREA (1/8 -> 8/8) */}
        <div className="portal-workspace-7of8 d-flex flex-column gap-4">
          {/* Welcome Banner + KPI Cards (Only shown on 'My Appointments' page) */}
          {activeClientTab === "timeline" && (
            <div className="card border-0 shadow-xs rounded-4 bg-white">
              <div className="card-body p-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
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
                      {tr("dashboard.personal.description", loc("Dine aftaler, journaler, versionshistorik og behandler-samtykker opdateres i realtid.", "Your appointments, journals, version history, and therapist consents are updated in real time."))}
                      {secureStatus ? ` • (${secureStatus})` : ""}
                    </p>
                  </div>
                </div>

                {/* Pending Handshake Consent Banner (Q3) */}
                {pendingHandshakes.map((hs: any) => (
                  <div
                    key={hs.id}
                    className="alert alert-warning border-warning-subtle rounded-4 d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-0"
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
                      "Henter dine data...",
                      "Loading your data..."
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
                      <div className="p-3.5 rounded-4 border bg-light bg-opacity-50 mb-0 p-3">
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
                    </div>

                    {/* Right 5 Cols: My Appointments (Upcoming & Previous) */}
                    <div className="col-lg-5">
                      {/* Search Bar + Next / Upcoming Appointments & Previous Appointments */}
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <h5 className="fw-bold mb-0">
                          {loc(
                            "Mine Aftaler (Kommende & Tidligere)",
                            "My Appointments (Upcoming & Previous)"
                          )}
                        </h5>
                        <div className="input-group input-group-sm" style={{ maxWidth: "240px" }}>
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
                                    <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
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
                                        <div className="small text-dark fw-semibold mt-1 d-flex flex-wrap align-items-center gap-2">
                                          <div className="d-flex align-items-center gap-1">
                                            <i className={`bi ${isOnline ? "bi-camera-video-fill text-info" : "bi-geo-alt-fill text-danger"}`}></i>
                                            <span>{apt.location}</span>
                                          </div>
                                          {videoUrl && (
                                            <a
                                              href={videoUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="btn btn-sm btn-info text-white rounded-pill px-2.5 py-0.5 small fw-semibold"
                                              style={{ fontSize: "0.72rem" }}
                                            >
                                              <i className="bi bi-camera-video-fill me-1"></i>
                                              {loc("Deltag i onlinemøde", "Join online meeting")}
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="d-flex gap-1.5 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRescheduleTarget(apt);
                                        setRescheduleDate(String(apt.startTime).slice(0, 10));
                                      }}
                                      className="btn btn-sm btn-outline-primary rounded-pill px-2.5"
                                    >
                                      {loc("Flyt tid", "Reschedule")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelAppointment(apt.id)}
                                      className="btn btn-sm btn-outline-danger rounded-pill px-2.5"
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
                                    {apt.location && (
                                      <div className="small text-muted mt-1 d-flex align-items-center gap-1">
                                        <i className="bi bi-geo-alt me-1"></i>
                                        <span>{apt.location}</span>
                                      </div>
                                    )}
                                    </div>
                                    <div className="d-flex align-items-center flex-shrink-0">
                                      <span
                                        className="badge bg-secondary-subtle text-secondary border rounded-pill px-2.5 py-1"
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
                  </div>
                </Tabs.Panel>

                {/* TAB 2: BOOK APPOINTMENT & MARKETPLACE DIRECTORY (Q7, Q8, Q9) */}
                <Tabs.Panel value="booking">
                  <div>
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
                          <div key={srv.id} className="col-md-6 col-xl-4">
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
                </Tabs.Panel>

                {/* TAB 3: CLIENT JOURNAL & JGIT AUDIT (Q6 & Q13) */}
                <Tabs.Panel value="journal">
                  {/* Mode Selector Pill Toggle */}
                  <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 p-2.5 bg-white rounded-4 border shadow-xs gap-3">
                    <div className="d-inline-flex p-1 bg-light rounded-pill border">
                      <button
                        type="button"
                        onClick={() => setJournalSubMode("entry")}
                        className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold transition-all d-inline-flex align-items-center gap-1.5 ${
                          journalSubMode === "entry"
                            ? "btn-dark shadow-xs"
                            : "btn-light text-muted border-0"
                        }`}
                        style={{ fontSize: "0.85rem" }}
                      >
                        <span>✍️</span>
                        <span>{loc("Dagbogsindlæg", "Diary Entry")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setJournalSubMode("quiz")}
                        className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold transition-all d-inline-flex align-items-center gap-1.5 ${
                          journalSubMode === "quiz"
                            ? "btn-dark shadow-xs"
                            : "btn-light text-muted border-0"
                        }`}
                        style={{ fontSize: "0.85rem" }}
                      >
                        <span>📝</span>
                        <span>{loc("Quiz / PCL-5", "Quiz / PCL-5")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setJournalSubMode("questions")}
                        className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold transition-all d-inline-flex align-items-center gap-1.5 ${
                          journalSubMode === "questions"
                            ? "btn-dark shadow-xs"
                            : "btn-light text-muted border-0"
                        }`}
                        style={{ fontSize: "0.85rem" }}
                      >
                        <span>💬</span>
                        <span>{loc("Spørgsmål fra Behandler (1–10)", "Therapist Questions (1–10)")}</span>
                      </button>
                    </div>

                    <div className="d-flex align-items-center gap-2 pe-1">
                      <span className="badge bg-light text-secondary border rounded-pill px-3 py-2" style={{ fontSize: "0.78rem" }}>
                        {journalSubMode === "entry" && loc("Frit dagbogsnotat • JGit revisionssikret", "Free journal note • JGit versioned")}
                        {journalSubMode === "quiz" && loc("Standardiseret PCL-5 Trivselstjek", "Standardized PCL-5 Well-being Check")}
                        {journalSubMode === "questions" && loc("Ugentlig 1–10 Klinisk Monitorering", "Weekly 1–10 Clinical Monitoring")}
                      </span>
                    </div>
                  </div>

                  {/* SUB-MODE 1: DIARY / JOURNAL ENTRY */}
                  {journalSubMode === "entry" && (
                  <div className="row g-4">
                    <div className="col-lg-5">
                      <form id="journal-composer-form" onSubmit={handleCreateJournal} className="p-4 rounded-4 border bg-light bg-opacity-50">
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

                        <div className="mb-0">
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

                        <div className="small text-muted mt-3 fst-italic">
                          {loc(
                            "Klik på 'Gem indlæg' i venstre sidebjælke for at gemme og synkronisere.",
                            "Click 'Save entry' in the left sidebar to save and sync."
                          )}
                        </div>
                      </form>
                    </div>

                    <div className="col-lg-7">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <div>
                          <h5 className="fw-bold mb-0">
                            {loc(
                              `Mine Journalindlæg & Behandler-notater (${overview.journals.length})`,
                              `My Journal Entries & Therapist Notes (${overview.journals.length})`
                            )}
                          </h5>
                          <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                            {journalSearchFilter.trim()
                              ? loc(
                                  `Viser ${visibleJournals.length} af ${filteredJournals.length} matchende journaler`,
                                  `Showing ${visibleJournals.length} of ${filteredJournals.length} matching entries`
                                )
                              : loc(
                                  `Viser de nyeste ${visibleJournals.length} af ${overview.journals.length} journaler (indlæst i chunks)`,
                                  `Showing latest ${visibleJournals.length} of ${overview.journals.length} entries (loaded in chunks)`
                                )}
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={handleRefresh}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 d-inline-flex align-items-center gap-1.5"
                            title={loc(
                              "Hent nyeste journalindlæg fra databasen",
                              "Refresh latest journal entries from the database"
                            )}
                          >
                            <i className={`bi bi-arrow-clockwise ${isRefreshing ? "spin-animation" : ""}`}></i>
                            <span>{isRefreshing ? loc("Opdaterer...", "Refreshing...") : loc("Opdater", "Refresh")}</span>
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

                      {/* Progressive Search & Filter bar for Journals */}
                      {overview.journals.length > 3 && (
                        <div className="input-group input-group-sm mb-3 shadow-xs rounded-pill border bg-white overflow-hidden">
                          <span className="input-group-text bg-transparent border-0 pe-1 text-muted">
                            <i className="bi bi-search"></i>
                          </span>
                          <input
                            type="text"
                            value={journalSearchFilter}
                            onChange={(e) => {
                              setJournalSearchFilter(e.target.value);
                              setJournalChunkSize(10);
                            }}
                            placeholder={loc(
                              "Søg i journaler og behandler-notater...",
                              "Search journal entries and therapist notes..."
                            )}
                            className="form-control border-0 shadow-none ps-1"
                            style={{ fontSize: "0.82rem" }}
                          />
                          {journalSearchFilter && (
                            <button
                              type="button"
                              onClick={() => {
                                setJournalSearchFilter("");
                                setJournalChunkSize(10);
                              }}
                              className="btn btn-link btn-sm text-secondary text-decoration-none px-2"
                              title={loc("Ryd søgning", "Clear search")}
                            >
                              <i className="bi bi-x-circle-fill"></i>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="d-flex flex-column gap-3">
                        {visibleJournals.map((entry: any) => {
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
                                      className="btn btn-link btn-sm p-0 text-decoration-none text-primary fw-semibold d-inline-flex align-items-center gap-1"
                                      style={{ fontSize: "0.78rem" }}
                                      title={loc(
                                        "Se versionshistorik på tidslinjen",
                                        "View version history on the timeline"
                                      )}
                                    >
                                      <i className="bi bi-clock-history"></i>
                                      <span>{loc("Se historik ↗", "View history ↗")}</span>
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

                        {visibleJournals.length === 0 && (
                          <div className="text-center py-4 text-muted bg-white border rounded-4">
                            <i className="bi bi-journal-x fs-3 d-block mb-1"></i>
                            <div className="small">
                              {journalSearchFilter
                                ? loc(
                                    `Ingen journaler matcher "${journalSearchFilter}".`,
                                    `No journal entries match "${journalSearchFilter}".`
                                  )
                                : loc(
                                    "Der er endnu ingen journalindlæg.",
                                    "No journal entries yet."
                                  )}
                            </div>
                          </div>
                        )}

                        {filteredJournals.length > 10 && (
                          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2.5 rounded-4 bg-light bg-opacity-75 border mt-2">
                            <span className="text-muted small ps-1" style={{ fontSize: "0.78rem" }}>
                              {loc(
                                `Viser ${visibleJournals.length} af ${filteredJournals.length} journaler`,
                                `Showing ${visibleJournals.length} of ${filteredJournals.length} journals`
                              )}
                            </span>
                            <div className="d-flex align-items-center gap-2">
                              {hasMoreJournals && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setJournalChunkSize((prev) => prev + 10)}
                                    className="btn btn-sm btn-primary rounded-pill px-3 shadow-xs fw-semibold"
                                    style={{ fontSize: "0.8rem" }}
                                  >
                                    <i className="bi bi-plus-circle me-1"></i>
                                    {loc("Indlæs 10 flere (+10)", "Load 10 more (+10)")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setJournalChunkSize(filteredJournals.length)}
                                    className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                                    style={{ fontSize: "0.8rem" }}
                                  >
                                    {loc(
                                      `Vis alle (${filteredJournals.length})`,
                                      `Show all (${filteredJournals.length})`
                                    )}
                                  </button>
                                </>
                              )}
                              {journalChunkSize > 10 && (
                                <button
                                  type="button"
                                  onClick={() => setJournalChunkSize(10)}
                                  className="btn btn-sm btn-link text-muted text-decoration-none px-2"
                                  style={{ fontSize: "0.8rem" }}
                                >
                                  <i className="bi bi-chevron-up me-1"></i>
                                  {loc("Vis færre (10)", "Show fewer (10)")}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* SUB-MODE 2: QUIZ / PCL-5 */}
                  {journalSubMode === "quiz" && (
                    <div className="row g-4">
                      <div className="col-lg-6">
                        <form id="pcl5-form" onSubmit={handleSubmitPcl5} className="p-4 rounded-4 border bg-light bg-opacity-50">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <h5 className="fw-bold mb-0">
                              {loc(
                                "PCL-5 Psykotraumatologisk Trivselstjek",
                                "PCL-5 Psychotraumatology Well-Being Check-In"
                              )}
                            </h5>
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1 fw-bold">
                              {currentPcl5ScaledScore} / 80
                            </span>
                          </div>
                          <p className="small text-muted mb-3">
                            {loc(
                              "Vurder hvor meget du er blevet generet af følgende i den seneste uge (0 = Slet ikke, 4 = Ekstremt):",
                              "Rate how much you have been bothered by the following in the past week (0 = Not at all, 4 = Extremely):"
                            )}
                          </p>

                          {PCL5_QUESTIONS.map((q, idx) => (
                            <div key={idx} className="mb-3 p-3 rounded-3 bg-white border shadow-2xs">
                              <label className="form-label small fw-medium mb-2 text-dark">
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
                                      pclAnswers[idx] === val ? "btn-primary shadow-xs" : "btn-outline-secondary"
                                    }`}
                                  >
                                    {val}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mt-3">
                            <div className="d-flex align-items-center gap-2">
                              <i className="bi bi-info-circle text-primary fs-5"></i>
                              <span className="small text-muted">
                                {loc(
                                  "Klik på 'Indsend PCL-5 Vurdering' i venstre sidebjælke for at gemme testen.",
                                  "Click 'Submit PCL-5 Assessment' in the left sidebar to save."
                                )}
                              </span>
                            </div>
                            <span className="badge bg-primary-subtle text-primary fw-bold px-2.5 py-1.5" style={{ fontSize: "0.8rem" }}>
                              {loc("Aktuel score:", "Current score:")} {currentPcl5ScaledScore} / 80
                            </span>
                          </div>
                        </form>
                      </div>

                      <div className="col-lg-6">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <h5 className="fw-bold mb-0">
                            {loc(
                              `Tidligere PCL-5 Resultater (${overview.pcl5Tests.length})`,
                              `Previous PCL-5 Results (${overview.pcl5Tests.length})`
                            )}
                          </h5>
                          <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={handleRefresh}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 d-inline-flex align-items-center gap-1.5"
                            title={loc("Opdater resultater", "Refresh results")}
                          >
                            <i className={`bi bi-arrow-clockwise ${isRefreshing ? "spin-animation" : ""}`}></i>
                            <span>{isRefreshing ? loc("Opdaterer...", "Refreshing...") : loc("Opdater", "Refresh")}</span>
                          </button>
                        </div>

                        <div className="d-flex flex-column gap-2">
                          {(showAllPcl5
                            ? [...overview.pcl5Tests].reverse()
                            : [...overview.pcl5Tests].reverse().slice(0, 5)
                          ).map((t: any) => (
                            <div
                              key={t.id}
                              className="p-3 rounded-4 border bg-white d-flex justify-content-between align-items-center shadow-2xs"
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

                          {overview.pcl5Tests.length === 0 && (
                            <div className="text-center py-5 text-muted bg-white border rounded-4">
                              <i className="bi bi-clipboard-pulse fs-2 d-block mb-2 text-secondary opacity-50"></i>
                              <div className="fw-semibold small text-dark mb-1">
                                {loc("Ingen PCL-5 tests endnu", "No PCL-5 tests yet")}
                              </div>
                              <div className="small text-muted" style={{ maxWidth: "340px", margin: "0 auto" }}>
                                {loc(
                                  "Udfyld spørgeskemaet til venstre og indsend for at se din score og progression over tid.",
                                  "Complete the questionnaire on the left and submit to see your score and progression over time."
                                )}
                              </div>
                            </div>
                          )}

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
                  )}

                  {/* SUB-MODE 3: THERAPIST 1-10 QUESTIONS */}
                  {journalSubMode === "questions" && (
                    <div className="row g-4">
                      <div className="col-lg-6">
                        <form id="therapist-questions-form" onSubmit={handleSubmitTherapistQuestions} className="p-4 rounded-4 border bg-light bg-opacity-50">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <h5 className="fw-bold mb-0">
                              {loc("Spørgsmål fra din Behandler", "Questions from your Therapist")}
                            </h5>
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold">
                              {loc("Gns.", "Avg.")} {currentTherapistAvgScore} / 10
                            </span>
                          </div>
                          <p className="small text-muted mb-3">
                            {loc(
                              "Besvar nedenstående kliniske monitoreringsspørgsmål på en skala fra 1 (lavest/dårligst) til 10 (højest/bedst).",
                              "Answer the clinical monitoring questions below on a scale from 1 (lowest/poorest) to 10 (highest/best)."
                            )}
                          </p>

                          {THERAPIST_QUESTIONS.map((q) => (
                            <div key={q.id} className="mb-3 p-3.5 rounded-3 bg-white border shadow-2xs">
                              <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                                <div>
                                  <div className="fw-bold text-dark" style={{ fontSize: "0.9rem" }}>
                                    {q.title}
                                  </div>
                                  <div className="small text-muted mb-2">
                                    {q.description}
                                  </div>
                                </div>
                                <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1 fw-bold flex-shrink-0" style={{ fontSize: "0.82rem" }}>
                                  {therapistAnswers[q.id] ?? 7} / 10
                                </span>
                              </div>

                              <div className="d-flex justify-content-between align-items-center mb-1 text-muted" style={{ fontSize: "0.72rem" }}>
                                <span>{q.lowLabel}</span>
                                <span>{q.highLabel}</span>
                              </div>

                              <div className="d-flex gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                                  const isSelected = (therapistAnswers[q.id] ?? 7) === num;
                                  return (
                                    <button
                                      key={num}
                                      type="button"
                                      onClick={() =>
                                        setTherapistAnswers((prev) => ({ ...prev, [q.id]: num }))
                                      }
                                      className={`btn btn-sm flex-grow-1 p-1.5 fw-bold rounded-2 transition-all ${
                                        isSelected
                                          ? "btn-primary shadow-xs"
                                          : "btn-outline-secondary border-light-subtle bg-light bg-opacity-50 text-dark"
                                      }`}
                                      style={{ fontSize: "0.8rem" }}
                                    >
                                      {num}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          <div className="p-3 rounded-3 bg-white border shadow-2xs">
                            <label className="form-label small fw-semibold text-dark mb-1">
                              {loc("Supplerende kommentar eller note til behandleren (valgfrit)", "Additional note or comment for therapist (optional)")}
                            </label>
                            <textarea
                              rows={3}
                              className="form-control"
                              placeholder={loc(
                                "Skriv eventuelle tanker, fremskridt eller ting du gerne vil vende til næste session...",
                                "Write any thoughts, progress, or things you would like to discuss next session..."
                              )}
                              value={therapistQuestionNote}
                              onChange={(e) => setTherapistQuestionNote(e.target.value)}
                              style={{ fontSize: "0.85rem" }}
                            />
                          </div>

                          <div className="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mt-3">
                            <div className="d-flex align-items-center gap-2">
                              <i className="bi bi-info-circle text-success fs-5"></i>
                              <span className="small text-muted">
                                {loc(
                                  "Klik på 'Indsend Svar til Behandler' i venstre sidebjælke for at indsende.",
                                  "Click 'Submit Answers to Therapist' in the left sidebar to submit."
                                )}
                              </span>
                            </div>
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-1.5 fw-bold" style={{ fontSize: "0.82rem" }}>
                              {loc("Gns. score:", "Avg score:")} {currentTherapistAvgScore} / 10
                            </span>
                          </div>
                        </form>
                      </div>

                      <div className="col-lg-6">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div>
                            <h5 className="fw-bold mb-0">
                              {loc(
                                `Tidligere Behandler-besvarelser (${therapistQuestionJournals.length})`,
                                `Previous Therapist Responses (${therapistQuestionJournals.length})`
                              )}
                            </h5>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              {loc(
                                "Dine indsendte 1–10 monitoreringer gemmes sikkert i JGit-journalen.",
                                "Your submitted 1–10 monitorings are stored securely in the JGit journal."
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={handleRefresh}
                            className="btn btn-sm btn-outline-secondary rounded-pill px-3 d-inline-flex align-items-center gap-1.5"
                            title={loc("Opdater besvarelser", "Refresh responses")}
                          >
                            <i className={`bi bi-arrow-clockwise ${isRefreshing ? "spin-animation" : ""}`}></i>
                            <span>{isRefreshing ? loc("Opdaterer...", "Refreshing...") : loc("Opdater", "Refresh")}</span>
                          </button>
                        </div>

                        <div className="d-flex flex-column gap-2.5">
                          {therapistQuestionJournals.map((j: any) => (
                            <div
                              key={j.id}
                              className="p-3.5 rounded-4 border bg-white shadow-2xs"
                            >
                              <div className="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                  <div className="fw-bold text-dark" style={{ fontSize: "0.9rem" }}>
                                    {j.title}
                                  </div>
                                  <div className="small text-muted">
                                    {j.timestamp ? String(j.timestamp).replace("T", " ").slice(0, 16) : ""}
                                  </div>
                                </div>
                                <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold">
                                  {j.moodRating ? `${j.moodRating} / 10` : loc("Gennemført", "Completed")}
                                </span>
                              </div>
                              <div className="p-2.5 rounded-3 bg-light bg-opacity-75 small text-secondary font-monospace text-break" style={{ fontSize: "0.78rem", whiteSpace: "pre-line", maxHeight: "150px", overflowY: "auto" }}>
                                {j.content}
                              </div>
                              <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                                <span className="badge bg-light text-muted border" style={{ fontSize: "0.68rem" }}>
                                  <i className="bi bi-shield-check me-1 text-success"></i>
                                  {j.sharedWithTherapists ? loc("Delt med behandler", "Shared with therapist") : loc("Privat", "Private")}
                                </span>
                                {j.commitHash && (
                                  <span className="text-muted font-monospace" style={{ fontSize: "0.68rem" }} title={j.commitHash}>
                                    <i className="bi bi-git me-1"></i>
                                    {String(j.commitHash).slice(0, 7)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}

                          {therapistQuestionJournals.length === 0 && (
                            <div className="text-center py-5 text-muted bg-white border rounded-4">
                              <i className="bi bi-chat-heart fs-2 d-block mb-2 text-secondary opacity-50"></i>
                              <div className="fw-semibold small text-dark mb-1">
                                {loc("Ingen behandler-besvarelser endnu", "No therapist responses yet")}
                              </div>
                              <div className="small text-muted" style={{ maxWidth: "340px", margin: "0 auto" }}>
                                {loc(
                                  "Når du besvarer monitoreringsspørgsmålene til venstre, vises dine besvarelser og kliniske historik her.",
                                  "When you answer the monitoring questions on the left, your responses and clinical history will appear here."
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
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
                          <h5 className="fw-bold text-dark mb-0">
                            {loc(
                              "Terapeuter du har lavet et Handshake med",
                              "Therapists You Have a Handshake With"
                            )}
                          </h5>
                          <span className="badge bg-white text-secondary border rounded-pill">
                            {activeHandshakes.length} {loc("aktive", "active")} •{" "}
                            {overview.handshakes.length} {loc("i alt", "total")}
                          </span>
                        </div>
                        <p className="text-muted small mb-0">
                          {loc(
                            "Her kan du se alle dine tilknyttede terapeuter, godkende nye Handshake-anmodninger eller tilbagekalde adgang til dine delte journalnotater med øjeblikkelig virkning.",
                            "Here you can view all your connected therapists, approve new Handshake requests, or revoke access to your shared journal entries with immediate effect."
                          )}
                        </p>
                      </div>
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
                                onClick={() => setSelectedHandshakeId(String(hs.id))}
                                className={`p-4 rounded-4 border bg-white shadow-xs h-100 d-flex flex-column justify-content-between gap-3 ${
                                  overview.handshakes.length > 1 && String(hs.id) === String(currentHandshake?.id)
                                    ? "border-primary shadow-sm"
                                    : ""
                                }`}
                                style={{
                                  borderLeft: `5px solid ${
                                    isActive
                                      ? "#10b981"
                                      : isPending
                                      ? "#f59e0b"
                                      : "#94a3b8"
                                  }`,
                                  cursor: overview.handshakes.length > 1 ? "pointer" : "default",
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
                                  </div>

                                  {/* Handshake Temporal & Historical JGit Badges */}
                                  <div className="d-flex flex-wrap align-items-center gap-1.5 mt-2">
                                    {/* Forward Validity Badge */}
                                    {(() => {
                                      const todayStr = new Date().toISOString().slice(0, 10);
                                      const isExpired = hs.validTo && hs.validTo < todayStr;
                                      const isFuture = hs.validFrom && hs.validFrom > todayStr;
                                      if (isExpired) {
                                        return (
                                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                            <i className="bi bi-clock-history me-1"></i>
                                            {loc("Fremadrettet adgang: Udløbet", "Forward access: Expired")} ({hs.validTo})
                                          </span>
                                        );
                                      }
                                      if (isFuture) {
                                        return (
                                          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                            <i className="bi bi-hourglass-split me-1"></i>
                                            {loc("Fremadrettet adgang starter:", "Forward access starts:")} {hs.validFrom}
                                          </span>
                                        );
                                      }
                                      if (hs.validTo) {
                                        return (
                                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                            <i className="bi bi-calendar-check me-1"></i>
                                            {loc("Gyldig frem til:", "Valid until:")} {hs.validTo}
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="badge bg-light text-secondary border rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                          <i className="bi bi-infinity me-1"></i>
                                          {loc("Ubegrænset fremadrettet adgang", "Unlimited forward access")}
                                        </span>
                                      );
                                    })()}

                                    {/* Historical JGit Access Badge */}
                                    {(() => {
                                      if (hs.historyStartDate || hs.historyEndDate) {
                                        return (
                                          <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                            <i className="bi bi-git me-1"></i>
                                            {loc("JGit-historik:", "JGit history:")}{" "}
                                            {hs.historyStartDate || loc("Start", "Start")} → {hs.historyEndDate || loc("I dag", "Today")}
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="badge bg-light text-secondary border rounded-pill py-1 px-2.5" style={{ fontSize: "0.74rem" }}>
                                          <i className="bi bi-git me-1"></i>
                                          {loc("Fuld JGit-historik", "Full JGit history")}
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  {/* Expandable Handshake & JGit Interval Editor */}
                                  {editingHandshakeId === String(hs.id) && (
                                    <div className="p-3 rounded-3 bg-light border mt-3 d-flex flex-column gap-3 text-start">
                                      <div className="d-flex justify-content-between align-items-center">
                                        <span className="fw-bold text-dark small">
                                          <i className="bi bi-shield-lock-fill text-primary me-1.5"></i>
                                          {loc("Indstil tidsintervaller for adgang", "Set Access Time Intervals")}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setEditingHandshakeId(null)}
                                          className="btn-close"
                                          aria-label="Close"
                                          style={{ transform: "scale(0.8)" }}
                                        ></button>
                                      </div>

                                      {/* Fremadrettet adgang (Gyldighed) */}
                                      <div className="p-2.5 rounded-3 bg-white border">
                                        <div className="d-flex align-items-center justify-content-between mb-1.5">
                                          <label className="form-label small fw-bold text-dark mb-0">
                                            <i className="bi bi-hourglass-split text-primary me-1"></i>
                                            {loc("Fremadrettet adgang (Gyldighed)", "Forward Access (Validity)")}
                                          </label>
                                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill" style={{ fontSize: "0.68rem" }}>
                                            {loc("Styrer hvornår terapeuten må tilgå profilen", "Controls when therapist can access profile")}
                                          </span>
                                        </div>
                                        <div className="row g-2">
                                          <div className="col-sm-6">
                                            <label className="form-label mb-1" style={{ fontSize: "0.73rem" }}>{loc("Gyldig fra:", "Valid from:")}</label>
                                            <input
                                              type="date"
                                              className="form-control form-control-sm"
                                              value={handshakeIntervalDraft.validFrom}
                                              onChange={(e) => setHandshakeIntervalDraft((p) => ({ ...p, validFrom: e.target.value }))}
                                            />
                                          </div>
                                          <div className="col-sm-6">
                                            <label className="form-label mb-1" style={{ fontSize: "0.73rem" }}>{loc("Gyldig til (Udløb):", "Valid to (Expiration):")}</label>
                                            <input
                                              type="date"
                                              className="form-control form-control-sm"
                                              value={handshakeIntervalDraft.validTo}
                                              onChange={(e) => setHandshakeIntervalDraft((p) => ({ ...p, validTo: e.target.value }))}
                                            />
                                          </div>
                                        </div>
                                        <div className="d-flex flex-wrap gap-1 mt-2">
                                          <span className="small text-muted me-1 align-self-center" style={{ fontSize: "0.7rem" }}>{loc("Hurtigvalg:", "Presets:")}</span>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setDate(d.getDate() + 30);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                validFrom: p.validFrom || new Date().toISOString().slice(0, 10),
                                                validTo: d.toISOString().slice(0, 10),
                                              }));
                                            }}
                                          >
                                            +30 {loc("dage", "days")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setMonth(d.getMonth() + 3);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                validFrom: p.validFrom || new Date().toISOString().slice(0, 10),
                                                validTo: d.toISOString().slice(0, 10),
                                              }));
                                            }}
                                          >
                                            +3 {loc("måneder", "months")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setFullYear(d.getFullYear() + 1);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                validFrom: p.validFrom || new Date().toISOString().slice(0, 10),
                                                validTo: d.toISOString().slice(0, 10),
                                              }));
                                            }}
                                          >
                                            +1 {loc("år", "year")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => setHandshakeIntervalDraft((p) => ({ ...p, validTo: "" }))}
                                          >
                                            <i className="bi bi-infinity me-1"></i>{loc("Ubegrænset", "Unlimited")}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Fortids JGit-adgang (Historisk revisionsinterval) */}
                                      <div className="p-2.5 rounded-3 bg-white border">
                                        <div className="d-flex align-items-center justify-content-between mb-1.5">
                                          <label className="form-label small fw-bold text-dark mb-0">
                                            <i className="bi bi-git text-success me-1"></i>
                                            {loc("Fortids JGit-adgang (Historiske commits & notater)", "Past JGit Access (Historical Commits & Notes)")}
                                          </label>
                                          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill" style={{ fontSize: "0.68rem" }}>
                                            {loc("Begrænser ældre revisioner i tidslinjen", "Limits older revisions in timeline")}
                                          </span>
                                        </div>
                                        <div className="row g-2">
                                          <div className="col-sm-6">
                                            <label className="form-label mb-1" style={{ fontSize: "0.73rem" }}>{loc("Tidligste dato (fra):", "Earliest date (from):")}</label>
                                            <input
                                              type="date"
                                              className="form-control form-control-sm"
                                              value={handshakeIntervalDraft.historyStartDate}
                                              onChange={(e) => setHandshakeIntervalDraft((p) => ({ ...p, historyStartDate: e.target.value }))}
                                            />
                                          </div>
                                          <div className="col-sm-6">
                                            <label className="form-label mb-1" style={{ fontSize: "0.73rem" }}>{loc("Seneste dato (til):", "Latest date (to):")}</label>
                                            <input
                                              type="date"
                                              className="form-control form-control-sm"
                                              value={handshakeIntervalDraft.historyEndDate}
                                              onChange={(e) => setHandshakeIntervalDraft((p) => ({ ...p, historyEndDate: e.target.value }))}
                                            />
                                          </div>
                                        </div>
                                        <div className="d-flex flex-wrap gap-1 mt-2">
                                          <span className="small text-muted me-1 align-self-center" style={{ fontSize: "0.7rem" }}>{loc("Hurtigvalg:", "Presets:")}</span>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setDate(d.getDate() - 30);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                historyStartDate: d.toISOString().slice(0, 10),
                                                historyEndDate: "",
                                              }));
                                            }}
                                          >
                                            {loc("Seneste 30 dage", "Last 30 days")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setMonth(d.getMonth() - 3);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                historyStartDate: d.toISOString().slice(0, 10),
                                                historyEndDate: "",
                                              }));
                                            }}
                                          >
                                            {loc("Seneste 3 mdr", "Last 3 months")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => {
                                              const d = new Date();
                                              d.setFullYear(d.getFullYear() - 1);
                                              setHandshakeIntervalDraft((p) => ({
                                                ...p,
                                                historyStartDate: d.toISOString().slice(0, 10),
                                                historyEndDate: "",
                                              }));
                                            }}
                                          >
                                            {loc("Seneste 1 år", "Last 1 year")}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5"
                                            style={{ fontSize: "0.7rem" }}
                                            onClick={() => setHandshakeIntervalDraft((p) => ({
                                              ...p,
                                              historyStartDate: "",
                                              historyEndDate: "",
                                            }))}
                                          >
                                            <i className="bi bi-clock-history me-1"></i>{loc("Fuld historik", "Full history")}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Action buttons */}
                                      <div className="d-flex justify-content-end gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => setEditingHandshakeId(null)}
                                          className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                                        >
                                          {loc("Annuller", "Cancel")}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={savingHandshakeId === String(hs.id)}
                                          onClick={() => handleSaveHandshakeIntervals(hs.id)}
                                          className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold"
                                        >
                                          {savingHandshakeId === String(hs.id) ? (
                                            <>
                                              <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                              {loc("Gemmer...", "Saving...")}
                                            </>
                                          ) : (
                                            <>
                                              <i className="bi bi-check2-circle me-1"></i>
                                              {loc("Gem Tidsintervaller", "Save Time Intervals")}
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  )}
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
                    <JGitHistoryTimeline
                      commits={gitHistory}
                      isTherapistView={false}
                      selectedCommitHash={selectedCommit?.commitHash || null}
                      onSelectCommit={(hash) => {
                        const found = gitHistory.find((c: any) => c.commitHash === hash);
                        if (found) setSelectedCommit(found);
                      }}
                      onOpenAppointment={(appointmentRef: string) => {
                        const cleanId = appointmentRef.replace(/^#/, "").split(/[\s(]/)[0].trim();
                        const foundApt = overview.appointments.find(
                          (a: any) => String(a.id) === cleanId || appointmentRef.includes(String(a.id))
                        );
                        if (foundApt) {
                          setRescheduleTarget(foundApt);
                          setRescheduleDate(String(foundApt.startTime).slice(0, 10));
                        } else {
                          setActiveClientTab("timeline");
                        }
                      }}
                      locale={locale}
                    />
                  </div>
                </Tabs.Panel>

                {/* TAB 6: MINE STAMDATA (PERSONAL PROFILE & RESIDENCE DATA) */}
                <Tabs.Panel value="stamdata">
                  <div className="d-flex flex-column gap-3" style={{ maxWidth: "900px" }}>
                    <div>
                      <h1 className="h3 fw-bold text-dark mb-0">
                        {loc("Mine Stamdata", "My Profile Data")}
                      </h1>
                    </div>

                    {clientProfileSavedMsg && (
                      <div className="alert alert-success rounded-4 shadow-xs mb-0 d-flex align-items-center gap-2">
                        <i className="bi bi-check-circle-fill fs-5"></i>
                        <span>{clientProfileSavedMsg}</span>
                      </div>
                    )}

                    <div className="card border-0 shadow-xs rounded-4 bg-white">
                      <div className="card-header bg-white border-bottom px-4 py-3">
                        <div className="fw-bold text-dark d-flex align-items-center gap-2">
                          <i className="bi bi-person-vcard text-primary"></i>
                          <span>{loc("Personlige Oplysninger", "Personal Details")}</span>
                        </div>
                      </div>
                      <div className="card-body p-4">
                        <form id="client-profile-form" onSubmit={handleSaveClientProfile}>
                          <div className="row g-3">
                            <div className="col-md-6">
                              <label className="form-label small fw-semibold">
                                {loc("Fulde Navn", "Full Name")}
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                required
                                value={clientProfileForm.fullName}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, fullName: e.target.value })
                                }
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label small fw-semibold">
                                {loc("Fødselsdato", "Date of Birth")}
                              </label>
                              <input
                                type="date"
                                className="form-control"
                                required
                                value={clientProfileForm.dateOfBirth}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, dateOfBirth: e.target.value })
                                }
                              />
                            </div>
                            <div className="col-md-8">
                              <label className="form-label small fw-semibold">
                                {loc("Hjemmeadresse", "Home Address")}
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                required
                                value={clientProfileForm.homeAddress}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, homeAddress: e.target.value })
                                }
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label small fw-semibold">
                                {loc("Postnummer", "Postal Code")}
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                required
                                value={clientProfileForm.postalCode}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, postalCode: e.target.value })
                                }
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label small fw-semibold">
                                {loc("Telefonnummer", "Phone Number")}
                              </label>
                              <input
                                type="tel"
                                className="form-control"
                                required
                                value={clientProfileForm.phoneNumber}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, phoneNumber: e.target.value })
                                }
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label small fw-semibold">
                                {loc("Email", "Email")}
                              </label>
                              <input
                                type="email"
                                className="form-control"
                                required
                                value={clientProfileForm.email}
                                onChange={(e) =>
                                  setClientProfileForm({ ...clientProfileForm, email: e.target.value })
                                }
                              />
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
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
              {loadingTimefoldReschedule ? (
                <div className="p-2.5 rounded-3 bg-light border mb-3 small d-flex align-items-center gap-2 text-muted">
                  <div className="spinner-border spinner-border-sm text-primary" role="status" />
                  <span>{loc("Validerer tidspunkt...", "Validating time slot...")}</span>
                </div>
              ) : isRescheduleApproved ? (
                <div className="p-2.5 rounded-3 bg-success-subtle border border-success-subtle mb-3 small d-flex align-items-center gap-2 text-success-emphasis fw-medium">
                  <i className="bi bi-check-circle-fill text-success fs-6"></i>
                  <span>{loc("Tidspunkt er godkendt", "Time slot is approved")}</span>
                </div>
              ) : (
                <div className="p-2.5 rounded-3 bg-danger-subtle border border-danger-subtle mb-3 small d-flex align-items-center gap-2 text-danger-emphasis fw-medium">
                  <i className="bi bi-x-circle-fill text-danger fs-6"></i>
                  <span>{loc("Tidspunkt er ikke godkendt", "Time slot is not approved")}</span>
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
                    const daySched = getScheduleForDate(rescheduleTherapistSchedule, rescheduleDate);
                    const breakColl = checkCollisionWithBreak(daySched, s, 60);
                    const isClosedDay = isDayClosed(rescheduleTherapistSchedule, rescheduleDate);
                    const isUnavailable =
                      (tfSlot ? !tfSlot.available : false) || breakColl.collides || isClosedDay;
                    return (
                      <option key={s} value={s} disabled={isUnavailable}>
                        {s}
                        {breakColl.collides
                          ? loc(" (Behandlerens pause)", " (Therapist break)")
                          : isClosedDay
                          ? loc(" (Lukket)", " (Closed)")
                          : isUnavailable
                          ? loc(" (Optaget)", " (Unavailable)")
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Dialog.Close className="btn btn-light">
                  {loc("Annuller", "Cancel")}
                </Dialog.Close>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isRescheduleApproved || loadingTimefoldReschedule}
                >
                  {loc("Gem Nyt Tidspunkt", "Save New Time")}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Pop-up Kalender & Tidspunkt Picker Dialog (Kun Ledige Tider) */}
      <Dialog.Root open={isBookingPickerOpen} onOpenChange={setIsBookingPickerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup
            className="base-dialog-popup p-0 border-0 shadow-lg overflow-hidden"
            style={{ maxWidth: "780px", width: "95%", borderRadius: "1.25rem" }}
          >
            {/* Header */}
            <div className="p-3 px-4 bg-light border-bottom d-flex justify-content-between align-items-center">
              <div>
                <Dialog.Title className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-calendar-check text-success fs-5"></i>
                  <span>
                    {loc(
                      `Vælg Ledig Tid hos ${selectedTherapistProfile?.displayName || selectedTherapistProfile?.fullName || "Behandler"}`,
                      `Select Available Slot with ${selectedTherapistProfile?.displayName || selectedTherapistProfile?.fullName || "Therapist"}`
                    )}
                  </span>
                </Dialog.Title>
                <div className="text-muted small mt-0.5" style={{ fontSize: "0.75rem" }}>
                  {selectedServiceObj?.name} • {selectedServiceObj?.durationMinutes || 45} min • {selectedServiceObj?.price} DKK
                </div>
              </div>
              <Dialog.Close className="btn-close" />
            </div>

            {/* Modal Body: Calendar on Left, Available Times on Right */}
            <div className="row g-0">
              {/* Left Column: Interactive Month Calendar */}
              <div className="col-md-7 p-3 p-md-4 border-end">
                {/* Month navigation */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold text-dark fs-6">
                    {(() => {
                      const monthNamesDa = [
                        "Januar", "Februar", "Marts", "April", "Maj", "Juni",
                        "Juli", "August", "September", "Oktober", "November", "December"
                      ];
                      const monthNamesEn = [
                        "January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"
                      ];
                      const m = pickerMonthDate.getMonth();
                      const y = pickerMonthDate.getFullYear();
                      return `${isEn ? monthNamesEn[m] : monthNamesDa[m]} ${y}`;
                    })()}
                  </span>
                  <div className="d-flex gap-1">
                    <button
                      type="button"
                      disabled={
                        pickerMonthDate.getFullYear() < new Date().getFullYear() ||
                        (pickerMonthDate.getFullYear() === new Date().getFullYear() &&
                          pickerMonthDate.getMonth() <= new Date().getMonth())
                      }
                      onClick={() =>
                        setPickerMonthDate(
                          new Date(pickerMonthDate.getFullYear(), pickerMonthDate.getMonth() - 1, 1)
                        )
                      }
                      className="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center"
                      style={{ width: "30px", height: "30px", padding: 0 }}
                      title={loc("Forrige måned", "Previous month")}
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPickerMonthDate(
                          new Date(pickerMonthDate.getFullYear(), pickerMonthDate.getMonth() + 1, 1)
                        )
                      }
                      className="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center"
                      style={{ width: "30px", height: "30px", padding: 0 }}
                      title={loc("Næste måned", "Next month")}
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </div>
                </div>

                {/* Weekday headers */}
                <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                  {(isEn ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"]).map(
                    (w) => (
                      <div
                        key={w}
                        className="text-center text-muted fw-semibold small py-1"
                        style={{ fontSize: "0.72rem" }}
                      >
                        {w}
                      </div>
                    )
                  )}

                  {/* Day cells */}
                  {(() => {
                    const y = pickerMonthDate.getFullYear();
                    const m = pickerMonthDate.getMonth();
                    const daysInMonth = new Date(y, m + 1, 0).getDate();
                    const firstDayOffset = (new Date(y, m, 1).getDay() + 6) % 7;
                    const cells = [];

                    for (let i = 0; i < firstDayOffset; i++) {
                      cells.push(
                        <div key={`empty-${i}`} style={{ minHeight: "44px" }} />
                      );
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const dStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const slots = getTherapistAvailableSlots(dStr);
                      const isAvailable = slots.length > 0;
                      const isSelected = tempBookingDate === dStr;
                      const isToday = dStr === todayDateStr;

                      cells.push(
                        <button
                          key={dStr}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            setTempBookingDate(dStr);
                            if (slots.length > 0 && !slots.includes(tempBookingSlot)) {
                              setTempBookingSlot(slots[0]);
                            }
                          }}
                          className={`btn p-1 rounded-3 d-flex flex-column align-items-center justify-content-center position-relative transition-all`}
                          style={{
                            minHeight: "44px",
                            cursor: isAvailable ? "pointer" : "not-allowed",
                            backgroundColor: isSelected
                              ? "#23533d"
                              : isAvailable
                              ? "#ffffff"
                              : "#f8fafc",
                            borderColor: isSelected
                              ? "#23533d"
                              : isAvailable
                              ? "#e2e8f0"
                              : "transparent",
                            color: isSelected
                              ? "#ffffff"
                              : isAvailable
                              ? "#0f172a"
                              : "#94a3b8",
                            opacity: isAvailable ? 1 : 0.38,
                            fontWeight: isSelected || isToday ? "700" : "500",
                          }}
                          title={
                            isAvailable
                              ? loc(`${slots.length} ledige tider på denne dag`, `${slots.length} available slots on this day`)
                              : loc("Ikke ledig / lukket", "Not available / closed")
                          }
                        >
                          <span style={{ fontSize: "0.82rem" }}>
                            {day}
                          </span>
                          {isAvailable && (
                            <span
                              className={`rounded-circle mt-0.5 ${
                                isSelected ? "bg-white" : "bg-success"
                              }`}
                              style={{ width: "5px", height: "5px" }}
                            />
                          )}
                        </button>
                      );
                    }
                    return cells;
                  })()}
                </div>

                {/* Legend */}
                <div className="d-flex align-items-center gap-3 mt-3 pt-2 border-top text-muted small" style={{ fontSize: "0.7rem" }}>
                  <div className="d-flex align-items-center gap-1.5">
                    <span className="rounded-circle bg-success" style={{ width: "8px", height: "8px" }} />
                    <span>{loc("Ledig dag (Klik for tider)", "Available day (Click for slots)")}</span>
                  </div>
                  <div className="d-flex align-items-center gap-1.5">
                    <span className="rounded-circle bg-secondary opacity-40" style={{ width: "8px", height: "8px" }} />
                    <span>{loc("Optaget / Lukket", "Unavailable / Closed")}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Available Time Slots */}
              <div className="col-md-5 p-3 p-md-4 bg-light bg-opacity-50 d-flex flex-column justify-content-between">
                <div>
                  <div className="fw-bold text-dark mb-1" style={{ fontSize: "0.85rem" }}>
                    {formatFullDate(tempBookingDate)}
                  </div>
                  <div className="text-muted small mb-3" style={{ fontSize: "0.72rem" }}>
                    {(() => {
                      const slots = getTherapistAvailableSlots(tempBookingDate);
                      if (slots.length === 0) {
                        return loc("Ingen ledige tider", "No available slots");
                      }
                      return loc(
                        `Kun ledige tidspunkter vises (${slots.length}):`,
                        `Only available slots shown (${slots.length}):`
                      );
                    })()}
                  </div>

                  {/* Slot buttons */}
                  {(() => {
                    const slots = getTherapistAvailableSlots(tempBookingDate);
                    if (slots.length === 0) {
                      return (
                        <div className="p-3 rounded-3 bg-white border text-center text-muted small">
                          <i className="bi bi-calendar-x fs-3 d-block text-secondary mb-1"></i>
                          <span>
                            {loc(
                              "Ingen ledige tider på denne dato. Vælg venligst en anden dag i kalenderen.",
                              "No available slots on this date. Please pick another day in the calendar."
                            )}
                          </span>
                        </div>
                      );
                    }

                    const duration = Number(selectedServiceObj?.durationMinutes || 45);
                    const daySched = getScheduleForDate(selectedTherapistSchedule, tempBookingDate);

                    return (
                      <div className="d-flex flex-column gap-2" style={{ maxHeight: "290px", overflowY: "auto" }}>
                        {slots.map((slot) => {
                          const isSelected = tempBookingSlot === slot;
                          const startM = timeToMinutes(slot);
                          const endM = startM + duration;
                          const endTime = minutesToTime(endM);
                          const isOnlineOnlySlot = Boolean(
                            daySched?.intervals?.some((int: any) => {
                              if (!int.isOnlineOnly) return false;
                              const intStartM = timeToMinutes(int.start);
                              const intEndM = timeToMinutes(int.end, true);
                              return startM >= intStartM && endM <= intEndM;
                            })
                          );

                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setTempBookingSlot(slot)}
                              className={`btn p-2 rounded-3 text-start d-flex align-items-center justify-content-between transition-all`}
                              style={{
                                backgroundColor: isSelected ? "#23533d" : "#ffffff",
                                borderColor: isSelected ? "#23533d" : "#cbd5e1",
                                color: isSelected ? "#ffffff" : "#1e293b",
                                fontSize: "0.82rem",
                              }}
                            >
                              <div className="d-flex align-items-center gap-2">
                                <i className={`bi ${isSelected ? "bi-check-circle-fill text-white" : "bi-clock text-success"}`}></i>
                                <div>
                                  <div className="fw-bold">{slot}</div>
                                  <div className={isSelected ? "text-white-50" : "text-muted"} style={{ fontSize: "0.68rem" }}>
                                    {slot} – {endTime} ({duration} min)
                                  </div>
                                </div>
                              </div>
                              <div className="d-flex align-items-center gap-1.5">
                                {isOnlineOnlySlot && (
                                  <span
                                    className={`badge rounded-pill d-inline-flex align-items-center gap-1 ${
                                      isSelected ? "bg-info text-white" : "bg-info-subtle text-info-emphasis border border-info"
                                    }`}
                                    style={{ fontSize: "0.62rem" }}
                                    title={loc("Online session (Video)", "Online session (Video)")}
                                  >
                                    <i className="bi bi-camera-video-fill"></i>
                                    <span>Online</span>
                                  </span>
                                )}
                                <span
                                  className={`badge rounded-pill ${
                                    isSelected ? "bg-white text-success" : "bg-success-subtle text-success"
                                  }`}
                                  style={{ fontSize: "0.65rem" }}
                                >
                                  {isSelected ? loc("Valgt", "Selected") : loc("Ledig", "Available")}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Selection Confirmation Bar */}
                <div className="pt-3 border-top mt-3 d-flex flex-column gap-2">
                  <div className="d-flex justify-content-between align-items-center small text-dark">
                    <span className="text-muted" style={{ fontSize: "0.72rem" }}>{loc("Valgt tid:", "Chosen slot:")}</span>
                    <span className="fw-bold" style={{ fontSize: "0.78rem" }}>
                      {formatFriendlyDate(tempBookingDate)}, kl. {tempBookingSlot}
                    </span>
                  </div>
                  <div className="d-flex justify-content-end gap-2">
                    <Dialog.Close className="btn btn-sm btn-outline-secondary rounded-pill px-3">
                      {loc("Annuller", "Cancel")}
                    </Dialog.Close>
                    <button
                      type="button"
                      disabled={!tempBookingSlot || getTherapistAvailableSlots(tempBookingDate).length === 0}
                      onClick={() => {
                        setBookingDate(tempBookingDate);
                        setBookingSlot(tempBookingSlot);
                        setIsBookingPickerOpen(false);
                      }}
                      className="btn btn-sm btn-success rounded-pill px-3 fw-semibold shadow-xs"
                      style={{ backgroundColor: "#23533d", borderColor: "#23533d" }}
                    >
                      <i className="bi bi-check2 me-1"></i>
                      <span>{loc("Vælg denne tid", "Confirm slot")}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

