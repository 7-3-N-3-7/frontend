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

import React, { useState } from "react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
} from "../../core/baseDomainCore";
import { ProblemAlert, useBaseCrud } from "../../core/baseUiCore";

// ============================================================================
// 1. DTO CONTRACTS & DOMAIN TYPES (1:1 med AppointmentFeature.java)
// ============================================================================

export type AppointmentStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface AppointmentDto extends HasId<string> {
  id?: string;
  clientId?: string;
  therapistId?: string;
  clientName: string;
  therapistName?: string;
  title?: string;
  notes?: string;
  status?: AppointmentStatus;
  startTime: string;
  endTime?: string;
  gitCommitHash?: string;
}

export interface TimefoldSlotSuggestionDto {
  startTime: string;
  endTime: string;
  therapistId?: string;
  score?: string;
}

export interface AppointmentGitCommitDto {
  commitHash: string;
  fullHash?: string;
  author: string;
  timestamp: string;
  message: string;
  snapshot: string;
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

  protected override validateBeforeCreate(dto: Partial<AppointmentDto>): void {
    DomainGuard.requireNotBlank(dto.clientName, "Client name", "clientName");
    DomainGuard.requireNotBlank(dto.startTime, "Start time", "startTime");
    if (dto.startTime && dto.endTime) {
      const startMs = Date.parse(dto.startTime);
      const endMs = Date.parse(dto.endTime);
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
}

const appointmentApi = new AppointmentApiService();

// ============================================================================
// 3. EXPORTED FEATURE VIEW (Præsentationslag koblet via useBaseCrud)
// ============================================================================

export const AppointmentFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(appointmentApi);
  const [clientName, setClientName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      clientName,
      startTime,
      endTime: endTime || undefined,
      title: title || "Klinisk konsultation",
      status: "SCHEDULED",
    });
    if (created) {
      setClientName("");
      setStartTime("");
      setEndTime("");
      setTitle("");
    }
  };

  return (
    <div
      className="p-4 max-w-4xl mx-auto"
      data-testid="appointment-feature-view"
    >
      <div data-testid="booking-feature-view">
        <h2 className="text-xl font-bold mb-4">Appointments &amp; Bookings</h2>

        <ProblemAlert error={error} onDismiss={clearError} />

        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Client Name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-clientName"
          />
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-startTime"
          />
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-endTime"
          />
          <input
            type="text"
            placeholder="Session Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-title"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            data-testid="submit-booking"
          >
            Book Appointment
          </button>
        </form>

        {loading && <p data-testid="loading-indicator">Loading...</p>}

        <ul className="space-y-2" data-testid="booking-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="border p-3 rounded flex justify-between items-center"
            >
              <div>
                <strong>{item.clientName}</strong> — {item.startTime}{" "}
                <span className="text-sm text-gray-500">
                  ({item.status || "SCHEDULED"})
                </span>
              </div>
              <button
                type="button"
                onClick={() => item.id && remove(item.id)}
                className="text-red-600 hover:underline"
                data-testid={`delete-booking-${item.id}`}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
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
