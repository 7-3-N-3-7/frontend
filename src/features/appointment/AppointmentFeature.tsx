"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: AppointmentFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/appointment/AppointmentFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: AppointmentFeature]. Håndterer
 * tidsbestilling, kalenderaftaler og klient-side beregning af terapeutens
 * arbejdstider, frokostpauser og 5-minutters tidsintervaller (der forbereder
 * input til [Service: TimefoldBookingService] i backenden).
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: AppointmentDto], [Record/DTO: TimefoldSlotSuggestionDto] &
 *      [Record/DTO: AppointmentGitCommitDto]
 *      TypeScript-interfaces der matcher Java `record` kontrakterne 1:1.
 *   2. [Service: AppointmentApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<AppointmentDto, string>] og
 *      implementerer #validateBeforeCreate(dto) med [Class: DomainGuard]-invarianter.
 *   3. Ren Domænelogik for Tidsintervaller (#parseWeeklySchedule, #computeAvailableStartTimes)
 *      Deterministiske hjælpemetoder til beregning af ledige bookingtider.
 *   4. [Hook: useBaseCrud<AppointmentDto, string>(appointmentApi)]
 *      Reaktiv tilstands- og livscyklushook i [Component: <AppointmentFeatureView />].
 *   5. [Component: <AppointmentFeatureView />]
 *      React UI-komponent med RFC 7807 fejlvisning via [Component: <ProblemAlert />].
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  FrontendDomainException,
  HasId,
  ProblemDetail,
} from "../../core/baseDomainCore";
import {
  ConfirmActionDialog,
  ProblemAlert,
  useBaseCrud,
  useOptionalAuth,
} from "../../core/baseUiCore";
import { SupportedUiLocale, useUiLocale } from "../i18n/I18nFeature";

// ============================================================================
// 1. DTO CONTRACTS & DOMAIN TYPES (1:1 med AppointmentFeature.java)
// ============================================================================

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type AppointmentStatusFilter = "active" | "all" | "cancelled";

export interface AppointmentDto extends HasId<string> {
  id?: string;
  clientId?: string;
  clientUuid?: string;
  therapistId?: string;
  therapistUuid?: string;
  serviceId?: string;
  clientName: string;
  therapistName?: string;
  organisationName?: string;
  location?: string;
  title?: string;
  notes?: string;
  status?: AppointmentStatus;
  startTime: string;
  endTime?: string;
  gitCommitHash?: string;
  journalEntryId?: string;
}

export interface TimefoldSlotSuggestionDto {
  slot?: string;
  startTime: string;
  endTime: string;
  therapistId?: string;
  available?: boolean;
  overlaps?: boolean;
  inPast?: boolean;
  withinWorkingHours?: boolean;
  hardScore?: number;
  softScore?: number;
  score?: string | number;
  reason?: string;
  recommended?: boolean;
}

export interface TimefoldScheduleResponseDto {
  solver?: string;
  therapistUuid?: string;
  date?: string;
  durationMinutes?: number;
  workingHoursWindow?: string;
  recommendedSlot?: string | null;
  solverScore?: string;
  feasible?: boolean;
  slots?: TimefoldSlotSuggestionDto[];
}

export interface AppointmentGitCommitDto {
  commitHash: string;
  fullHash?: string;
  author: string;
  timestamp: string;
  message: string;
  snapshot: string;
}

export interface DirectoryProviderDto {
  id?: string;
  userUuid: string;
  organisationId?: string;
  organisationName?: string;
  displayName: string;
  biography?: string;
  workingHoursJson?: string;
}

export interface DirectoryServiceDto {
  id: string;
  providerProfileId?: string;
  organisationId?: string;
  name: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  location?: string;
  currency?: string;
  isActive?: boolean;
}

export interface ClinicClientOptionDto {
  userId?: string;
  fullName: string;
  email?: string;
}

export interface ClinicDirectoryDto {
  organisations?: Array<{ id: string; name: string }>;
  providers: DirectoryProviderDto[];
  services: DirectoryServiceDto[];
}

// ============================================================================
// 1B. PURE BOOKING, CALENDAR & LOCALIZATION HELPERS
// ============================================================================

const CALENDAR_LABELS_BY_LOCALE: Record<
  SupportedUiLocale,
  { months: readonly string[]; weekdays: readonly string[]; dayDot: string }
> = {
  da: {
    months: [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAJ",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OKT",
      "NOV",
      "DEC",
    ],
    weekdays: ["søn", "man", "tir", "ons", "tor", "fre", "lør"],
    dayDot: ".",
  },
  en: {
    months: [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ],
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    dayDot: "",
  },
  fr: {
    months: [
      "JAN",
      "FÉV",
      "MAR",
      "AVR",
      "MAI",
      "JUN",
      "JUL",
      "AOÛ",
      "SEP",
      "OCT",
      "NOV",
      "DÉC",
    ],
    weekdays: ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"],
    dayDot: "",
  },
  es: {
    months: [
      "ENE",
      "FEB",
      "MAR",
      "ABR",
      "MAY",
      "JUN",
      "JUL",
      "AGO",
      "SEP",
      "OCT",
      "NOV",
      "DIC",
    ],
    weekdays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
    dayDot: "",
  },
  de: {
    months: [
      "JAN",
      "FEB",
      "MÄR",
      "APR",
      "MAI",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OKT",
      "NOV",
      "DEZ",
    ],
    weekdays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    dayDot: ".",
  },
};

/**
 * Normaliserer en ISO-dato/tid-streng til `<input type="datetime-local">` format (`YYYY-MM-DDTHH:mm`).
 */
export function toDateTimeLocalInput(value?: string | null): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : value;
}

/**
 * Beregner en lokal `YYYY-MM-DDTHH:mm` sluttid ved at lægge `minutes` til `isoLocal` uden UTC-forskydning.
 */
export function addMinutesToIsoLocal(
  isoLocal: string,
  minutes: number
): string {
  const match = isoLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  );
  if (!match || !Number.isFinite(minutes)) return "";
  const [, yStr, mStr, dStr, hStr, minStr] = match;
  const dt = new Date(
    Number(yStr),
    Number(mStr) - 1,
    Number(dStr),
    Number(hStr),
    Number(minStr) + minutes,
    0,
    0
  );
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Konverterer Timefold-svarets `recommendedSlot` (f.eks. `"10:00"` eller ISO) til lokale ISO start-/sluttider.
 */
export function resolveRecommendedSlotRange(
  result: TimefoldScheduleResponseDto,
  fallbackDate: string,
  durationMinutes: number
): { startTime: string; endTime: string } {
  const raw = (result.recommendedSlot || "").trim();
  const matched = raw
    ? result.slots?.find((s) => s.slot === raw || s.startTime === raw)
    : undefined;

  let startTime = "";
  if (matched?.startTime) {
    startTime = toDateTimeLocalInput(matched.startTime);
  } else if (/^\d{2}:\d{2}$/.test(raw)) {
    const datePrefix = (result.date || fallbackDate).trim();
    startTime = datePrefix ? `${datePrefix}T${raw}` : raw;
  } else if (raw) {
    startTime = toDateTimeLocalInput(raw);
  }

  const endTime =
    (matched?.endTime ? toDateTimeLocalInput(matched.endTime) : "") ||
    addMinutesToIsoLocal(startTime, durationMinutes) ||
    startTime;

  return { startTime, endTime };
}

function formatHumanMonth(rawMonth: string, locale: SupportedUiLocale): string {
  const lower = rawMonth.toLowerCase();
  if (locale === "en" || locale === "de") {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return lower;
}

/**
 * Udtrækker lokaliserede kalenderbadge-dele og tidsinterval fra `startTime` og `endTime`.
 */
export function formatAppointmentDateParts(
  startTime?: string,
  endTime?: string,
  locale: SupportedUiLocale = "da"
): {
  monthShort: string;
  dayNumber: string;
  weekdayShort: string;
  timeRange: string;
  fullDate: string;
} {
  const startMatch = startTime?.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/
  );
  if (!startMatch) {
    return {
      monthShort: "---",
      dayNumber: "--",
      weekdayShort: "",
      timeRange: startTime || "--:--",
      fullDate: startTime || "",
    };
  }
  const cal = CALENDAR_LABELS_BY_LOCALE[locale];
  const [, yStr, mStr, dStr, hStr, minStr] = startMatch;
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  const dt = new Date(Number(yStr), monthIdx, Number(dStr), Number(hStr), Number(minStr));
  const weekdayShort = cal.weekdays[dt.getDay()];
  const startClock = `${hStr}:${minStr}`;
  const endMatch = endTime?.match(/T(\d{2}):(\d{2})/);
  const endClock = endMatch ? `${endMatch[1]}:${endMatch[2]}` : "";
  return {
    monthShort: cal.months[monthIdx],
    dayNumber: dStr,
    weekdayShort,
    timeRange: endClock ? `${startClock} – ${endClock}` : startClock,
    fullDate: `${Number(dStr)}${cal.dayDot} ${formatHumanMonth(cal.months[monthIdx], locale)} ${yStr}`,
  };
}

/**
 * Deduplikerer behandlerliste på normaliseret nøgle (`userUuid` -> `id` -> normaliseret `displayName`).
 */
export function deduplicateProviders(
  providers: DirectoryProviderDto[] | null | undefined
): DirectoryProviderDto[] {
  if (!Array.isArray(providers) || providers.length === 0) return [];
  const seenIds = new Set<string>();
  const seenNames = new Map<string, number>();
  const result: DirectoryProviderDto[] = [];
  for (const p of providers) {
    if (!p || typeof p !== "object") continue;
    const idKey = (p.userUuid || p.id || "").trim();
    const nameKey = (p.displayName || "").trim().toLowerCase();
    if ((!idKey && !nameKey) || (idKey && seenIds.has(idKey))) {
      continue;
    }
    if (nameKey && seenNames.has(nameKey)) {
      if (!idKey) {
        continue;
      }
      const existingIdx = seenNames.get(nameKey)!;
      seenIds.add(idKey);
      result[existingIdx] = {
        ...p,
        displayName: result[existingIdx].displayName,
      };
      continue;
    }
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.set(nameKey, result.length);
    result.push(p);
  }
  return result;
}

/**
 * Deduplikerer ydelsesliste både på `id` og på normaliseret `${name}|${duration}|${providerProfileId}`.
 */
export function deduplicateServices(
  services: DirectoryServiceDto[] | null | undefined
): DirectoryServiceDto[] {
  if (!Array.isArray(services) || services.length === 0) return [];
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const result: DirectoryServiceDto[] = [];
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    const idKey = (s.id || "").trim();
    const signature = `${(s.name || "").trim().toLowerCase()}|${s.durationMinutes ?? 0}|${(s.providerProfileId || "").trim()}`;
    if ((idKey && seenIds.has(idKey)) || seenSignatures.has(signature)) {
      continue;
    }
    if (idKey) seenIds.add(idKey);
    seenSignatures.add(signature);
    result.push(s);
  }
  return result;
}

/**
 * Filtrerer aftaler efter status-fane (`active`, `cancelled`, `all`), valgfrit datointerval (`fromDate`..`toDate`)
 * samt valgfri fritekst-søgning på klient, titel, behandler, klinik eller lokation.
 */
export function filterAppointments(
  appointments: AppointmentDto[],
  statusFilter: AppointmentStatusFilter,
  fromDate?: string,
  toDate?: string,
  searchQuery?: string
): AppointmentDto[] {
  const fromKey = fromDate?.trim() || "";
  const toKey = toDate?.trim() || "";
  const query = searchQuery?.trim().toLowerCase() || "";

  return appointments
    .filter((item) => {
      const status = item.status ?? "SCHEDULED";
      if (statusFilter === "active" && status === "CANCELLED") {
        return false;
      }
      if (statusFilter === "cancelled" && status !== "CANCELLED") {
        return false;
      }
      const datePart = item.startTime.slice(0, 10);
      if (fromKey && /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < fromKey) {
        return false;
      }
      if (toKey && /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart > toKey) {
        return false;
      }
      if (query) {
        const haystack = [
          item.clientName,
          item.title,
          item.therapistName,
          item.organisationName,
          item.location,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function getTodayIsoDate(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function getTomorrowIsoDate(): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES_BY_LOCALE: Record<SupportedUiLocale, readonly string[]> = {
  da: [
    "Januar",
    "Februar",
    "Marts",
    "April",
    "Maj",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "December",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  fr: [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ],
  es: [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ],
  de: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
};

/**
 * Opbygger en mandag-startende kalendermatrix for `(year, monthIndex0)` med `null` for tomme celler.
 */
export function buildCalendarMonthCells(
  year: number,
  monthIndex0: number
): Array<string | null> {
  const firstDay = new Date(year, monthIndex0, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells: Array<string | null> = Array.from(
    { length: mondayOffset },
    () => null
  );
  const mm = String(monthIndex0 + 1).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function formatMonthYearHeading(
  year: number,
  monthIndex0: number,
  locale: SupportedUiLocale = "da"
): string {
  const idx = ((monthIndex0 % 12) + 12) % 12;
  return `${MONTH_NAMES_BY_LOCALE[locale][idx]} ${year}`;
}

export function formatIsoDateHuman(
  isoDate?: string | null,
  locale: SupportedUiLocale = "da"
): string {
  const match = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, yStr, mStr, dStr] = match;
  const cal = CALENDAR_LABELS_BY_LOCALE[locale];
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  return `${Number(dStr)}${cal.dayDot} ${formatHumanMonth(cal.months[monthIdx], locale)} ${yStr}`;
}

export function normalizeDirectoryProvider(
  raw: DirectoryProviderDto & {
    organisation?: { id?: string; name?: string };
  }
): DirectoryProviderDto {
  return {
    ...raw,
    organisationId: raw.organisationId || raw.organisation?.id,
    organisationName: raw.organisationName || raw.organisation?.name,
  };
}

export function normalizeDirectoryService(
  raw: DirectoryServiceDto & {
    provider?: { id?: string };
    organisation?: { id?: string };
    active?: boolean;
  }
): DirectoryServiceDto {
  return {
    ...raw,
    providerProfileId: raw.providerProfileId || raw.provider?.id,
    organisationId: raw.organisationId || raw.organisation?.id,
    isActive: raw.isActive ?? raw.active ?? true,
  };
}

function localizeOpeningWindow(
  windowText: string,
  closedLabel: string
): string {
  return windowText.replaceAll("Lukket", closedLabel);
}

interface AppointmentCopy {
  activeBadgeSuffix: string;
  cancelledBadgeSuffix: string;
  heading: string;
  timefoldBtn: string;
  scheduleBtn: string;
  timefoldTitle: string;
  timefoldDesc: string;
  openingHoursPrefix: string;
  therapistLabel: string;
  therapistUuidPlaceholder: string;
  dateLabel: string;
  durationLabel: string;
  minutesUnit: string;
  preferredTimeLabel: string;
  searchingSlots: string;
  findSlotsBtn: string;
  feasibleSolution: string;
  noFullSolution: string;
  useRecommendedPrefix: string;
  weeklyScheduleTitle: string;
  activeWorkSuffix: string;
  breakWorkSuffix: string;
  savingSchedule: string;
  saveScheduleBtn: string;
  scheduleSavedPrefix: string;
  perWeekSuffix: string;
  removeIntervalTitle: string;
  breakBadgePrefix: string;
  addIntervalBtn: string;
  closedLabel: string;
  weekendClosed: string;
  allWeekdaysSuffix: string;
  weekdays: Record<WeekdayKey, string>;
  clientNameLabel: string;
  clientNamePlaceholder: string;
  selectTherapistOption: string;
  serviceLabel: string;
  selectServiceOption: string;
  sessionTitleLabel: string;
  sessionTitlePlaceholder: string;
  defaultConsultationTitle: string;
  startTimeLabel: string;
  endTimeLabel: string;
  bookBtn: string;
  filterActive: string;
  filterCancelled: string;
  filterAll: string;
  dateFromAria: string;
  dateToConnector: string;
  dateToAria: string;
  applyFilterBtn: string;
  resetFilterBtn: string;
  refreshTitle: string;
  loadingAppointments: string;
  emptyTitle: string;
  emptySubtitle: string;
  statusConfirmed: string;
  statusCompleted: string;
  statusCancelled: string;
  statusNoShow: string;
  statusScheduled: string;
  fallbackCardTitle: string;
  historyBtn: string;
  rescheduleBtn: string;
  cancelBtn: string;
  newStartLabel: string;
  newEndLabel: string;
  saveNewTimeBtn: string;
  cancelRescheduleBtn: string;
  gitHistoryTitle: string;
  loadingHistory: string;
  emptyHistory: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  technicalAuditSummary: string;
  confirmCancelTitle: string;
  confirmCancelDescPrefix: string;
  confirmCancelBtn: string;
  dismissDialogBtn: string;
  paginationPrev: string;
  paginationNext: string;
  paginationPageLabel: string;
  paginationOfLabel: string;
  selectClientPlaceholder: string;
  noServicesOption: string;
  noServicesNotice: string;
  loadingServices: string;
  calendarTitle: string;
  slotsTitle: string;
  loadingSlots: string;
  noSlotsAvailable: string;
  bookedSlotTag: string;
  outsideHoursSlotTag: string;
  outsideHoursToggle: string;
  autoFromServicePrefix: string;
  notSelectedYet: string;
  clearDateBtn: string;
  prevMonthAria: string;
  nextMonthAria: string;
  anyTimeOption: string;
  selectedTimeSummaryLabel: string;
  bookingSuccessNotice: string;
  disabledBookingHint: string;
  selectTimeHint: string;
}

const APPOINTMENT_COPY: Record<SupportedUiLocale, AppointmentCopy> = {
  da: {
    activeBadgeSuffix: "aktive",
    cancelledBadgeSuffix: "aflyste",
    heading: "Aftaler & Tidsbestilling",
    timefoldBtn: "Timefold AI Ledige Tider",
    scheduleBtn: "Arbejdstider & Pauser",
    timefoldTitle: "Timefold AI — Konfliktfri Tidsoptimering",
    timefoldDesc: "Finder ledige konsultationstider uden overlap eller pauser.",
    openingHoursPrefix: "Åbningstid",
    therapistLabel: "Behandler",
    therapistUuidPlaceholder: "Behandler UUID",
    dateLabel: "Dato",
    durationLabel: "Varighed",
    minutesUnit: "minutter",
    preferredTimeLabel: "Foretrukket tid",
    searchingSlots: "Søger...",
    findSlotsBtn: "Find ledige tider",
    feasibleSolution: "Mulig løsning fundet",
    noFullSolution: "Ingen fuld løsning",
    useRecommendedPrefix: "Brug anbefalet",
    weeklyScheduleTitle: "Arbejdstider & Frokostpauser (Multi-Vindue)",
    activeWorkSuffix: "aktiv",
    breakWorkSuffix: "pause",
    savingSchedule: "Gemmer...",
    saveScheduleBtn: "Gem arbejdstider",
    scheduleSavedPrefix: "Arbejdstider gemt",
    perWeekSuffix: "pr. uge",
    removeIntervalTitle: "Fjern interval",
    breakBadgePrefix: "Pause",
    addIntervalBtn: "+ Tilføj vindue",
    closedLabel: "Lukket",
    weekendClosed: "Weekend: Lukket",
    allWeekdaysSuffix: "(Alle hverdage)",
    weekdays: {
      monday: "Mandag",
      tuesday: "Tirsdag",
      wednesday: "Onsdag",
      thursday: "Torsdag",
      friday: "Fredag",
      saturday: "Lørdag",
      sunday: "Søndag",
    },
    clientNameLabel: "Klientnavn",
    clientNamePlaceholder: "Klientnavn",
    selectTherapistOption: "Vælg behandler",
    serviceLabel: "Ydelse / Forløb",
    selectServiceOption: "Vælg ydelse",
    sessionTitleLabel: "Sessionstitel",
    sessionTitlePlaceholder: "Sessionstitel",
    defaultConsultationTitle: "Klinisk konsultation",
    startTimeLabel: "Starttidspunkt",
    endTimeLabel: "Sluttidspunkt",
    bookBtn: "Book aftale",
    filterActive: "Aktive",
    filterCancelled: "Aflyste",
    filterAll: "Alle",
    dateFromAria: "Fra dato",
    dateToConnector: "til",
    dateToAria: "Til dato",
    applyFilterBtn: "Anvend",
    resetFilterBtn: "Nulstil",
    refreshTitle: "Opdater aftaleliste",
    loadingAppointments: "Henter aftaler...",
    emptyTitle: "Ingen aftaler matcher dit filter",
    emptySubtitle: "Book en ny tid ovenfor, eller skift mellem Aktive, Aflyste og Alle.",
    statusConfirmed: "Bekræftet",
    statusCompleted: "Afholdt",
    statusCancelled: "Aflyst",
    statusNoShow: "Udeblevet",
    statusScheduled: "Planlagt",
    fallbackCardTitle: "Klinisk aftale",
    historyBtn: "Historik",
    rescheduleBtn: "Ombook",
    cancelBtn: "Aflys",
    newStartLabel: "Ny starttid",
    newEndLabel: "Ny sluttid",
    saveNewTimeBtn: "Gem ny tid",
    cancelRescheduleBtn: "Annuller",
    gitHistoryTitle: "Ændringshistorik",
    loadingHistory: "Henter revisionshistorik...",
    emptyHistory: "Ingen ændringer registreret endnu for denne aftale.",
    searchPlaceholder: "Søg i aftaler...",
    searchAriaLabel: "Søg i aftaler",
    technicalAuditSummary: "Teknisk revisionsdetalje",
    confirmCancelTitle: "Bekræft aflysning af aftale",
    confirmCancelDescPrefix: "Er du sikker på, at du vil aflyse aftalen",
    confirmCancelBtn: "Ja, aflys aftale",
    dismissDialogBtn: "Behold aftale",
    paginationPrev: "Forrige",
    paginationNext: "Næste",
    paginationPageLabel: "Side",
    paginationOfLabel: "af",
    selectClientPlaceholder: "Vælg eksisterende klient (valgfri)",
    noServicesOption: "Ingen aktive ydelser",
    noServicesNotice: "Denne behandler har ingen aktive ydelser endnu.",
    loadingServices: "Henter ydelser...",
    calendarTitle: "Vælg dato",
    slotsTitle: "Ledige tider (Timefold AI)",
    loadingSlots: "Beregner ledige tider...",
    noSlotsAvailable: "Ingen ledige tider denne dag.",
    bookedSlotTag: "Optaget",
    outsideHoursSlotTag: "Uden for normaltid",
    outsideHoursToggle: "Vis tider uden for arbejdstid (07:00–21:00)",
    autoFromServicePrefix: "Beregnet fra ydelse",
    notSelectedYet: "Vælg tid i kalenderen",
    clearDateBtn: "Ryd",
    prevMonthAria: "Forrige måned",
    nextMonthAria: "Næste måned",
    anyTimeOption: "Første ledige (anbefalet)",
    selectedTimeSummaryLabel: "Valgt tidspunkt",
    bookingSuccessNotice: "Din aftale er booket og bekræftet i kalenderen.",
    disabledBookingHint: "Vælg en behandler med mindst én aktiv ydelse for at booke.",
    selectTimeHint: "Vælg dato og et ledigt tidspunkt ovenfor før du booker.",
  },
  en: {
    activeBadgeSuffix: "active",
    cancelledBadgeSuffix: "cancelled",
    heading: "Appointments & Booking",
    timefoldBtn: "Timefold AI Open Slots",
    scheduleBtn: "Working Hours & Breaks",
    timefoldTitle: "Timefold AI — Conflict-Free Scheduling",
    timefoldDesc: "Finds available consultation slots without overlaps or breaks.",
    openingHoursPrefix: "Opening hours",
    therapistLabel: "Therapist",
    therapistUuidPlaceholder: "Therapist UUID",
    dateLabel: "Date",
    durationLabel: "Duration",
    minutesUnit: "minutes",
    preferredTimeLabel: "Preferred time",
    searchingSlots: "Searching...",
    findSlotsBtn: "Find open slots",
    feasibleSolution: "Feasible solution found",
    noFullSolution: "No full solution",
    useRecommendedPrefix: "Use recommended",
    weeklyScheduleTitle: "Working Hours & Lunch Breaks (Multi-Window)",
    activeWorkSuffix: "active",
    breakWorkSuffix: "break",
    savingSchedule: "Saving...",
    saveScheduleBtn: "Save working hours",
    scheduleSavedPrefix: "Working hours saved",
    perWeekSuffix: "per week",
    removeIntervalTitle: "Remove interval",
    breakBadgePrefix: "Break",
    addIntervalBtn: "+ Add window",
    closedLabel: "Closed",
    weekendClosed: "Weekend: Closed",
    allWeekdaysSuffix: "(All weekdays)",
    weekdays: {
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    },
    clientNameLabel: "Client Name",
    clientNamePlaceholder: "Client Name",
    selectTherapistOption: "Select therapist",
    serviceLabel: "Service / Program",
    selectServiceOption: "Select service",
    sessionTitleLabel: "Session Title",
    sessionTitlePlaceholder: "Session Title",
    defaultConsultationTitle: "Clinical consultation",
    startTimeLabel: "Start Time",
    endTimeLabel: "End Time",
    bookBtn: "Book appointment",
    filterActive: "Active",
    filterCancelled: "Cancelled",
    filterAll: "All",
    dateFromAria: "From date",
    dateToConnector: "to",
    dateToAria: "To date",
    applyFilterBtn: "Apply",
    resetFilterBtn: "Reset",
    refreshTitle: "Refresh appointments",
    loadingAppointments: "Loading appointments...",
    emptyTitle: "No appointments match your filter",
    emptySubtitle: "Book a new session above, or switch between Active, Cancelled, and All.",
    statusConfirmed: "Confirmed",
    statusCompleted: "Completed",
    statusCancelled: "Cancelled",
    statusNoShow: "No show",
    statusScheduled: "Scheduled",
    fallbackCardTitle: "Clinical appointment",
    historyBtn: "History",
    rescheduleBtn: "Reschedule",
    cancelBtn: "Cancel",
    newStartLabel: "New start time",
    newEndLabel: "New end time",
    saveNewTimeBtn: "Save new time",
    cancelRescheduleBtn: "Dismiss",
    gitHistoryTitle: "Change History",
    loadingHistory: "Loading revision history...",
    emptyHistory: "No changes recorded yet for this appointment.",
    searchPlaceholder: "Search appointments...",
    searchAriaLabel: "Search appointments",
    technicalAuditSummary: "Technical audit details",
    confirmCancelTitle: "Confirm appointment cancellation",
    confirmCancelDescPrefix: "Are you sure you want to cancel the appointment",
    confirmCancelBtn: "Yes, cancel appointment",
    dismissDialogBtn: "Keep appointment",
    paginationPrev: "Previous",
    paginationNext: "Next",
    paginationPageLabel: "Page",
    paginationOfLabel: "of",
    selectClientPlaceholder: "Select existing client (optional)",
    noServicesOption: "No active services",
    noServicesNotice: "This therapist has no active services yet.",
    loadingServices: "Loading services...",
    calendarTitle: "Select date",
    slotsTitle: "Open slots (Timefold AI)",
    loadingSlots: "Calculating open slots...",
    noSlotsAvailable: "No open slots available on this day.",
    bookedSlotTag: "Booked",
    outsideHoursSlotTag: "Outside hours",
    outsideHoursToggle: "Show times outside working hours (07:00–21:00)",
    autoFromServicePrefix: "Calculated from service",
    notSelectedYet: "Choose slot in calendar",
    clearDateBtn: "Clear",
    prevMonthAria: "Previous month",
    nextMonthAria: "Next month",
    anyTimeOption: "First available (recommended)",
    selectedTimeSummaryLabel: "Selected time",
    bookingSuccessNotice: "Your appointment has been booked and confirmed.",
    disabledBookingHint: "Select a therapist with at least one active service to book.",
    selectTimeHint: "Choose a date and an open time slot above before booking.",
  },
  fr: {
    activeBadgeSuffix: "actifs",
    cancelledBadgeSuffix: "annulés",
    heading: "Rendez-vous & Réservation",
    timefoldBtn: "Créneaux IA Timefold",
    scheduleBtn: "Horaires & Pauses",
    timefoldTitle: "Timefold AI — Optimisation sans Conflit",
    timefoldDesc: "Trouve des créneaux disponibles sans chevauchement ni pause.",
    openingHoursPrefix: "Heures d'ouverture",
    therapistLabel: "Praticien",
    therapistUuidPlaceholder: "UUID du praticien",
    dateLabel: "Date",
    durationLabel: "Durée",
    minutesUnit: "minutes",
    preferredTimeLabel: "Heure souhaitée",
    searchingSlots: "Recherche...",
    findSlotsBtn: "Trouver des créneaux",
    feasibleSolution: "Solution trouvée",
    noFullSolution: "Aucune solution complète",
    useRecommendedPrefix: "Utiliser le créneau recommandé",
    weeklyScheduleTitle: "Horaires de Travail & Pauses (Multi-Créneaux)",
    activeWorkSuffix: "actif",
    breakWorkSuffix: "pause",
    savingSchedule: "Enregistrement...",
    saveScheduleBtn: "Enregistrer les horaires",
    scheduleSavedPrefix: "Horaires enregistrés",
    perWeekSuffix: "par semaine",
    removeIntervalTitle: "Supprimer la plage",
    breakBadgePrefix: "Pause",
    addIntervalBtn: "+ Ajouter une plage",
    closedLabel: "Fermé",
    weekendClosed: "Week-end : Fermé",
    allWeekdaysSuffix: "(Tous les jours ouvrés)",
    weekdays: {
      monday: "Lundi",
      tuesday: "Mardi",
      wednesday: "Mercredi",
      thursday: "Jeudi",
      friday: "Vendredi",
      saturday: "Samedi",
      sunday: "Dimanche",
    },
    clientNameLabel: "Nom du client",
    clientNamePlaceholder: "Nom du client",
    selectTherapistOption: "Choisir un praticien",
    serviceLabel: "Prestation / Parcours",
    selectServiceOption: "Choisir une prestation",
    sessionTitleLabel: "Titre de la séance",
    sessionTitlePlaceholder: "Titre de la séance",
    defaultConsultationTitle: "Consultation clinique",
    startTimeLabel: "Heure de début",
    endTimeLabel: "Heure de fin",
    bookBtn: "Réserver",
    filterActive: "Actifs",
    filterCancelled: "Annulés",
    filterAll: "Tous",
    dateFromAria: "Date de début",
    dateToConnector: "au",
    dateToAria: "Date de fin",
    applyFilterBtn: "Appliquer",
    resetFilterBtn: "Réinitialiser",
    refreshTitle: "Actualiser la liste",
    loadingAppointments: "Chargement des rendez-vous...",
    emptyTitle: "Aucun rendez-vous ne correspond à ce filtre",
    emptySubtitle: "Réservez un créneau ci-dessus ou basculez entre Actifs, Annulés et Tous.",
    statusConfirmed: "Confirmé",
    statusCompleted: "Terminé",
    statusCancelled: "Annulé",
    statusNoShow: "Absent",
    statusScheduled: "Planifié",
    fallbackCardTitle: "Rendez-vous clinique",
    historyBtn: "Historique",
    rescheduleBtn: "Reprogrammer",
    cancelBtn: "Annuler",
    newStartLabel: "Nouveau début",
    newEndLabel: "Nouvelle fin",
    saveNewTimeBtn: "Enregistrer l'horaire",
    cancelRescheduleBtn: "Fermer",
    gitHistoryTitle: "Historique des modifications",
    loadingHistory: "Chargement de l'historique...",
    emptyHistory: "Aucune modification enregistrée pour ce rendez-vous.",
    searchPlaceholder: "Rechercher un rendez-vous...",
    searchAriaLabel: "Rechercher des rendez-vous",
    technicalAuditSummary: "Détails techniques d'audit",
    confirmCancelTitle: "Confirmer l'annulation du rendez-vous",
    confirmCancelDescPrefix: "Voulez-vous vraiment annuler le rendez-vous",
    confirmCancelBtn: "Oui, annuler le rendez-vous",
    dismissDialogBtn: "Conserver le rendez-vous",
    paginationPrev: "Précédent",
    paginationNext: "Suivant",
    paginationPageLabel: "Page",
    paginationOfLabel: "sur",
    selectClientPlaceholder: "Choisir un client existant (optionnel)",
    noServicesOption: "Aucune prestation active",
    noServicesNotice: "Ce praticien n'a pas encore de prestation active.",
    loadingServices: "Chargement des prestations...",
    calendarTitle: "Choisir une date",
    slotsTitle: "Créneaux disponibles (Timefold AI)",
    loadingSlots: "Calcul des créneaux...",
    noSlotsAvailable: "Aucun créneau disponible ce jour.",
    bookedSlotTag: "Occupé",
    outsideHoursSlotTag: "Hors horaires",
    outsideHoursToggle: "Afficher hors horaires habituels (07:00–21:00)",
    autoFromServicePrefix: "Calculé selon la prestation",
    notSelectedYet: "Choisir un créneau",
    clearDateBtn: "Effacer",
    prevMonthAria: "Mois précédent",
    nextMonthAria: "Mois suivant",
    anyTimeOption: "Premier disponible (recommandé)",
    selectedTimeSummaryLabel: "Créneau choisi",
    bookingSuccessNotice: "Votre rendez-vous a été réservé et confirmé.",
    disabledBookingHint: "Choisissez un praticien ayant au moins une prestation active.",
    selectTimeHint: "Sélectionnez une date et un créneau libre ci-dessus.",
  },
  es: {
    activeBadgeSuffix: "activas",
    cancelledBadgeSuffix: "canceladas",
    heading: "Citas y Reservas",
    timefoldBtn: "Horarios IA Timefold",
    scheduleBtn: "Horarios y Pausas",
    timefoldTitle: "Timefold AI — Optimización sin Conflictos",
    timefoldDesc: "Encuentra horarios disponibles sin solapamientos ni pausas.",
    openingHoursPrefix: "Horario de apertura",
    therapistLabel: "Terapeuta",
    therapistUuidPlaceholder: "UUID del terapeuta",
    dateLabel: "Fecha",
    durationLabel: "Duración",
    minutesUnit: "minutos",
    preferredTimeLabel: "Hora preferida",
    searchingSlots: "Buscando...",
    findSlotsBtn: "Buscar horarios",
    feasibleSolution: "Solución factible encontrada",
    noFullSolution: "Sin solución completa",
    useRecommendedPrefix: "Usar recomendado",
    weeklyScheduleTitle: "Horarios Laborales y Pausas (Multi-Franja)",
    activeWorkSuffix: "activo",
    breakWorkSuffix: "pausa",
    savingSchedule: "Guardando...",
    saveScheduleBtn: "Guardar horarios",
    scheduleSavedPrefix: "Horarios guardados",
    perWeekSuffix: "por semana",
    removeIntervalTitle: "Eliminar franja",
    breakBadgePrefix: "Pausa",
    addIntervalBtn: "+ Añadir franja",
    closedLabel: "Cerrado",
    weekendClosed: "Fin de semana: Cerrado",
    allWeekdaysSuffix: "(Todos los días laborables)",
    weekdays: {
      monday: "Lunes",
      tuesday: "Martes",
      wednesday: "Miércoles",
      thursday: "Jueves",
      friday: "Viernes",
      saturday: "Sábado",
      sunday: "Domingo",
    },
    clientNameLabel: "Nombre del cliente",
    clientNamePlaceholder: "Nombre del cliente",
    selectTherapistOption: "Seleccionar terapeuta",
    serviceLabel: "Servicio / Tratamiento",
    selectServiceOption: "Seleccionar servicio",
    sessionTitleLabel: "Título de la sesión",
    sessionTitlePlaceholder: "Título de la sesión",
    defaultConsultationTitle: "Consulta clínica",
    startTimeLabel: "Hora de inicio",
    endTimeLabel: "Hora de fin",
    bookBtn: "Reservar cita",
    filterActive: "Activas",
    filterCancelled: "Canceladas",
    filterAll: "Todas",
    dateFromAria: "Fecha desde",
    dateToConnector: "a",
    dateToAria: "Fecha hasta",
    applyFilterBtn: "Aplicar",
    resetFilterBtn: "Restablecer",
    refreshTitle: "Actualizar lista de citas",
    loadingAppointments: "Cargando citas...",
    emptyTitle: "No hay citas que coincidan con tu filtro",
    emptySubtitle: "Reserva una nueva cita arriba o cambia entre Activas, Canceladas y Todas.",
    statusConfirmed: "Confirmada",
    statusCompleted: "Completada",
    statusCancelled: "Cancelada",
    statusNoShow: "No asistió",
    statusScheduled: "Programada",
    fallbackCardTitle: "Cita clínica",
    historyBtn: "Historial",
    rescheduleBtn: "Reprogramar",
    cancelBtn: "Cancelar",
    newStartLabel: "Nuevo inicio",
    newEndLabel: "Nuevo fin",
    saveNewTimeBtn: "Guardar horario",
    cancelRescheduleBtn: "Cerrar",
    gitHistoryTitle: "Historial de cambios",
    loadingHistory: "Cargando historial de revisiones...",
    emptyHistory: "Aún no hay cambios registrados para esta cita.",
    searchPlaceholder: "Buscar citas...",
    searchAriaLabel: "Buscar citas",
    technicalAuditSummary: "Detalles técnicos de auditoría",
    confirmCancelTitle: "Confirmar cancelación de cita",
    confirmCancelDescPrefix: "¿Está seguro de que desea cancelar la cita",
    confirmCancelBtn: "Sí, cancelar cita",
    dismissDialogBtn: "Mantener cita",
    paginationPrev: "Anterior",
    paginationNext: "Siguiente",
    paginationPageLabel: "Página",
    paginationOfLabel: "de",
    selectClientPlaceholder: "Seleccionar cliente existente (opcional)",
    noServicesOption: "Sin servicios activos",
    noServicesNotice: "Este terapeuta aún no tiene servicios activos.",
    loadingServices: "Cargando servicios...",
    calendarTitle: "Seleccionar fecha",
    slotsTitle: "Horarios disponibles (Timefold AI)",
    loadingSlots: "Calculando horarios disponibles...",
    noSlotsAvailable: "No hay horarios disponibles este día.",
    bookedSlotTag: "Ocupado",
    outsideHoursSlotTag: "Fuera de horario",
    outsideHoursToggle: "Mostrar horarios fuera de jornada (07:00–21:00)",
    autoFromServicePrefix: "Calculado según el servicio",
    notSelectedYet: "Elegir horario en el calendario",
    clearDateBtn: "Limpiar",
    prevMonthAria: "Mes anterior",
    nextMonthAria: "Mes siguiente",
    anyTimeOption: "Primero disponible (recomendado)",
    selectedTimeSummaryLabel: "Horario elegido",
    bookingSuccessNotice: "Tu cita ha sido reservada y confirmada.",
    disabledBookingHint: "Selecciona un terapeuta con al menos un servicio activo.",
    selectTimeHint: "Elige una fecha y un horario libre arriba antes de reservar.",
  },
  de: {
    activeBadgeSuffix: "aktiv",
    cancelledBadgeSuffix: "storniert",
    heading: "Termine & Buchung",
    timefoldBtn: "Timefold KI Freie Termine",
    scheduleBtn: "Arbeitszeiten & Pausen",
    timefoldTitle: "Timefold KI — Konfliktfreie Terminoptimierung",
    timefoldDesc: "Findet freie Konsultationszeiten ohne Überschneidungen oder Pausen.",
    openingHoursPrefix: "Öffnungszeiten",
    therapistLabel: "Therapeut",
    therapistUuidPlaceholder: "Therapeut UUID",
    dateLabel: "Datum",
    durationLabel: "Dauer",
    minutesUnit: "Minuten",
    preferredTimeLabel: "Wunschzeit",
    searchingSlots: "Suche...",
    findSlotsBtn: "Freie Zeiten finden",
    feasibleSolution: "Machbare Lösung gefunden",
    noFullSolution: "Keine vollständige Lösung",
    useRecommendedPrefix: "Empfehlung übernehmen",
    weeklyScheduleTitle: "Arbeitszeiten & Mittagspausen (Mehrfachfenster)",
    activeWorkSuffix: "aktiv",
    breakWorkSuffix: "Pause",
    savingSchedule: "Speichert...",
    saveScheduleBtn: "Arbeitszeiten speichern",
    scheduleSavedPrefix: "Arbeitszeiten gespeichert",
    perWeekSuffix: "pro Woche",
    removeIntervalTitle: "Zeitfenster entfernen",
    breakBadgePrefix: "Pause",
    addIntervalBtn: "+ Zeitfenster hinzufügen",
    closedLabel: "Geschlossen",
    weekendClosed: "Wochenende: Geschlossen",
    allWeekdaysSuffix: "(Alle Werktage)",
    weekdays: {
      monday: "Montag",
      tuesday: "Dienstag",
      wednesday: "Mittwoch",
      thursday: "Donnerstag",
      friday: "Freitag",
      saturday: "Samstag",
      sunday: "Sonntag",
    },
    clientNameLabel: "Klientenname",
    clientNamePlaceholder: "Klientenname",
    selectTherapistOption: "Therapeut wählen",
    serviceLabel: "Leistung / Verlauf",
    selectServiceOption: "Leistung wählen",
    sessionTitleLabel: "Sitzungstitel",
    sessionTitlePlaceholder: "Sitzungstitel",
    defaultConsultationTitle: "Klinische Konsultation",
    startTimeLabel: "Startzeit",
    endTimeLabel: "Endzeit",
    bookBtn: "Termin buchen",
    filterActive: "Aktiv",
    filterCancelled: "Storniert",
    filterAll: "Alle",
    dateFromAria: "Datum von",
    dateToConnector: "bis",
    dateToAria: "Datum bis",
    applyFilterBtn: "Anwenden",
    resetFilterBtn: "Zurücksetzen",
    refreshTitle: "Terminliste aktualisieren",
    loadingAppointments: "Lade Termine...",
    emptyTitle: "Keine Termine entsprechen dem Filter",
    emptySubtitle: "Buchen Sie oben einen Termin oder wechseln Sie zwischen Aktiv, Storniert und Alle.",
    statusConfirmed: "Bestätigt",
    statusCompleted: "Abgeschlossen",
    statusCancelled: "Storniert",
    statusNoShow: "Nicht erschienen",
    statusScheduled: "Geplant",
    fallbackCardTitle: "Klinischer Termin",
    historyBtn: "Verlauf",
    rescheduleBtn: "Umbuchen",
    cancelBtn: "Stornieren",
    newStartLabel: "Neue Startzeit",
    newEndLabel: "Neue Endzeit",
    saveNewTimeBtn: "Neue Zeit speichern",
    cancelRescheduleBtn: "Abbrechen",
    gitHistoryTitle: "Änderungsverlauf",
    loadingHistory: "Lade Revisionsverlauf...",
    emptyHistory: "Noch keine Änderungen für diesen Termin erfasst.",
    searchPlaceholder: "Termine durchsuchen...",
    searchAriaLabel: "Termine suchen",
    technicalAuditSummary: "Technische Revisionsdetails",
    confirmCancelTitle: "Terminstornierung bestätigen",
    confirmCancelDescPrefix: "Möchten Sie den Termin wirklich stornieren",
    confirmCancelBtn: "Ja, Termin stornieren",
    dismissDialogBtn: "Termin behalten",
    paginationPrev: "Zurück",
    paginationNext: "Weiter",
    paginationPageLabel: "Seite",
    paginationOfLabel: "von",
    selectClientPlaceholder: "Bestehenden Klienten wählen (optional)",
    noServicesOption: "Keine aktiven Leistungen",
    noServicesNotice: "Dieser Therapeut hat noch keine aktiven Leistungen.",
    loadingServices: "Lade Leistungen...",
    calendarTitle: "Datum wählen",
    slotsTitle: "Freie Zeiten (Timefold KI)",
    loadingSlots: "Berechne freie Zeiten...",
    noSlotsAvailable: "An diesem Tag sind keine Zeiten verfügbar.",
    bookedSlotTag: "Belegt",
    outsideHoursSlotTag: "Außerhalb",
    outsideHoursToggle: "Zeiten außerhalb der Arbeitszeit (07:00–21:00)",
    autoFromServicePrefix: "Aus Leistung berechnet",
    notSelectedYet: "Zeit im Kalender wählen",
    clearDateBtn: "Leeren",
    prevMonthAria: "Vorheriger Monat",
    nextMonthAria: "Nächster Monat",
    anyTimeOption: "Nächstmöglicher Termin",
    selectedTimeSummaryLabel: "Gewählte Zeit",
    bookingSuccessNotice: "Ihr Termin wurde gebucht und bestätigt.",
    disabledBookingHint: "Wählen Sie einen Therapeuten mit aktiver Leistung.",
    selectTimeHint: "Bitte wählen Sie oben zuerst Datum und freie Zeit aus.",
  },
};

function localizeScheduleSummary(summaryText: string, copy: AppointmentCopy): string {
  let localized = summaryText;
  for (const key of WEEKDAY_ORDER) {
    localized = localized.replaceAll(WEEKDAY_LABELS[key].da, copy.weekdays[key]);
  }
  return localized
    .replaceAll("Weekend: Lukket", copy.weekendClosed)
    .replaceAll("Lukket", copy.closedLabel)
    .replaceAll("(Alle hverdage)", copy.allWeekdaysSuffix);
}

function getStatusPresentation(
  status: AppointmentStatus | undefined,
  copy: AppointmentCopy
): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "CONFIRMED":
      return {
        label: copy.statusConfirmed,
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "COMPLETED":
      return {
        label: copy.statusCompleted,
        badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
      };
    case "CANCELLED":
      return {
        label: copy.statusCancelled,
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      };
    case "NO_SHOW":
      return {
        label: copy.statusNoShow,
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "SCHEDULED":
    default:
      return {
        label: copy.statusScheduled,
        badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
      };
  }
}

// ============================================================================
// 2. MODULE-PRIVATE API SERVICE (Ingen 'export' — streng indkapsling)
// ============================================================================

/**
 * Module-private REST-klient bundet til `/api/backend/appointments` (Next.js BFF).
 * Sikrer via `DomainGuard`, at ufuldstændige eller kronologisk ugyldige
 * bookinger afvises på klientsiden, før der sendes netværkskald til backenden.
 */
class AppointmentApiService extends BaseApiService<AppointmentDto, string> {
  constructor() {
    super("/api/backend/appointments");
  }

  private assertChronologicalRange(startTime?: string, endTime?: string): void {
    if (startTime && endTime) {
      const startMs = Date.parse(startTime);
      const endMs = Date.parse(endTime);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        DomainGuard.check(
          endMs > startMs,
          "End time must be after start time",
          ErrorCode.VALIDATION_FAILED,
          "endTime"
        );
      }
    }
  }

  protected override validateBeforeCreate(dto: Partial<AppointmentDto>): void {
    DomainGuard.requireNotBlank(dto.clientName, "Client name", "clientName");
    DomainGuard.requireNotBlank(dto.startTime, "Start time", "startTime");
    this.assertChronologicalRange(dto.startTime, dto.endTime);
  }

  protected override validateBeforeUpdate(
    _id: string,
    dto: Partial<AppointmentDto>
  ): void {
    DomainGuard.requireNotBlank(dto.startTime, "Start time", "startTime");
    this.assertChronologicalRange(dto.startTime, dto.endTime);
  }

  public async getOptimalSlots(params: {
    therapistUuid: string;
    date: string;
    durationMinutes: number;
    preferredTime?: string;
    excludeAppointmentId?: string;
    includeOutsideHours?: boolean;
  }): Promise<TimefoldScheduleResponseDto> {
    DomainGuard.requireNotBlank(params.therapistUuid, "Therapist", "therapistUuid");
    DomainGuard.requireNotBlank(params.date, "Date", "date");
    const qs = new URLSearchParams({
      therapistUuid: params.therapistUuid,
      date: params.date,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.preferredTime) {
      qs.set("preferredTime", params.preferredTime);
    }
    if (params.excludeAppointmentId) {
      qs.set("excludeAppointmentId", params.excludeAppointmentId);
    }
    if (params.includeOutsideHours) {
      qs.set("includeOutsideHours", "true");
    }
    const raw = await this.request<
      TimefoldScheduleResponseDto | TimefoldSlotSuggestionDto[]
    >(`/timefold-slots?${qs.toString()}`);
    if (Array.isArray(raw)) {
      return { slots: raw, feasible: raw.length > 0 };
    }
    return raw;
  }

  public getGitHistory(appointmentId: string): Promise<AppointmentGitCommitDto[]> {
    DomainGuard.requireNotBlank(appointmentId, "Appointment ID", "id");
    return this.request<AppointmentGitCommitDto[]>(
      `/${encodeURIComponent(appointmentId)}/git-history`
    );
  }

  public getClientAppointmentsInWindow(
    clientUuid: string,
    fromDate?: string,
    toDate?: string
  ): Promise<AppointmentDto[]> {
    DomainGuard.requireNotBlank(clientUuid, "Client ID", "clientUuid");
    const qs = new URLSearchParams();
    if (fromDate) qs.set("from", fromDate);
    if (toDate) qs.set("to", toDate);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<AppointmentDto[]>(
      `/client/${encodeURIComponent(clientUuid)}${suffix}`
    );
  }

  public getClinicDirectory(): Promise<ClinicDirectoryDto> {
    return clinicIntegrationApi.getClinicDirectory();
  }

  public getTherapistServices(therapistUuid: string): Promise<DirectoryServiceDto[]> {
    return clinicIntegrationApi.getTherapistServices(therapistUuid);
  }

  public getClinicClients(): Promise<ClinicClientOptionDto[]> {
    return clinicIntegrationApi.getClinicClients();
  }

  public saveWorkingHours(workingHoursJson: string): Promise<unknown> {
    return clinicIntegrationApi.saveWorkingHours(workingHoursJson);
  }
}

class ClinicIntegrationApiService extends BaseApiService<HasId<string>, string> {
  constructor() {
    super("/api/backend/clinic");
  }

  public getClinicDirectory(): Promise<ClinicDirectoryDto> {
    return this.request<ClinicDirectoryDto>("/directory");
  }

  public async getTherapistServices(
    therapistUuid: string
  ): Promise<DirectoryServiceDto[]> {
    const raw = await this.request<DirectoryServiceDto[]>(
      `/services?therapistUuid=${encodeURIComponent(therapistUuid)}&activeOnly=true`
    );
    return Array.isArray(raw)
      ? deduplicateServices(raw.map((s) => normalizeDirectoryService(s)))
      : [];
  }

  public async getClinicClients(): Promise<ClinicClientOptionDto[]> {
    const raw = await this.request<ClinicClientOptionDto[]>("/clients");
    return Array.isArray(raw) ? raw : [];
  }

  public async saveWorkingHours(workingHoursJson: string): Promise<unknown> {
    const me = await this.request<{
      userUuid?: string;
      providerProfile?: {
        organisation?: { cvrNumber?: string; name?: string };
      };
    }>("/me");
    const org = me?.providerProfile?.organisation;
    return this.request("/therapist-onboarding", {
      method: "POST",
      body: JSON.stringify({
        workingHoursJson,
        ...(me?.userUuid ? { userUuid: me.userUuid } : {}),
        ...(org?.cvrNumber ? { cvrNumber: org.cvrNumber } : {}),
        ...(org?.name ? { organisationName: org.name } : {}),
      }),
    });
  }
}

const clinicIntegrationApi = new ClinicIntegrationApiService();
export const appointmentApi = new AppointmentApiService();

function toProblemDetail(err: unknown): ProblemDetail {
  if (err instanceof FrontendDomainException) {
    return err.problem;
  }
  return {
    type: "about:blank",
    title: "Booking Error",
    status: 500,
    detail: err instanceof Error ? err.message : "Unexpected error",
    errorCode: ErrorCode.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// 2B. GENANVENDELIGE CUSTOM KALENDER- & DATOVÆLGER-KOMPONENTER
// ============================================================================

interface BookingCalendarGridProps {
  selectedDate: string;
  onSelectDate: (isoDate: string) => void;
  locale: SupportedUiLocale;
  copy: AppointmentCopy;
  minDate?: string;
  weeklySchedule?: WeeklyScheduleConfig | null;
  allowClosedDays?: boolean;
  compact?: boolean;
  testId?: string;
}

const BookingCalendarGrid: React.FC<BookingCalendarGridProps> = ({
  selectedDate,
  onSelectDate,
  locale,
  copy,
  minDate,
  weeklySchedule = null,
  allowClosedDays = false,
  compact = false,
  testId = "booking-calendar",
}) => {
  const todayIso = getTodayIsoDate();
  const anchorIso = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? selectedDate
    : todayIso;
  const anchorParts = anchorIso.split("-").map(Number);

  const [viewYear, setViewYear] = useState<number>(anchorParts[0]);
  const [viewMonth, setViewMonth] = useState<number>(anchorParts[1] - 1);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const [y, m] = selectedDate.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [selectedDate]);

  const cells = useMemo(
    () => buildCalendarMonthCells(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const calLabels = CALENDAR_LABELS_BY_LOCALE[locale];
  const monFirstWeekdays = [1, 2, 3, 4, 5, 6, 0].map(
    (idx) => calLabels.weekdays[idx]
  );

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border border-slate-200 bg-white ${
        compact ? "p-3 shadow-lg" : "p-3.5 shadow-xs"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label={copy.prevMonthAria}
          data-testid={`${testId}-prev-month`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
        >
          <i className="bi bi-chevron-left text-xs" aria-hidden="true" />
        </button>
        <span
          className="text-xs font-bold text-slate-900 tracking-tight"
          data-testid={`${testId}-month-label`}
        >
          {formatMonthYearHeading(viewYear, viewMonth, locale)}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label={copy.nextMonthAria}
          data-testid={`${testId}-next-month`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
        >
          <i className="bi bi-chevron-right text-xs" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {monFirstWeekdays.map((wd) => (
          <div
            key={wd}
            className="text-center text-[10px] font-bold uppercase text-slate-400 py-1"
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, idx) => {
          if (!iso) {
            return <div key={`empty-${idx}`} className="h-9" />;
          }
          const dayNum = Number(iso.slice(8, 10));
          const isBeforeMin = Boolean(minDate && iso < minDate);
          const isClosed =
            !allowClosedDays &&
            Boolean(weeklySchedule && isDayClosed(weeklySchedule, iso));
          const disabled = isBeforeMin || isClosed;
          const isSelected = iso === selectedDate;
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(iso)}
              data-testid={`${testId}-day-${iso}`}
              className={`min-h-11 w-full rounded-xl text-xs font-semibold transition-colors ${
                isSelected
                  ? "bg-teal-700 text-white shadow-xs"
                  : disabled
                    ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                    : isToday
                      ? "border border-teal-500 bg-teal-50/70 text-teal-900 hover:bg-teal-100"
                      : "bg-white text-slate-700 hover:bg-teal-50 hover:text-teal-900"
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface DatePopoverPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  locale: SupportedUiLocale;
  copy: AppointmentCopy;
  testId: string;
  minDate?: string;
}

const DatePopoverPicker: React.FC<DatePopoverPickerProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  locale,
  copy,
  testId,
  minDate,
}) => {
  const [open, setOpen] = useState(false);
  const displayLabel = value ? formatIsoDateHuman(value, locale) : placeholder;

  return (
    <div className="relative">
      <input
        type="text"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        tabIndex={-1}
        className="sr-only"
      />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-testid={`${testId}-trigger`}
        aria-label={ariaLabel}
        className="min-h-11 w-full inline-flex items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 hover:border-teal-500 transition-colors"
      >
        <span className={value ? "font-semibold text-slate-800" : "text-slate-400"}>
          {displayLabel}
        </span>
        <i className="bi bi-calendar3 text-teal-700" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1.5 w-72 right-0 sm:left-0 sm:right-auto rounded-2xl bg-white shadow-xl border border-slate-200 p-2 space-y-2"
          data-testid={`${testId}-popover`}
        >
          <BookingCalendarGrid
            selectedDate={value}
            onSelectDate={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
            locale={locale}
            copy={copy}
            minDate={minDate}
            allowClosedDays
            compact
            testId={`${testId}-calendar`}
          />
          {value && (
            <div className="flex justify-end px-1 pb-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                data-testid={`${testId}-clear`}
                className="min-h-9 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                {copy.clearDateBtn}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. EXPORTED FEATURE VIEW (Præsentationslag koblet via useBaseCrud)
// ============================================================================

export interface AppointmentFeatureViewProps {
  portalMode?: "client" | "provider";
}

const APPOINTMENTS_PAGE_SIZE = 10;

export const AppointmentFeatureView: React.FC<AppointmentFeatureViewProps> = ({
  portalMode,
}) => {
  const auth = useOptionalAuth();
  const locale = useUiLocale();
  const copy = APPOINTMENT_COPY[locale];
  const hasLiveUuid = Boolean(
    auth?.user.id && UUID_PATTERN.test(auth.user.id)
  );
  const isTherapist = Boolean(auth?.hasRole("PROVIDER"));
  const isClientMode =
    portalMode === "client" ||
    (portalMode !== "provider" && Boolean(auth && !isTherapist));
  const isProviderPortal = !isClientMode && isTherapist && hasLiveUuid;
  const canEditWeeklySchedule = !isClientMode && (isTherapist || !auth);

  const {
    items,
    loading,
    error,
    fetchAll,
    create,
    update,
    remove,
    clearError,
    setError,
  } = useBaseCrud(appointmentApi);

  // Formular-tilstand
  const [clientName, setClientName] = useState("");
  const [selectedClientUuid, setSelectedClientUuid] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [title, setTitle] = useState("");
  const [selectedTherapistUuid, setSelectedTherapistUuid] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => getTomorrowIsoDate());
  const [includeOutsideHours, setIncludeOutsideHours] = useState(false);

  // Klinik-katalog (behandlere, dynamiske ydelser pr. behandler, klienter & Timefold booking-slots)
  const [providers, setProviders] = useState<DirectoryProviderDto[]>([]);
  const [services, setServices] = useState<DirectoryServiceDto[]>([]);
  const [therapistServices, setTherapistServices] = useState<DirectoryServiceDto[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [clinicClients, setClinicClients] = useState<ClinicClientOptionDto[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [bookingSlots, setBookingSlots] =
    useState<TimefoldScheduleResponseDto | null>(null);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [slotsRefreshTick, setSlotsRefreshTick] = useState(0);

  // Filter-, søge-, paginerings- & fanetilstand (`Aktive` skjuler gamle CANCELLED rækker som standard)
  const [statusFilter, setStatusFilter] =
    useState<AppointmentStatusFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [windowItems, setWindowItems] = useState<AppointmentDto[] | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  // Bekræftelsesdialog før aflysning + succesbesked ved ny booking
  const [pendingCancelAppointment, setPendingCancelAppointment] =
    useState<AppointmentDto | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  // Timefold AI-panel
  const [showTimefold, setShowTimefold] = useState(false);
  const [timefoldTherapistUuid, setTimefoldTherapistUuid] = useState("");
  const [timefoldDate, setTimefoldDate] = useState(() => getTomorrowIsoDate());
  const [timefoldDuration, setTimefoldDuration] = useState(60);
  const [timefoldPreferredTime, setTimefoldPreferredTime] = useState("10:00");
  const [timefoldResult, setTimefoldResult] =
    useState<TimefoldScheduleResponseDto | null>(null);
  const [timefoldLoading, setTimefoldLoading] = useState(false);

  // Terapeutens multi-vindue ugeskema (`Arbejdstider & Pauser`)
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleConfig>(
    () => getDefaultWeeklySchedule()
  );
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState<string | null>(null);

  // Inline Ombook + Ændringshistorik
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleDuration, setRescheduleDuration] = useState(60);
  const [rescheduleSlots, setRescheduleSlots] =
    useState<TimefoldScheduleResponseDto | null>(null);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [gitHistoryById, setGitHistoryById] = useState<
    Record<string, AppointmentGitCommitDto[] | undefined>
  >({});
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  // Prefill og lås klientnavn i Klientportalen (uanset om brugeren også har behandler-rolle)
  useEffect(() => {
    if (isClientMode && auth?.user.name) {
      setClientName(auth.user.name);
      setIncludeOutsideHours(false);
    }
  }, [isClientMode, auth?.user.name]);

  // Lås behandler til indlogget terapeut i Behandlerportalen og indlæs klientliste (ekskl. sig selv)
  useEffect(() => {
    if (isProviderPortal && auth?.user.id) {
      setSelectedTherapistUuid(auth.user.id);
      setTimefoldTherapistUuid((prev) => prev || auth.user.id);
      let cancelled = false;
      appointmentApi
        .getClinicClients()
        .then((rows) => {
          if (cancelled) return;
          const ownEmail = auth.user.email?.toLowerCase();
          const filtered = rows.filter(
            (c) =>
              c.userId !== auth.user.id &&
              (!ownEmail || c.email?.toLowerCase() !== ownEmail)
          );
          setClinicClients(filtered);
        })
        .catch(() => {
          // Valgfri klientliste; manuelt klientnavn virker stadig
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isProviderPortal, auth?.user.id, auth?.user.email]);

  const loadDirectory = useCallback(async () => {
    setDirectoryLoaded(true);
    try {
      const dir = await appointmentApi.getClinicDirectory();
      const loadedProviders = deduplicateProviders(
        Array.isArray(dir?.providers)
          ? dir.providers.map((p) => normalizeDirectoryProvider(p))
          : []
      );
      const loadedServices = deduplicateServices(
        Array.isArray(dir?.services)
          ? dir.services.map((s) => normalizeDirectoryService(s))
          : []
      );
      setProviders(loadedProviders);
      setServices(loadedServices);

      const pool = isProviderPortal
        ? loadedProviders.filter((p) => p.userUuid === auth?.user.id)
        : isClientMode && hasLiveUuid
          ? loadedProviders.filter((p) => p.userUuid !== auth?.user.id)
          : loadedProviders;

      if (pool.length > 0) {
        const preferred = pool[0];
        setSelectedTherapistUuid((prev) => prev || preferred.userUuid);
        setTimefoldTherapistUuid((prev) => prev || preferred.userUuid);
        if (preferred.workingHoursJson && isProviderPortal) {
          setWeeklySchedule(parseWeeklySchedule(preferred.workingHoursJson));
        }
      } else if (isClientMode && hasLiveUuid) {
        setSelectedTherapistUuid("");
        setTimefoldTherapistUuid("");
      }
    } catch {
      // Directory er valgfri; booking fungerer også uden kataloget
    }
  }, [auth?.user.id, isClientMode, isProviderPortal, hasLiveUuid]);

  useEffect(() => {
    if (hasLiveUuid && !directoryLoaded) {
      void loadDirectory();
    }
  }, [hasLiveUuid, directoryLoaded, loadDirectory]);

  const selectableProviders = useMemo(() => {
    if (isProviderPortal && auth?.user.id) {
      const own = providers.find((p) => p.userUuid === auth.user.id);
      return [
        own ?? {
          userUuid: auth.user.id,
          displayName: auth.user.name || auth.user.email || auth.user.id,
        },
      ];
    }
    if (isClientMode && hasLiveUuid) {
      return providers.filter((p) => p.userUuid !== auth?.user.id);
    }
    return providers;
  }, [
    providers,
    isProviderPortal,
    isClientMode,
    hasLiveUuid,
    auth?.user.id,
    auth?.user.name,
    auth?.user.email,
  ]);

  const effectiveTherapistUuid = isProviderPortal
    ? auth!.user.id
    : selectedTherapistUuid;

  // Dynamisk hentning af valgte behandlers aktive ydelser
  useEffect(() => {
    if (!hasLiveUuid) return;
    if (!effectiveTherapistUuid) {
      setTherapistServices([]);
      setSelectedServiceId("");
      return;
    }
    let cancelled = false;
    setServicesLoading(true);
    appointmentApi
      .getTherapistServices(effectiveTherapistUuid)
      .then((fetched) => {
        if (cancelled) return;
        setTherapistServices(fetched);
        if (fetched.length === 0) {
          setSelectedServiceId("");
          setTitle("");
          setStartTime("");
          setEndTime("");
        } else {
          setSelectedServiceId((prev) => {
            const match = fetched.find((s) => s.id === prev) ?? fetched[0];
            setTitle(match.name);
            if (match.durationMinutes && match.durationMinutes > 0) {
              setTimefoldDuration(match.durationMinutes);
            }
            return match.id;
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTherapistServices([]);
        setSelectedServiceId("");
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasLiveUuid, effectiveTherapistUuid]);

  const filteredServices = useMemo(() => {
    if (hasLiveUuid && effectiveTherapistUuid) {
      return deduplicateServices(therapistServices);
    }
    return deduplicateServices(services);
  }, [hasLiveUuid, effectiveTherapistUuid, therapistServices, services]);

  const selectedService = useMemo(
    () => filteredServices.find((s) => s.id === selectedServiceId) || null,
    [filteredServices, selectedServiceId]
  );

  const activeDurationMinutes =
    selectedService?.durationMinutes && selectedService.durationMinutes > 0
      ? selectedService.durationMinutes
      : timefoldDuration;

  // Beregn altid sluttidspunktet automatisk ud fra starttid + valgte ydelses varighed
  useEffect(() => {
    if (startTime && selectedService) {
      const computedEnd = addMinutesToIsoLocal(startTime, activeDurationMinutes);
      if (computedEnd && computedEnd !== endTime) {
        setEndTime(computedEnd);
      }
    }
  }, [startTime, selectedService, activeDurationMinutes, endTime]);

  const selectedProviderSchedule = useMemo<WeeklyScheduleConfig | null>(() => {
    if (isProviderPortal && showSchedulePanel) {
      return weeklySchedule;
    }
    const prov = providers.find((p) => p.userUuid === effectiveTherapistUuid);
    const rawJson = prov?.workingHoursJson?.trim();
    if (rawJson && rawJson.startsWith("{") && rawJson.includes('"days"')) {
      return parseWeeklySchedule(rawJson);
    }
    return null;
  }, [
    isProviderPortal,
    showSchedulePanel,
    weeklySchedule,
    providers,
    effectiveTherapistUuid,
  ]);

  // Hent live Timefold AI ledige tidsslots når behandler, dato eller ydelse skifter
  useEffect(() => {
    if (!hasLiveUuid || !effectiveTherapistUuid || !bookingDate) {
      setBookingSlots(null);
      return;
    }
    let cancelled = false;
    setBookingSlotsLoading(true);
    appointmentApi
      .getOptimalSlots({
        therapistUuid: effectiveTherapistUuid,
        date: bookingDate,
        durationMinutes: activeDurationMinutes,
        includeOutsideHours: isProviderPortal && includeOutsideHours,
      })
      .then((res) => {
        if (!cancelled) setBookingSlots(res);
      })
      .catch(() => {
        if (!cancelled) setBookingSlots(null);
      })
      .finally(() => {
        if (!cancelled) setBookingSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    hasLiveUuid,
    effectiveTherapistUuid,
    bookingDate,
    activeDurationMinutes,
    isProviderPortal,
    includeOutsideHours,
    slotsRefreshTick,
  ]);

  // Hent ledige Timefold-tider ved inline Ombook
  useEffect(() => {
    if (!hasLiveUuid || !rescheduleId || !rescheduleDate) {
      setRescheduleSlots(null);
      return;
    }
    const targetApt = items.find((a) => a.id === rescheduleId);
    const targetTherapist = targetApt?.therapistUuid || effectiveTherapistUuid;
    if (!targetTherapist) {
      setRescheduleSlots(null);
      return;
    }
    let cancelled = false;
    setRescheduleSlotsLoading(true);
    appointmentApi
      .getOptimalSlots({
        therapistUuid: targetTherapist,
        date: rescheduleDate,
        durationMinutes: rescheduleDuration,
        excludeAppointmentId: rescheduleId,
        includeOutsideHours: isProviderPortal && includeOutsideHours,
      })
      .then((res) => {
        if (!cancelled) setRescheduleSlots(res);
      })
      .catch(() => {
        if (!cancelled) setRescheduleSlots(null);
      })
      .finally(() => {
        if (!cancelled) setRescheduleSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    hasLiveUuid,
    rescheduleId,
    rescheduleDate,
    rescheduleDuration,
    items,
    effectiveTherapistUuid,
    isProviderPortal,
    includeOutsideHours,
  ]);

  const rawSourceItems = windowItems ?? items;
  const activeSourceItems = useMemo(() => {
    if (!hasLiveUuid || !auth?.user.id) return rawSourceItems;
    return rawSourceItems.filter((a) =>
      isClientMode
        ? !a.clientUuid || a.clientUuid === auth.user.id
        : !a.therapistUuid || a.therapistUuid === auth.user.id
    );
  }, [rawSourceItems, hasLiveUuid, auth?.user.id, isClientMode]);
  const activeCount = useMemo(
    () =>
      activeSourceItems.filter((a) => (a.status ?? "SCHEDULED") !== "CANCELLED")
        .length,
    [activeSourceItems]
  );
  const cancelledCount = useMemo(
    () => activeSourceItems.filter((a) => a.status === "CANCELLED").length,
    [activeSourceItems]
  );

  const displayedAppointments = useMemo(
    () =>
      filterAppointments(
        activeSourceItems,
        statusFilter,
        dateFrom,
        dateTo,
        searchQuery
      ),
    [activeSourceItems, statusFilter, dateFrom, dateTo, searchQuery]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(displayedAppointments.length / APPOINTMENTS_PAGE_SIZE)
  );
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAppointments = useMemo(() => {
    const startIdx = (safePage - 1) * APPOINTMENTS_PAGE_SIZE;
    return displayedAppointments.slice(
      startIdx,
      startIdx + APPOINTMENTS_PAGE_SIZE
    );
  }, [displayedAppointments, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, dateFrom, dateTo, windowItems]);

  const handleSelectService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const chosen = filteredServices.find((s) => s.id === serviceId);
    if (!chosen) return;
    setTitle(chosen.name);
    if (chosen.durationMinutes && chosen.durationMinutes > 0) {
      setTimefoldDuration(chosen.durationMinutes);
      if (startTime) {
        const computedEnd = addMinutesToIsoLocal(
          startTime,
          chosen.durationMinutes
        );
        if (computedEnd) setEndTime(computedEnd);
      }
    }
  };

  const handleSelectBookingDate = (isoDate: string) => {
    setBookingDate(isoDate);
    if (startTime && !startTime.startsWith(isoDate)) {
      setStartTime("");
      setEndTime("");
    }
  };

  const handleSelectBookingSlot = (slot: TimefoldSlotSuggestionDto) => {
    const nextStart = toDateTimeLocalInput(slot.startTime);
    const nextEnd =
      addMinutesToIsoLocal(nextStart, activeDurationMinutes) ||
      toDateTimeLocalInput(slot.endTime);
    setStartTime(nextStart);
    setEndTime(nextEnd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingSuccessMsg(null);
    const resolvedEnd =
      endTime || addMinutesToIsoLocal(startTime, activeDurationMinutes);
    const created = await create({
      clientName,
      clientUuid:
        isClientMode && hasLiveUuid
          ? auth?.user.id
          : isProviderPortal && selectedClientUuid
            ? selectedClientUuid
            : undefined,
      therapistUuid: effectiveTherapistUuid || undefined,
      serviceId: selectedServiceId || undefined,
      startTime,
      endTime: resolvedEnd || undefined,
      title: title || copy.defaultConsultationTitle,
      status: "SCHEDULED",
    });
    if (created) {
      setWindowItems(null);
      if (!isClientMode) {
        setClientName("");
        setSelectedClientUuid("");
      }
      setStartTime("");
      setEndTime("");
      setTitle(selectedService?.name || "");
      setSlotsRefreshTick((n) => n + 1);
      setBookingSuccessMsg(copy.bookingSuccessNotice);
    }
  };

  const handleApplyDateFilter = async () => {
    if (hasLiveUuid && isClientMode && auth?.user.id && (dateFrom || dateTo)) {
      setFilterLoading(true);
      clearError();
      try {
        const scoped = await appointmentApi.getClientAppointmentsInWindow(
          auth.user.id,
          dateFrom || undefined,
          dateTo || undefined
        );
        setWindowItems(scoped);
      } catch (err) {
        setError(toProblemDetail(err));
      } finally {
        setFilterLoading(false);
      }
    } else {
      setWindowItems(null);
    }
  };

  const handleResetDateFilter = () => {
    setDateFrom("");
    setDateTo("");
    setWindowItems(null);
  };

  const handleToggleTimefold = () => {
    const next = !showTimefold;
    setShowTimefold(next);
    if (next && !directoryLoaded) {
      void loadDirectory();
    }
  };

  const handleFetchTimefoldSlots = async () => {
    const targetTherapist = timefoldTherapistUuid || effectiveTherapistUuid;
    setTimefoldLoading(true);
    clearError();
    try {
      const response = await appointmentApi.getOptimalSlots({
        therapistUuid: targetTherapist,
        date: timefoldDate,
        durationMinutes: timefoldDuration,
        preferredTime: timefoldPreferredTime || undefined,
        includeOutsideHours: isProviderPortal && includeOutsideHours,
      });
      setTimefoldResult(response);
    } catch (err) {
      setError(toProblemDetail(err));
    } finally {
      setTimefoldLoading(false);
    }
  };

  const applyTimefoldSlot = (slotStart: string, slotEnd: string) => {
    const normalizedStart = toDateTimeLocalInput(slotStart);
    const derivedDate = normalizedStart.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(derivedDate)) {
      setBookingDate(derivedDate);
    }
    setStartTime(normalizedStart);
    const resolvedEnd = selectedService
      ? addMinutesToIsoLocal(normalizedStart, activeDurationMinutes)
      : toDateTimeLocalInput(slotEnd);
    setEndTime(resolvedEnd);
    if (!isProviderPortal && timefoldTherapistUuid) {
      setSelectedTherapistUuid(timefoldTherapistUuid);
    }
  };

  const startReschedule = (item: AppointmentDto) => {
    const startVal = toDateTimeLocalInput(item.startTime);
    const endVal = toDateTimeLocalInput(item.endTime);
    let dur = 60;
    if (startVal && endVal) {
      const diffMins = Math.round((Date.parse(endVal) - Date.parse(startVal)) / 60000);
      if (diffMins > 0) dur = diffMins;
    }
    setRescheduleId(item.id!);
    setRescheduleDuration(dur);
    setRescheduleDate(
      /^\d{4}-\d{2}-\d{2}/.test(startVal) ? startVal.slice(0, 10) : getTomorrowIsoDate()
    );
    setRescheduleStart(startVal);
    setRescheduleEnd(endVal || addMinutesToIsoLocal(startVal, dur));
  };

  const handleSaveReschedule = async (item: AppointmentDto) => {
    const updated = await update(item.id!, {
      ...item,
      startTime: rescheduleStart,
      endTime: rescheduleEnd || undefined,
    });
    if (updated) {
      setWindowItems((prev) =>
        prev ? prev.map((entry) => (entry.id === item.id ? updated : entry)) : null
      );
      setRescheduleId(null);
      setSlotsRefreshTick((n) => n + 1);
    }
  };

  const handleCancelAppointment = async (id: string) => {
    const ok = await remove(id);
    if (ok) {
      setWindowItems((prev) =>
        prev ? prev.filter((entry) => entry.id !== id) : null
      );
      setSlotsRefreshTick((n) => n + 1);
    }
  };

  const handleToggleGitHistory = async (id: string) => {
    if (openHistoryId === id) {
      setOpenHistoryId(null);
      return;
    }
    setOpenHistoryId(id);
    if (gitHistoryById[id]) return;
    setHistoryLoadingId(id);
    try {
      const commits = await appointmentApi.getGitHistory(id);
      setGitHistoryById((prev) => ({ ...prev, [id]: commits }));
    } catch (err) {
      setError(toProblemDetail(err));
    } finally {
      setHistoryLoadingId(null);
    }
  };

  // Multi-vindue ugeskema opdateringer
  const updateDayEnabled = (dayKey: WeekdayKey, enabled: boolean) => {
    setWeeklySchedule((prev) =>
      recomputeSchedule({
        ...prev,
        days: prev.days.map((d) =>
          d.day === dayKey
            ? {
                ...d,
                enabled,
                intervals:
                  enabled && d.intervals.length === 0
                    ? [{ id: `${dayKey}-int-1`, start: "08:30", end: "16:00" }]
                    : d.intervals,
              }
            : d
        ),
      })
    );
    setScheduleSavedMsg(null);
  };

  const updateDayInterval = (
    dayKey: WeekdayKey,
    intervalId: string,
    patch: Partial<TimeInterval>
  ) => {
    setWeeklySchedule((prev) =>
      recomputeSchedule({
        ...prev,
        days: prev.days.map((d) =>
          d.day === dayKey
            ? {
                ...d,
                intervals: d.intervals.map((intv) =>
                  intv.id === intervalId ? { ...intv, ...patch } : intv
                ),
              }
            : d
        ),
      })
    );
    setScheduleSavedMsg(null);
  };

  const addDayInterval = (dayKey: WeekdayKey) => {
    setWeeklySchedule((prev) =>
      recomputeSchedule({
        ...prev,
        days: prev.days.map((d) => {
          if (d.day !== dayKey) return d;
          const lastEnd = d.intervals[d.intervals.length - 1]?.end || "12:00";
          const nextStartMins = Math.min(1380, timeToMinutes(lastEnd) + 30);
          const nextEndMins = Math.min(1435, nextStartMins + 180);
          return {
            ...d,
            enabled: true,
            intervals: [
              ...d.intervals,
              {
                id: `${dayKey}-int-${d.intervals.length + 1}`,
                start: minutesToTime(nextStartMins),
                end: minutesToTime(nextEndMins),
              },
            ],
          };
        }),
      })
    );
    setScheduleSavedMsg(null);
  };

  const removeDayInterval = (dayKey: WeekdayKey, intervalId: string) => {
    setWeeklySchedule((prev) =>
      recomputeSchedule({
        ...prev,
        days: prev.days.map((d) =>
          d.day === dayKey
            ? {
                ...d,
                intervals: d.intervals.filter((intv) => intv.id !== intervalId),
              }
            : d
        ),
      })
    );
    setScheduleSavedMsg(null);
  };

  const handleSaveWeeklySchedule = async () => {
    setScheduleSaving(true);
    clearError();
    setScheduleSavedMsg(null);
    try {
      const serialized = serializeWeeklySchedule(weeklySchedule);
      await appointmentApi.saveWorkingHours(serialized);
      setScheduleSavedMsg(
        `${copy.scheduleSavedPrefix} (${formatMinutes(weeklySchedule.totalWorkMinutes, locale !== "da")} ${copy.perWeekSuffix})`
      );
    } catch (err) {
      setError(toProblemDetail(err));
    } finally {
      setScheduleSaving(false);
    }
  };

  const busy = loading || filterLoading;

  return (
    <div
      className="space-y-5"
      data-testid="appointment-feature-view"
    >
      <div className="space-y-5" data-testid="booking-feature-view">
        {/* Header + KPI-piller & værktøjsknapper */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                <i className="bi bi-calendar2-check" aria-hidden="true" />
                {activeCount} {copy.activeBadgeSuffix}
              </span>
              {cancelledCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {cancelledCount} {copy.cancelledBadgeSuffix}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 m-0">
              {copy.heading}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleTimefold}
              data-testid="toggle-timefold-panel"
              className={`min-h-11 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                showTimefold
                  ? "border-teal-600 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <i className="bi bi-stars text-teal-600" aria-hidden="true" />
              {copy.timefoldBtn}
            </button>

            {canEditWeeklySchedule && (
              <button
                type="button"
                onClick={() => setShowSchedulePanel((prev) => !prev)}
                data-testid="toggle-weekly-schedule"
                className={`min-h-11 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  showSchedulePanel
                    ? "border-sky-600 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <i className="bi bi-clock-history text-sky-600" aria-hidden="true" />
                {copy.scheduleBtn}
              </button>
            )}
          </div>
        </div>

        <ProblemAlert error={error} onDismiss={clearError} />

        {bookingSuccessMsg && (
          <div
            role="status"
            data-testid="booking-success-banner"
            className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900"
          >
            <span>{bookingSuccessMsg}</span>
            <button
              type="button"
              onClick={() => setBookingSuccessMsg(null)}
              aria-label={copy.clearDateBtn}
              className="rounded-lg px-2 py-1 text-emerald-700 hover:bg-emerald-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Timefold AI Sammenfoldeligt Slot-panel */}
        {showTimefold && (
          <section
            className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5 space-y-4"
            data-testid="timefold-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-1.5">
                  <i className="bi bi-cpu text-teal-700" aria-hidden="true" />
                  {copy.timefoldTitle}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 mb-0">
                  {copy.timefoldDesc}
                </p>
              </div>
              {timefoldResult?.workingHoursWindow && (
                <span className="rounded-full bg-white border border-teal-200 px-2.5 py-1 text-xs font-medium text-teal-800">
                  {copy.openingHoursPrefix}:{" "}
                  {localizeOpeningWindow(
                    timefoldResult.workingHoursWindow,
                    copy.closedLabel
                  )}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">
                  {copy.therapistLabel}
                </label>
                {selectableProviders.length > 0 ? (
                  <select
                    value={timefoldTherapistUuid}
                    disabled={isProviderPortal}
                    onChange={(e) => setTimefoldTherapistUuid(e.target.value)}
                    data-testid="timefold-therapist"
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
                  >
                    {selectableProviders.map((p) => (
                      <option key={p.userUuid} value={p.userUuid}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder={copy.therapistUuidPlaceholder}
                    value={timefoldTherapistUuid}
                    onChange={(e) => setTimefoldTherapistUuid(e.target.value)}
                    data-testid="timefold-therapist"
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">
                  {copy.dateLabel}
                </label>
                <DatePopoverPicker
                  value={timefoldDate}
                  onChange={setTimefoldDate}
                  placeholder={copy.calendarTitle}
                  ariaLabel={copy.dateLabel}
                  locale={locale}
                  copy={copy}
                  testId="timefold-date"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">
                  {copy.durationLabel}
                </label>
                <select
                  value={timefoldDuration}
                  onChange={(e) => setTimefoldDuration(Number(e.target.value))}
                  data-testid="timefold-duration"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  <option value={30}>30 {copy.minutesUnit}</option>
                  <option value={45}>45 {copy.minutesUnit}</option>
                  <option value={60}>60 {copy.minutesUnit}</option>
                  <option value={90}>90 {copy.minutesUnit}</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">
                  {copy.preferredTimeLabel}
                </label>
                <select
                  value={timefoldPreferredTime}
                  onChange={(e) => setTimefoldPreferredTime(e.target.value)}
                  data-testid="timefold-preferred-time"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  <option value="">{copy.anyTimeOption}</option>
                  {[
                    "08:00",
                    "08:30",
                    "09:00",
                    "09:30",
                    "10:00",
                    "10:30",
                    "11:00",
                    "11:30",
                    "12:00",
                    "12:30",
                    "13:00",
                    "13:30",
                    "14:00",
                    "14:30",
                    "15:00",
                    "15:30",
                    "16:00",
                    "17:00",
                    "18:00",
                  ].map((hhmm) => (
                    <option key={hhmm} value={hhmm}>
                      {hhmm}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleFetchTimefoldSlots}
                disabled={timefoldLoading}
                data-testid="fetch-timefold-slots"
                className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 text-xs font-semibold shadow-xs transition-colors"
              >
                <i className="bi bi-search" aria-hidden="true" />
                {timefoldLoading ? copy.searchingSlots : copy.findSlotsBtn}
              </button>
            </div>

            {timefoldResult && (
              <div className="space-y-2.5 pt-2 border-t border-teal-200/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    {timefoldResult.solver || "Timefold Solver"} ·{" "}
                    {timefoldResult.feasible ? copy.feasibleSolution : copy.noFullSolution}
                  </span>
                  {timefoldResult.recommendedSlot && (
                    <button
                      type="button"
                      onClick={() => {
                        const { startTime: recStart, endTime: recEnd } =
                          resolveRecommendedSlotRange(
                            timefoldResult,
                            timefoldDate,
                            timefoldDuration
                          );
                        applyTimefoldSlot(recStart, recEnd);
                      }}
                      data-testid="apply-recommended-slot"
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-semibold shadow-xs"
                    >
                      <i className="bi bi-check2-circle" aria-hidden="true" />
                      {copy.useRecommendedPrefix}: {timefoldResult.recommendedSlot.replace("T", " ")}
                    </button>
                  )}
                </div>

                {timefoldResult.slots && timefoldResult.slots.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {timefoldResult.slots.map((slot, idx) => {
                      const available = slot.available !== false && !slot.overlaps && !slot.inPast;
                      const labelClock =
                        slot.slot ||
                        `${toDateTimeLocalInput(slot.startTime).slice(11, 16)}–${toDateTimeLocalInput(slot.endTime).slice(11, 16)}`;
                      return (
                        <button
                          key={`${slot.startTime}-${idx}`}
                          type="button"
                          disabled={!available}
                          onClick={() => applyTimefoldSlot(slot.startTime, slot.endTime)}
                          data-testid={`slot-pill-${idx}`}
                          title={slot.reason || undefined}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            slot.recommended
                              ? "border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                              : available
                                ? "border-teal-200 bg-white text-slate-800 hover:border-teal-500 hover:bg-teal-50"
                                : "border-slate-200 bg-slate-100 text-slate-400"
                          }`}
                        >
                          {slot.recommended && (
                            <i className="bi bi-star-fill text-emerald-600" aria-hidden="true" />
                          )}
                          <span>{labelClock}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Terapeutens Multi-Vindue Ugeskema & Pauser */}
        {showSchedulePanel && canEditWeeklySchedule && (
          <section
            className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 sm:p-5 space-y-4"
            data-testid="weekly-schedule-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-1.5">
                  <i className="bi bi-calendar-week text-sky-700" aria-hidden="true" />
                  {copy.weeklyScheduleTitle}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 mb-0">
                  {localizeScheduleSummary(weeklySchedule.summaryText, copy)} ·{" "}
                  <strong>{formatMinutes(weeklySchedule.totalWorkMinutes, locale !== "da")}</strong>{" "}
                  {copy.activeWorkSuffix} /{" "}
                  {formatMinutes(weeklySchedule.totalBreakMinutes, locale !== "da")}{" "}
                  {copy.breakWorkSuffix}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveWeeklySchedule}
                disabled={scheduleSaving}
                data-testid="save-weekly-schedule"
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white px-4 py-2 text-xs font-semibold shadow-xs transition-colors"
              >
                <i className="bi bi-cloud-check" aria-hidden="true" />
                {scheduleSaving ? copy.savingSchedule : copy.saveScheduleBtn}
              </button>
            </div>

            {scheduleSavedMsg && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
                data-testid="weekly-schedule-saved"
              >
                {scheduleSavedMsg}
              </div>
            )}

            <div className="space-y-2">
              {weeklySchedule.days.map((day) => {
                const breaks = getBreaksForDay(day);
                return (
                  <div
                    key={day.day}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                  >
                    <label className="inline-flex items-center gap-2 min-w-32 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={day.enabled}
                        onChange={(e) => updateDayEnabled(day.day, e.target.checked)}
                        data-testid={`day-enabled-${day.day}`}
                        className="h-4 w-4 accent-teal-700 rounded"
                      />
                      <span>{copy.weekdays[day.day]}</span>
                    </label>

                    {day.enabled ? (
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        {day.intervals.map((intv) => (
                          <div
                            key={intv.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                          >
                            <input
                              type="time"
                              value={intv.start}
                              onChange={(e) =>
                                updateDayInterval(day.day, intv.id, {
                                  start: roundTo5Min(e.target.value),
                                })
                              }
                              className="!py-1 !px-2 !text-xs"
                            />
                            <span className="text-xs text-slate-400">–</span>
                            <input
                              type="time"
                              value={intv.end}
                              onChange={(e) =>
                                updateDayInterval(day.day, intv.id, {
                                  end: roundTo5Min(e.target.value),
                                })
                              }
                              className="!py-1 !px-2 !text-xs"
                            />
                            {day.intervals.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeDayInterval(day.day, intv.id)}
                                className="rounded-md px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
                                title={copy.removeIntervalTitle}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}

                        {breaks.map((br, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-medium text-amber-800"
                          >
                            {copy.breakBadgePrefix} {br.start}–{br.end} ({br.durationMinutes}m)
                          </span>
                        ))}

                        <button
                          type="button"
                          onClick={() => addDayInterval(day.day)}
                          data-testid={`add-interval-${day.day}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-sky-300 bg-sky-50/70 hover:bg-sky-100 text-sky-800 px-2.5 py-1 text-xs font-medium"
                        >
                          {copy.addIntervalBtn}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">{copy.closedLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Bekræftelsesdialog før aflysning */}
        <ConfirmActionDialog
          open={Boolean(pendingCancelAppointment)}
          title={copy.confirmCancelTitle}
          description={`${copy.confirmCancelDescPrefix}${
            pendingCancelAppointment?.title || pendingCancelAppointment?.clientName
              ? ` "${pendingCancelAppointment.title || pendingCancelAppointment.clientName}"`
              : ""
          }?`}
          confirmLabel={copy.confirmCancelBtn}
          cancelLabel={copy.dismissDialogBtn}
          tone="danger"
          onCancel={() => setPendingCancelAppointment(null)}
          onConfirm={() => {
            const targetId = pendingCancelAppointment?.id;
            setPendingCancelAppointment(null);
            if (targetId) void handleCancelAppointment(targetId);
          }}
        />

        {/* Moderne Booking-formular (Klient/Behandler) */}
        <form
          noValidate
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                {copy.clientNameLabel}
              </label>
              {isProviderPortal && clinicClients.length > 0 && (
                <select
                  value={selectedClientUuid}
                  onChange={(e) => {
                    const uuid = e.target.value;
                    setSelectedClientUuid(uuid);
                    const picked = clinicClients.find((c) => c.userId === uuid);
                    if (picked?.fullName) {
                      setClientName(picked.fullName);
                    }
                  }}
                  data-testid="select-booking-client"
                  className="w-full min-h-11 mb-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">{copy.selectClientPlaceholder}</option>
                  {clinicClients.map((c, idx) => (
                    <option key={c.userId || `${c.fullName}-${idx}`} value={c.userId || ""}>
                      {c.fullName}
                      {c.email ? ` (${c.email})` : ""}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder={copy.clientNamePlaceholder}
                value={clientName}
                readOnly={isClientMode && Boolean(auth?.user.name)}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (selectedClientUuid) setSelectedClientUuid("");
                }}
                data-testid="input-clientName"
                className={`w-full min-h-11 ${
                  isClientMode && auth?.user.name
                    ? "bg-slate-100 text-slate-700 cursor-not-allowed"
                    : ""
                }`}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                {copy.therapistLabel}
              </label>
              <select
                value={effectiveTherapistUuid}
                disabled={isProviderPortal}
                onChange={(e) => setSelectedTherapistUuid(e.target.value)}
                data-testid="select-therapist"
                className="w-full h-11 min-h-11 truncate disabled:bg-slate-100 disabled:text-slate-700"
              >
                {!isProviderPortal && (
                  <option value="">{copy.selectTherapistOption}</option>
                )}
                {selectableProviders.map((p) => (
                  <option key={p.userUuid || p.id || p.displayName} value={p.userUuid}>
                    {p.displayName}
                    {p.organisationName ? ` (${p.organisationName})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                {copy.serviceLabel}
              </label>
              <select
                value={selectedServiceId}
                disabled={
                  servicesLoading ||
                  (hasLiveUuid && Boolean(effectiveTherapistUuid) && filteredServices.length === 0)
                }
                onChange={(e) => handleSelectService(e.target.value)}
                data-testid="select-service"
                className="w-full min-h-11 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">
                  {servicesLoading
                    ? copy.loadingServices
                    : hasLiveUuid && effectiveTherapistUuid && filteredServices.length === 0
                      ? copy.noServicesOption
                      : copy.selectServiceOption}
                </option>
                {filteredServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.durationMinutes ? ` (${s.durationMinutes} min)` : ""}
                  </option>
                ))}
              </select>
              {hasLiveUuid &&
                Boolean(effectiveTherapistUuid) &&
                !servicesLoading &&
                filteredServices.length === 0 && (
                  <p
                    data-testid="no-therapist-services-notice"
                    className="text-[11px] font-medium text-amber-700 mt-0.5 mb-0"
                  >
                    {copy.noServicesNotice}
                  </p>
                )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                {copy.sessionTitleLabel}
              </label>
              <input
                type="text"
                placeholder={copy.sessionTitlePlaceholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
                className="w-full min-h-11"
              />
            </div>
          </div>

          {/* Visuel Månedskalender + Klikbare Timefold AI Tidsslots + Auto-beregnet Sluttidspunkt */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-5 space-y-1.5">
              <div className="text-xs font-semibold text-slate-600">
                {copy.calendarTitle}
              </div>
              <BookingCalendarGrid
                selectedDate={bookingDate}
                onSelectDate={handleSelectBookingDate}
                locale={locale}
                copy={copy}
                minDate={getTodayIsoDate()}
                weeklySchedule={selectedProviderSchedule}
                allowClosedDays={isProviderPortal && includeOutsideHours}
                testId="booking-calendar"
              />
            </div>

            <div className="lg:col-span-7 space-y-3">
              <div
                data-testid="booking-timefold-slots"
                className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <i className="bi bi-cpu text-teal-700" aria-hidden="true" />
                    <span>{copy.slotsTitle}</span>
                    <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                      {formatIsoDateHuman(bookingDate, locale)}
                    </span>
                  </div>
                  {bookingSlots?.workingHoursWindow && (
                    <span className="text-[11px] font-medium text-slate-500">
                      {copy.openingHoursPrefix}:{" "}
                      {localizeOpeningWindow(
                        bookingSlots.workingHoursWindow,
                        copy.closedLabel
                      )}
                    </span>
                  )}
                </div>

                {isProviderPortal && (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOutsideHours}
                      onChange={(e) => setIncludeOutsideHours(e.target.checked)}
                      data-testid="toggle-outside-hours"
                      className="h-4 w-4 accent-teal-700 rounded"
                    />
                    <span>{copy.outsideHoursToggle}</span>
                  </label>
                )}

                {bookingSlotsLoading ? (
                  <p className="text-xs text-slate-500 m-0 py-2">
                    <i className="bi bi-hourglass-split mr-1.5" aria-hidden="true" />
                    {copy.loadingSlots}
                  </p>
                ) : bookingSlots?.slots && bookingSlots.slots.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {bookingSlots.slots.map((slot, idx) => {
                      const slotIsoLocal = toDateTimeLocalInput(slot.startTime);
                      const slotClock = slotIsoLocal.slice(11, 16) || slot.slot;
                      const available =
                        slot.available !== false && !slot.overlaps && !slot.inPast;
                      const isPicked =
                        Boolean(startTime) && startTime === slotIsoLocal;
                      const isOutsideNormal =
                        slot.withinWorkingHours === false && available;

                      return (
                        <button
                          key={`${slot.startTime}-${idx}`}
                          type="button"
                          disabled={!available}
                          onClick={() => handleSelectBookingSlot(slot)}
                          data-testid={`booking-slot-${slotClock}`}
                          title={
                            slot.overlaps
                              ? copy.bookedSlotTag
                              : isOutsideNormal
                                ? copy.outsideHoursSlotTag
                                : undefined
                          }
                          className={`min-h-11 rounded-xl border px-2 py-1.5 text-xs font-semibold transition-colors flex flex-col items-center justify-center ${
                            isPicked
                              ? "border-teal-700 bg-teal-700 text-white shadow-xs"
                              : !available
                                ? "border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed"
                                : slot.recommended
                                  ? "border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                                  : isOutsideNormal
                                    ? "border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100"
                                    : "border-slate-200 bg-white text-slate-800 hover:border-teal-500 hover:bg-teal-50"
                          }`}
                        >
                          <span>{slotClock}</span>
                          {isOutsideNormal && (
                            <span className="text-[9px] font-medium opacity-80">
                              *
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    data-testid="booking-slots-empty"
                    className="text-xs text-slate-500 m-0 py-2"
                  >
                    {copy.noSlotsAvailable}
                  </p>
                )}
              </div>

              {/* Valgt Start- & Service-beregnet Sluttidspunkt + Book-knap */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">
                    {copy.startTimeLabel}
                  </label>
                  <div
                    data-testid="display-startTime"
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                  >
                    <i className="bi bi-clock text-teal-700" aria-hidden="true" />
                    <span>
                      {startTime
                        ? `${formatIsoDateHuman(startTime.slice(0, 10), locale)} · ${startTime.slice(11, 16)}`
                        : copy.notSelectedYet}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    data-testid="input-startTime"
                    aria-label={copy.startTimeLabel}
                    tabIndex={-1}
                    className="sr-only"
                  />
                </div>

                <div className="sm:col-span-5 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center justify-between gap-2">
                    <span>{copy.endTimeLabel}</span>
                    {selectedService?.durationMinutes && (
                      <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                        {copy.autoFromServicePrefix}: +{selectedService.durationMinutes} min
                      </span>
                    )}
                  </label>
                  <div
                    data-testid="display-endTime"
                    className="min-h-11 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <i className="bi bi-lock text-slate-500" aria-hidden="true" />
                    <span>
                      {endTime
                        ? `${formatIsoDateHuman(endTime.slice(0, 10), locale)} · ${endTime.slice(11, 16)}`
                        : "--:--"}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={endTime}
                    readOnly={Boolean(selectedServiceId) || hasLiveUuid}
                    onChange={(e) => setEndTime(e.target.value)}
                    data-testid="input-endTime"
                    aria-label={copy.endTimeLabel}
                    tabIndex={-1}
                    className="sr-only"
                  />
                </div>

                <div className="sm:col-span-3 flex flex-col items-stretch justify-end gap-1">
                  <button
                    type="submit"
                    disabled={
                      busy ||
                      (hasLiveUuid &&
                        Boolean(effectiveTherapistUuid) &&
                        !servicesLoading &&
                        filteredServices.length === 0)
                    }
                    title={
                      hasLiveUuid &&
                      Boolean(effectiveTherapistUuid) &&
                      !servicesLoading &&
                      filteredServices.length === 0
                        ? copy.disabledBookingHint
                        : undefined
                    }
                    data-testid="submit-booking"
                    className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
                  >
                    <i className="bi bi-calendar-plus" aria-hidden="true" />
                    {copy.bookBtn}
                  </button>
                </div>
              </div>
              {hasLiveUuid &&
              Boolean(effectiveTherapistUuid) &&
              !servicesLoading &&
              filteredServices.length === 0 ? (
                <p
                  data-testid="booking-disabled-hint"
                  className="text-[11px] font-medium text-amber-700 m-0 text-right"
                >
                  {copy.disabledBookingHint}
                </p>
              ) : (
                !startTime && (
                  <p
                    data-testid="booking-time-hint"
                    className="text-[11px] text-slate-500 m-0 text-right"
                  >
                    {copy.selectTimeHint}
                  </p>
                )
              )}
            </div>
          </div>
        </form>

        {/* Status-faner + Søgning + Datointerval-filter */}
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "active", label: `${copy.filterActive} (${activeCount})` },
                  { id: "cancelled", label: `${copy.filterCancelled} (${cancelledCount})` },
                  { id: "all", label: `${copy.filterAll} (${activeSourceItems.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  data-testid={`filter-status-${tab.id}`}
                  className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                    statusFilter === tab.id
                      ? "bg-slate-900 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label={copy.searchAriaLabel}
                placeholder={copy.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="filter-appointment-search"
                className="min-h-11 w-full sm:w-56 !py-2 !px-3 !text-xs"
              />
              <DatePopoverPicker
                value={dateFrom}
                onChange={setDateFrom}
                placeholder={copy.dateFromAria}
                ariaLabel={copy.dateFromAria}
                locale={locale}
                copy={copy}
                testId="filter-date-from"
              />
              <span className="text-xs text-slate-400">{copy.dateToConnector}</span>
              <DatePopoverPicker
                value={dateTo}
                onChange={setDateTo}
                placeholder={copy.dateToAria}
                ariaLabel={copy.dateToAria}
                locale={locale}
                copy={copy}
                testId="filter-date-to"
              />
              <button
                type="button"
                onClick={handleApplyDateFilter}
                data-testid="apply-date-filter"
                className="min-h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                {copy.applyFilterBtn}
              </button>
              {(dateFrom || dateTo || searchQuery || windowItems) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    handleResetDateFilter();
                  }}
                  data-testid="reset-date-filter"
                  className="min-h-11 rounded-xl px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                >
                  {copy.resetFilterBtn}
                </button>
              )}
              <button
                type="button"
                onClick={() => void fetchAll()}
                className="min-h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs text-slate-600"
                title={copy.refreshTitle}
              >
                <i className="bi bi-arrow-clockwise" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {busy && (
          <p
            className="text-sm text-slate-500 flex items-center gap-2"
            data-testid="loading-indicator"
          >
            <i className="bi bi-hourglass-split animate-pulse" aria-hidden="true" />
            {copy.loadingAppointments}
          </p>
        )}

        {/* Aftalekort-liste */}
        {!busy && displayedAppointments.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center"
            data-testid="booking-empty-state"
          >
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-teal-700">
              <i className="bi bi-calendar3" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-slate-800 m-0">
              {copy.emptyTitle}
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-0">
              {copy.emptySubtitle}
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-3" data-testid="booking-list">
              {paginatedAppointments.map((item) => {
                const dateParts = formatAppointmentDateParts(
                  item.startTime,
                  item.endTime,
                  locale
                );
                const badge = getStatusPresentation(item.status, copy);
                const isCancelled = item.status === "CANCELLED";
                const isRescheduling = Boolean(item.id && rescheduleId === item.id);
                const isHistoryOpen = Boolean(item.id && openHistoryId === item.id);
                const historyEntries = item.id ? gitHistoryById[item.id] : undefined;

                return (
                  <li
                    key={item.id ?? `${item.clientName}-${item.startTime}`}
                    className={`rounded-2xl border bg-white p-4 shadow-xs transition-colors ${
                      isCancelled
                        ? "border-slate-200/80 opacity-85"
                        : "border-slate-200 hover:border-teal-300"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {/* Venstre: Kalenderbadge + metadata */}
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div
                          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-center ${
                            isCancelled
                              ? "border-slate-200 bg-slate-100 text-slate-500"
                              : "border-teal-200 bg-teal-50 text-teal-900"
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                            {dateParts.monthShort}
                          </span>
                          <span className="text-lg font-extrabold leading-tight">
                            {dateParts.dayNumber}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.clientName ? (
                              <>
                                <strong className="text-sm font-bold text-slate-900">
                                  {item.clientName}
                                </strong>
                                {item.title && (
                                  <span className="text-sm text-slate-600">
                                    — {item.title}
                                  </span>
                                )}
                              </>
                            ) : (
                              <strong className="text-sm font-bold text-slate-900">
                                {item.title || copy.fallbackCardTitle}
                              </strong>
                            )}
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.badgeClass}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                              <i className="bi bi-clock" aria-hidden="true" />
                              {dateParts.weekdayShort ? `${dateParts.weekdayShort} ` : ""}
                              {dateParts.fullDate} · {dateParts.timeRange}
                            </span>
                            {item.therapistName && (
                              <span className="inline-flex items-center gap-1">
                                <i className="bi bi-person-badge" aria-hidden="true" />
                                {item.therapistName}
                              </span>
                            )}
                            {item.organisationName && (
                              <span className="inline-flex items-center gap-1">
                                <i className="bi bi-building" aria-hidden="true" />
                                {item.organisationName}
                              </span>
                            )}
                            {item.location && (
                              <span className="inline-flex items-center gap-1">
                                <i className="bi bi-geo-alt" aria-hidden="true" />
                                {item.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Højre: Handlingspiller */}
                      {item.id && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleGitHistory(item.id!)}
                            data-testid={`git-history-btn-${item.id}`}
                            className={`min-h-11 inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                              isHistoryOpen
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <i className="bi bi-clock-history" aria-hidden="true" />
                            {copy.historyBtn}
                          </button>

                          {!isCancelled && (
                            <button
                              type="button"
                              onClick={() =>
                                isRescheduling
                                  ? setRescheduleId(null)
                                  : startReschedule(item)
                              }
                              data-testid={`reschedule-btn-${item.id}`}
                              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 px-3.5 py-2 text-xs font-semibold transition-colors"
                            >
                              <i className="bi bi-calendar-event" aria-hidden="true" />
                              {copy.rescheduleBtn}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setPendingCancelAppointment(item)}
                            data-testid={`delete-booking-${item.id}`}
                            className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3.5 py-2 text-xs font-semibold transition-colors"
                          >
                            <i className="bi bi-x-circle" aria-hidden="true" />
                            {copy.cancelBtn}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Ombookning med custom kalender & Timefold-slots */}
                    {isRescheduling && item.id && (
                      <div
                        className="mt-3 pt-3 border-t border-slate-100 space-y-3"
                        data-testid={`reschedule-panel-${item.id}`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <div className="md:col-span-5">
                            <BookingCalendarGrid
                              selectedDate={rescheduleDate}
                              onSelectDate={(iso) => setRescheduleDate(iso)}
                              locale={locale}
                              copy={copy}
                              minDate={getTodayIsoDate()}
                              allowClosedDays={isProviderPortal && includeOutsideHours}
                              compact
                              testId={`reschedule-calendar-${item.id}`}
                            />
                          </div>
                          <div className="md:col-span-7 space-y-2.5">
                            {hasLiveUuid && rescheduleSlotsLoading ? (
                              <p className="text-xs text-slate-500 m-0">
                                {copy.loadingSlots}
                              </p>
                            ) : rescheduleSlots?.slots &&
                              rescheduleSlots.slots.length > 0 ? (
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                {rescheduleSlots.slots.map((slot, sIdx) => {
                                  const sLocal = toDateTimeLocalInput(slot.startTime);
                                  const sClock = sLocal.slice(11, 16) || slot.slot;
                                  const okSlot =
                                    slot.available !== false &&
                                    !slot.overlaps &&
                                    !slot.inPast;
                                  const activePick = rescheduleStart === sLocal;
                                  return (
                                    <button
                                      key={`${sLocal}-${sIdx}`}
                                      type="button"
                                      disabled={!okSlot}
                                      onClick={() => {
                                        setRescheduleStart(sLocal);
                                        setRescheduleEnd(
                                          addMinutesToIsoLocal(sLocal, rescheduleDuration) ||
                                            toDateTimeLocalInput(slot.endTime)
                                        );
                                      }}
                                      data-testid={`reschedule-slot-${item.id}-${sClock}`}
                                      className={`min-h-10 rounded-xl border px-2 py-1 text-xs font-semibold transition-colors ${
                                        activePick
                                          ? "border-teal-700 bg-teal-700 text-white"
                                          : !okSlot
                                            ? "border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed"
                                            : "border-slate-200 bg-white text-slate-800 hover:border-teal-500 hover:bg-teal-50"
                                      }`}
                                    >
                                      {sClock}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-end gap-2">
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-semibold text-slate-600">
                                  {copy.newStartLabel}
                                </span>
                                <span className="min-h-10 inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800">
                                  {rescheduleStart
                                    ? `${formatIsoDateHuman(rescheduleStart.slice(0, 10), locale)} · ${rescheduleStart.slice(11, 16)}`
                                    : "--:--"}
                                </span>
                                <input
                                  type="text"
                                  value={rescheduleStart}
                                  onChange={(e) => setRescheduleStart(e.target.value)}
                                  data-testid={`reschedule-start-${item.id}`}
                                  aria-label={copy.newStartLabel}
                                  tabIndex={-1}
                                  className="sr-only"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-semibold text-slate-600">
                                  {copy.newEndLabel}
                                </span>
                                <span className="min-h-10 inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                  {rescheduleEnd
                                    ? `${formatIsoDateHuman(rescheduleEnd.slice(0, 10), locale)} · ${rescheduleEnd.slice(11, 16)}`
                                    : "--:--"}
                                </span>
                                <input
                                  type="text"
                                  value={rescheduleEnd}
                                  onChange={(e) => setRescheduleEnd(e.target.value)}
                                  data-testid={`reschedule-end-${item.id}`}
                                  aria-label={copy.newEndLabel}
                                  tabIndex={-1}
                                  className="sr-only"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => void handleSaveReschedule(item)}
                                data-testid={`reschedule-save-${item.id}`}
                                className="min-h-11 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 text-xs font-semibold"
                              >
                                {copy.saveNewTimeBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRescheduleId(null)}
                                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                {copy.cancelRescheduleBtn}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Ændringshistorik (teknisk SHA gemt i diskret sammenklappelig detalje for behandlere) */}
                    {isHistoryOpen && item.id && (
                      <div
                        className="mt-3 pt-3 border-t border-slate-100 space-y-2"
                        data-testid={`git-history-panel-${item.id}`}
                      >
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <i className="bi bi-clock-history" aria-hidden="true" />
                          {copy.gitHistoryTitle}
                        </div>
                        {historyLoadingId === item.id && (
                          <p className="text-xs text-slate-500 m-0">
                            {copy.loadingHistory}
                          </p>
                        )}
                        {historyLoadingId !== item.id &&
                          (!historyEntries || historyEntries.length === 0) && (
                            <p className="text-xs text-slate-500 m-0">
                              {copy.emptyHistory}
                            </p>
                          )}
                        {historyEntries && historyEntries.length > 0 && (
                          <>
                            <ul className="space-y-1.5">
                              {historyEntries.map((commit) => (
                                <li
                                  key={commit.commitHash}
                                  className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                                >
                                  <span className="font-medium text-slate-800">
                                    {commit.message}
                                  </span>
                                  <span className="text-slate-500">
                                    {commit.author} · {commit.timestamp}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {!isClientMode && (
                              <details
                                data-testid={`technical-audit-history-${item.id}`}
                                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600"
                              >
                                <summary className="cursor-pointer font-semibold text-slate-700 select-none">
                                  {copy.technicalAuditSummary}
                                </summary>
                                <ul className="mt-2 space-y-1">
                                  {historyEntries.map((commit) => (
                                    <li
                                      key={`sha-${commit.commitHash}`}
                                      className="flex items-center gap-2 font-mono text-[11px]"
                                    >
                                      <code className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-800">
                                        {commit.commitHash.slice(0, 8)}
                                      </code>
                                      <span className="font-sans text-slate-500">
                                        {commit.timestamp}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 pt-2"
                data-testid="booking-pagination"
              >
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  data-testid="booking-prev-page"
                  className="min-h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  {copy.paginationPrev}
                </button>
                <span className="text-xs font-medium text-slate-600">
                  {copy.paginationPageLabel} {safePage} {copy.paginationOfLabel}{" "}
                  {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  data-testid="booking-next-page"
                  className="min-h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  {copy.paginationNext}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const BookingFeatureView = AppointmentFeatureView;

// ============================================================================
// 4. PURE WEEKLY SCHEDULE DOMAIN LOGIC (Arbejdstider, Pauser & Timefold-vinduer)
// ============================================================================

export interface TimeInterval {
  id: string;
  start: string;
  end: string;
  isOnlineOnly?: boolean;
}

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DaySchedule {
  day: WeekdayKey;
  labelDa: string;
  labelEn: string;
  enabled: boolean;
  intervals: TimeInterval[];
}

export interface BreakInfo {
  start: string;
  end: string;
  durationMinutes: number;
}

export interface WeeklyScheduleConfig {
  version: 1;
  overallWindow: string;
  summaryText: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  days: DaySchedule[];
}

export const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_LABELS: Record<
  WeekdayKey,
  { da: string; en: string; shortDa: string; shortEn: string }
> = {
  monday: { da: "Mandag", en: "Monday", shortDa: "Man", shortEn: "Mon" },
  tuesday: { da: "Tirsdag", en: "Tuesday", shortDa: "Tir", shortEn: "Tue" },
  wednesday: { da: "Onsdag", en: "Wednesday", shortDa: "Ons", shortEn: "Wed" },
  thursday: { da: "Torsdag", en: "Thursday", shortDa: "Tor", shortEn: "Thu" },
  friday: { da: "Fredag", en: "Friday", shortDa: "Fre", shortEn: "Fri" },
  saturday: { da: "Lørdag", en: "Saturday", shortDa: "Lør", shortEn: "Sat" },
  sunday: { da: "Søndag", en: "Sunday", shortDa: "Søn", shortEn: "Sun" },
};

/**
 * Afrunder et HH:mm klokkeslæt til nærmeste 5-minutters interval (00:00 – 23:55).
 * Bruges til at normalisere terapeutens arbejdstidsintervaller.
 */
export function roundTo5Min(timeStr: string): string {
  if (!timeStr || !timeStr.includes(":")) return "09:00";
  const parts = timeStr.split(":");
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(h)) h = 9;
  if (isNaN(m)) m = 0;

  m = Math.round(m / 5) * 5;
  if (m >= 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Konverterer et HH:mm klokkeslæt til minutter siden midnat (0 – 1440).
 */
export function timeToMinutes(timeStr: string, isEnd: boolean = false): number {
  if (!timeStr || !timeStr.includes(":")) return 0;
  if (timeStr === "24:00") return 1440;
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0);
  if (isEnd && (total === 0 || timeStr === "00:00")) {
    return 1440;
  }
  return total;
}

/**
 * Konverterer minutter siden midnat tilbage til strengformatet HH:mm.
 */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, minutes));
  if (clamped === 1440) return "00:00";
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Formatterer et antal minutter til læsbar dansk eller engelsk tekst (fx "7t 15m").
 */
export function formatMinutes(
  totalMinutes: number,
  isEn: boolean = false
): string {
  if (totalMinutes <= 0) return isEn ? "0 hrs" : "0 timer";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return isEn ? `${h} hrs` : `${h} timer`;
  return isEn ? `${h}h ${m}m` : `${h}t ${m}m`;
}

/**
 * Beregner indlagte pauser (f.eks. frokostpause) som huller >= 5 min mellem en dags arbejdsintervaller.
 */
export function getBreaksForDay(day: DaySchedule): BreakInfo[] {
  if (!day.enabled || !day.intervals || day.intervals.length < 2) return [];

  const sorted = [...day.intervals].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)
  );
  const breaks: BreakInfo[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEndM = timeToMinutes(sorted[i].end, true);
    const nextStartM = timeToMinutes(sorted[i + 1].start);
    if (nextStartM > currentEndM) {
      const duration = nextStartM - currentEndM;
      if (duration >= 5) {
        breaks.push({
          start: sorted[i].end,
          end: sorted[i + 1].start,
          durationMinutes: duration,
        });
      }
    }
  }

  return breaks;
}

/**
 * Undersøger om et ønsket booking-tidspunkt kolliderer med en af terapeutens pauser.
 */
export function checkCollisionWithBreak(
  day: DaySchedule | null | undefined,
  timeSlot: string,
  durationMinutes: number = 45
): { collides: boolean; breakInfo?: BreakInfo } {
  if (!day || !day.enabled) return { collides: false };
  const slotStartM = timeToMinutes(timeSlot);
  const slotEndM = slotStartM + durationMinutes;

  const breaks = getBreaksForDay(day);
  for (const b of breaks) {
    const bStartM = timeToMinutes(b.start);
    const bEndM = timeToMinutes(b.end, true);
    if (slotStartM < bEndM && slotEndM > bStartM) {
      return { collides: true, breakInfo: b };
    }
  }
  return { collides: false };
}

const JS_DAY_TO_KEY: Record<number, WeekdayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

/**
 * Returnerer true hvis klinikken holder lukket på den angivne dato.
 */
export function isDayClosed(
  schedule: WeeklyScheduleConfig | null | undefined,
  dateOrStr: Date | string
): boolean {
  if (!schedule || !schedule.days) return false;
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  const key = JS_DAY_TO_KEY[d.getDay()];
  const daySched = schedule.days.find((ds) => ds.day === key);
  return !daySched || !daySched.enabled || daySched.intervals.length === 0;
}

/**
 * Finder dagens arbejdsskema for en given dato ("YYYY-MM-DD" eller Date).
 */
export function getScheduleForDate(
  schedule: WeeklyScheduleConfig | null | undefined,
  dateOrStr: Date | string
): DaySchedule | null {
  if (!schedule || !schedule.days) return null;
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  const key = JS_DAY_TO_KEY[d.getDay()];
  return schedule.days.find((ds) => ds.day === key) || null;
}

/**
 * Genberegner ugentlig arbejdstid, pausetid, ydre tidsvindue (til Timefold) og opsummeringstekst.
 */
export function recomputeSchedule(
  config: WeeklyScheduleConfig
): WeeklyScheduleConfig {
  let totalWorkM = 0;
  let totalBreakM = 0;
  let minStartM = 24 * 60;
  let maxEndM = 0;
  const summaryParts: string[] = [];

  const days = config.days.map((day) => {
    if (!day.enabled || !day.intervals || day.intervals.length === 0) {
      return { ...day, intervals: [] };
    }

    const sorted = [...day.intervals]
      .filter((int) => timeToMinutes(int.end, true) > timeToMinutes(int.start))
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    for (const int of sorted) {
      const sM = timeToMinutes(int.start);
      const eM = timeToMinutes(int.end, true);
      totalWorkM += Math.max(0, eM - sM);
      if (sM < minStartM) minStartM = sM;
      if (eM > maxEndM) maxEndM = eM;
    }

    for (const b of getBreaksForDay({ ...day, intervals: sorted })) {
      totalBreakM += b.durationMinutes;
    }

    const intervalTexts = sorted
      .map((int) => `${int.start} - ${int.end}`)
      .join(", ");
    summaryParts.push(`${day.labelDa}: ${intervalTexts}`);

    return { ...day, intervals: sorted };
  });

  const overallStart = minStartM < 24 * 60 ? minutesToTime(minStartM) : "08:30";
  const overallEnd = maxEndM > 0 ? minutesToTime(maxEndM) : "16:00";
  const overallWindow = `${overallStart} - ${overallEnd}`;

  const enabledCount = days.filter(
    (d) => d.enabled && d.intervals.length > 0
  ).length;
  let summaryText = summaryParts.join(" | ");
  if (
    enabledCount === 5 &&
    days.slice(0, 5).every((d) => d.enabled && d.intervals.length > 0)
  ) {
    const firstMon = days[0].intervals
      .map((i) => `${i.start}-${i.end}`)
      .join(",");
    const allMatch = days
      .slice(1, 5)
      .every(
        (d) =>
          d.intervals.map((i) => `${i.start}-${i.end}`).join(",") === firstMon
      );
    if (allMatch) {
      const intTxt = days[0].intervals
        .map((i) => `${i.start} - ${i.end}`)
        .join(", ");
      summaryText = `Mandag - Fredag: ${intTxt} | Weekend: Lukket`;
    }
  }

  return {
    version: 1,
    overallWindow,
    summaryText: summaryText || `${overallWindow} (Alle hverdage)`,
    totalWorkMinutes: totalWorkM,
    totalBreakMinutes: totalBreakM,
    days,
  };
}

/**
 * Bygger standard-arbejdsskema (Mandag–Fredag 08:30–12:00 & 12:45–16:00, Weekend lukket).
 */
export function getDefaultWeeklySchedule(): WeeklyScheduleConfig {
  const defaultIntervals: TimeInterval[] = [
    { id: "int-1", start: "08:30", end: "12:00" },
    { id: "int-2", start: "12:45", end: "16:00" },
  ];

  const days: DaySchedule[] = WEEKDAY_ORDER.map((key) => ({
    day: key,
    labelDa: WEEKDAY_LABELS[key].da,
    labelEn: WEEKDAY_LABELS[key].en,
    enabled: key !== "saturday" && key !== "sunday",
    intervals:
      key !== "saturday" && key !== "sunday"
        ? defaultIntervals.map((i) => ({ ...i, id: `${key}-${i.id}` }))
        : [],
  }));

  return recomputeSchedule({
    version: 1,
    overallWindow: "08:30 - 16:00",
    summaryText:
      "Mandag - Fredag: 08:30 - 12:00, 12:45 - 16:00 | Weekend: Lukket",
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    days,
  });
}

function applyWindowToWeekdays(start: string, end: string): WeeklyScheduleConfig {
  const sched = getDefaultWeeklySchedule();
  sched.days = sched.days.map((d) => {
    if (d.day === "saturday" || d.day === "sunday") {
      return { ...d, enabled: false, intervals: [] };
    }
    return {
      ...d,
      enabled: true,
      intervals: [{ id: `${d.day}-int-1`, start, end }],
    };
  });
  return recomputeSchedule(sched);
}

/**
 * Parser enten et JSON-gemt ugeskema eller en fritekst-arbejdstid (fx "09:00 - 17:00")
 * til en fuldt valideret `WeeklyScheduleConfig`.
 */
export function parseWeeklySchedule(
  input: string | null | undefined
): WeeklyScheduleConfig {
  if (!input || !input.trim()) {
    return getDefaultWeeklySchedule();
  }
  const trimmed = input.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed.version === 1 &&
        Array.isArray(parsed.days) &&
        parsed.days.length === 7
      ) {
        return recomputeSchedule(parsed);
      }
      const match = trimmed.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (match) {
        return applyWindowToWeekdays(roundTo5Min(match[1]), roundTo5Min(match[2]));
      }
    } catch {
      // Fortsæt til tekst-baseret fallback nedenfor
    }
  }

  const textMatch = trimmed.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (textMatch) {
    return applyWindowToWeekdays(
      roundTo5Min(textMatch[1]),
      roundTo5Min(textMatch[2])
    );
  }

  return getDefaultWeeklySchedule();
}

/**
 * Serialiserer et genberegnet ugeskema til JSON til lagring på `ProviderProfile.workingHoursJson`.
 */
export function serializeWeeklySchedule(config: WeeklyScheduleConfig): string {
  return JSON.stringify(recomputeSchedule(config));
}

export default AppointmentFeatureView;
