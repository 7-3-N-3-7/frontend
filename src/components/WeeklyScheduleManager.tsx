"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocale } from "next-intl";

export interface TimeInterval {
  id: string;
  start: string; // HH:mm, 5-min increments
  end: string;   // HH:mm, 5-min increments
  isOnlineOnly?: boolean; // When true: slot is online-only
}

export type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

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
  overallWindow: string; // e.g. "08:30 - 16:00" for Timefold regex
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

export const WEEKDAY_LABELS: Record<WeekdayKey, { da: string; en: string; shortDa: string; shortEn: string }> = {
  monday: { da: "Mandag", en: "Monday", shortDa: "Man", shortEn: "Mon" },
  tuesday: { da: "Tirsdag", en: "Tuesday", shortDa: "Tir", shortEn: "Tue" },
  wednesday: { da: "Onsdag", en: "Wednesday", shortDa: "Ons", shortEn: "Wed" },
  thursday: { da: "Torsdag", en: "Thursday", shortDa: "Tor", shortEn: "Thu" },
  friday: { da: "Fredag", en: "Friday", shortDa: "Fre", shortEn: "Fri" },
  saturday: { da: "Lørdag", en: "Saturday", shortDa: "Lør", shortEn: "Sat" },
  sunday: { da: "Søndag", en: "Sunday", shortDa: "Søn", shortEn: "Sun" },
};

/**
 * Snaps any HH:mm time string to the nearest 5-minute interval (min: 00:00, max: 23:55).
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

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, minutes));
  if (clamped === 1440) return "00:00";
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatMinutes(totalMinutes: number, isEn: boolean = false): string {
  if (totalMinutes <= 0) return isEn ? "0 hrs" : "0 timer";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return isEn ? `${h} hrs` : `${h} timer`;
  return isEn ? `${h}h ${m}m` : `${h}t ${m}m`;
}

/**
 * Calculates designated breaks (gaps between active intervals) for a day.
 */
export function getBreaksForDay(day: DaySchedule): BreakInfo[] {
  if (!day.enabled || !day.intervals || day.intervals.length < 2) return [];

  const sorted = [...day.intervals].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
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
 * Check if a specific time slot collides with a designated break for a day.
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

/**
 * Check if a date string ("YYYY-MM-DD") falls on a closed day.
 */
export function isDayClosed(schedule: WeeklyScheduleConfig | null | undefined, dateOrStr: Date | string): boolean {
  if (!schedule || !schedule.days) return false;
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  const jsDay = d.getDay();
  const map: Record<number, WeekdayKey> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  const key = map[jsDay];
  const daySched = schedule.days.find((ds) => ds.day === key);
  return !daySched || !daySched.enabled || daySched.intervals.length === 0;
}

/**
 * Gets day schedule for a given date ("YYYY-MM-DD" or Date).
 */
export function getScheduleForDate(
  schedule: WeeklyScheduleConfig | null | undefined,
  dateOrStr: Date | string
): DaySchedule | null {
  if (!schedule || !schedule.days) return null;
  const d = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  const jsDay = d.getDay();
  const map: Record<number, WeekdayKey> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  const key = map[jsDay];
  return schedule.days.find((ds) => ds.day === key) || null;
}

/**
 * Recomputes totals, overall window, and human-readable summary text.
 */
export function recomputeSchedule(config: WeeklyScheduleConfig): WeeklyScheduleConfig {
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

    const breaks = getBreaksForDay({ ...day, intervals: sorted });
    for (const b of breaks) {
      totalBreakM += b.durationMinutes;
    }

    const intervalTexts = sorted.map((int) => `${int.start} - ${int.end}`).join(", ");
    summaryParts.push(`${day.labelDa}: ${intervalTexts}`);

    return { ...day, intervals: sorted };
  });

  const overallStart = minStartM < 24 * 60 ? minutesToTime(minStartM) : "08:30";
  const overallEnd = maxEndM > 0 ? minutesToTime(maxEndM) : "16:00";
  const overallWindow = `${overallStart} - ${overallEnd}`;

  const enabledCount = days.filter((d) => d.enabled && d.intervals.length > 0).length;
  let summaryText = summaryParts.join(" | ");
  if (enabledCount === 5 && days.slice(0, 5).every((d) => d.enabled && d.intervals.length > 0)) {
    const firstMon = days[0].intervals.map((i) => `${i.start}-${i.end}`).join(",");
    const allMatch = days.slice(1, 5).every((d) => d.intervals.map((i) => `${i.start}-${i.end}`).join(",") === firstMon);
    if (allMatch) {
      const intTxt = days[0].intervals.map((i) => `${i.start} - ${i.end}`).join(", ");
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
    summaryText: "Mandag - Fredag: 08:30 - 12:00, 12:45 - 16:00 | Weekend: Lukket",
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    days,
  });
}

export function parseWeeklySchedule(input: string | null | undefined): WeeklyScheduleConfig {
  if (!input || !input.trim()) {
    return getDefaultWeeklySchedule();
  }
  const trimmed = input.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.version === 1 && Array.isArray(parsed.days) && parsed.days.length === 7) {
        return recomputeSchedule(parsed);
      }
      const match = trimmed.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (match) {
        const start = roundTo5Min(match[1]);
        const end = roundTo5Min(match[2]);
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
    } catch {
      // Fall through
    }
  }

  const textMatch = trimmed.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (textMatch) {
    const start = roundTo5Min(textMatch[1]);
    const end = roundTo5Min(textMatch[2]);
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

  return getDefaultWeeklySchedule();
}

export function serializeWeeklySchedule(config: WeeklyScheduleConfig): string {
  const updated = recomputeSchedule(config);
  return JSON.stringify(updated);
}

interface WeeklyScheduleManagerProps {
  value: string;
  onChange: (val: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export default function WeeklyScheduleManager({
  value,
  onChange,
  onSave,
  isSaving = false,
}: WeeklyScheduleManagerProps) {
  const locale = useLocale();
  const isEn = String(locale || "").toLowerCase().startsWith("en");
  const loc = useCallback((da: string, en: string) => (isEn ? en : da), [isEn]);

  const [schedule, setSchedule] = useState<WeeklyScheduleConfig>(() => parseWeeklySchedule(value));
  const [copiedSuccessDay, setCopiedSuccessDay] = useState<string | null>(null);

  // Active Selected Interval for precision detail editing
  const [selectedIntervalInfo, setSelectedIntervalInfo] = useState<{
    dayKey: WeekdayKey;
    intervalId: string;
  } | null>(null);

  // Interaction Mode: 1) "move" (Move blocks) 2) "create" (Draw new blocks) 3) "edit" (Fine-tune, resize & delete)
  const [interactionMode, setInteractionMode] = useState<"move" | "create" | "edit">("move");
  const [hoverTimeInfo, setHoverTimeInfo] = useState<{
    dayKey: WeekdayKey;
    minutes: number;
  } | null>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      try {
        const parsed = parseWeeklySchedule(value);
        setSchedule(parsed);
      } catch {
        // ignore
      }
    }
  }, [value]);

  const updateSchedule = useCallback(
    (newConfig: WeeklyScheduleConfig) => {
      const computed = recomputeSchedule(newConfig);
      setSchedule(computed);
      onChange(serializeWeeklySchedule(computed));
    },
    [onChange]
  );

  // Full 24-hour timeline range: 00:00 to 00:00 (1440 minutes span)
  const minTimelineHour = 0;
  const maxTimelineHour = 24;
  const totalTimelineMinutes = 1440;
  const MAX_SELECTABLE_MINUTES = 24 * 60; // 00:00 midnight (1440 min)

  // Hours ticks for ruler (0 to 24)
  const timelineHours = useMemo(() => {
    const list: number[] = [];
    for (let h = 0; h <= 24; h++) {
      list.push(h);
    }
    return list;
  }, []);

  // Drag state management (with Ref for synchronous tracking)
  const [dragState, setDragState] = useState<{
    type: "create" | "move" | "resize-start" | "resize-end";
    dayKey: WeekdayKey; // Source day
    targetDayKey?: WeekdayKey; // Target day when moving across days
    interval?: TimeInterval; // The full interval object being moved
    intervalId?: string;
    initialStartM: number;
    initialEndM: number;
    pointerStartM: number;
    currentStartM: number;
    currentEndM: number;
    hasMoved: boolean;
  } | null>(null);

  const dragRef = useRef<{
    type: "create" | "move" | "resize-start" | "resize-end";
    dayKey: WeekdayKey;
    targetDayKey?: WeekdayKey;
    interval?: TimeInterval;
    intervalId?: string;
    initialStartM: number;
    initialEndM: number;
    pointerStartM: number;
    currentStartM: number;
    currentEndM: number;
    hasMoved: boolean;
  } | null>(null);

  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Helper to convert clientX to snapped 5-minute minutes (00:00 to 23:55 / 1440)
  const getMinutesFromClientX = useCallback(
    (clientX: number, dayKey: WeekdayKey): number => {
      const el = laneRefs.current[dayKey];
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = relX / rect.width;
      const rawM = ratio * 1440;
      // Snap to 5 minutes
      const snapped = Math.round(rawM / 5) * 5;
      return Math.max(0, Math.min(MAX_SELECTABLE_MINUTES, snapped));
    },
    []
  );

  // Global Pointer Events for Drag & Drop
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      // Check which day lane the pointer is currently hovering over (if any)
      let hoveredDayKey: WeekdayKey | null = null;
      const elUnderPointer = document.elementFromPoint(e.clientX, e.clientY);
      const laneEl = elUnderPointer?.closest("[data-lane-day]");
      if (laneEl) {
        const foundDay = laneEl.getAttribute("data-lane-day") as WeekdayKey;
        if (foundDay && WEEKDAY_ORDER.includes(foundDay)) {
          hoveredDayKey = foundDay;
        }
      }

      // Fallback: check vertical bounds of lane refs if elementFromPoint hits an overlay
      if (!hoveredDayKey && cur.type === "move") {
        for (const k of WEEKDAY_ORDER) {
          const lRef = laneRefs.current[k];
          if (lRef) {
            const r = lRef.getBoundingClientRect();
            if (e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
              hoveredDayKey = k;
              break;
            }
          }
        }
      }

      const activeDayKey = (cur.type === "move" && hoveredDayKey) ? hoveredDayKey : cur.dayKey;
      if (cur.type === "move") {
        cur.targetDayKey = activeDayKey;
      }

      const currentM = getMinutesFromClientX(e.clientX, activeDayKey);

      if (cur.type === "create") {
        const sM = Math.min(cur.pointerStartM, currentM);
        const eM = Math.max(cur.pointerStartM, currentM);
        cur.currentStartM = sM;
        cur.currentEndM = eM;
        cur.hasMoved = true;
        setDragState({ ...cur });
      } else if (cur.type === "move") {
        const deltaM = currentM - cur.pointerStartM;
        const duration = cur.initialEndM - cur.initialStartM;
        let newStartM = Math.round((cur.initialStartM + deltaM) / 5) * 5;
        let newEndM = newStartM + duration;

        if (newStartM < 0) {
          newStartM = 0;
          newEndM = newStartM + duration;
        }
        if (newEndM > MAX_SELECTABLE_MINUTES) {
          newEndM = MAX_SELECTABLE_MINUTES;
          newStartM = Math.max(0, newEndM - duration);
        }

        cur.currentStartM = newStartM;
        cur.currentEndM = newEndM;
        if (newStartM !== cur.initialStartM || cur.targetDayKey !== cur.dayKey) {
          cur.hasMoved = true;
        }
        setDragState({ ...cur });
      } else if (cur.type === "resize-start") {
        let newStartM = Math.min(cur.initialEndM - 5, Math.max(0, currentM));
        newStartM = Math.round(newStartM / 5) * 5;
        cur.currentStartM = newStartM;
        cur.hasMoved = true;
        setDragState({ ...cur });
      } else if (cur.type === "resize-end") {
        let newEndM = Math.max(cur.initialStartM + 5, Math.min(MAX_SELECTABLE_MINUTES, currentM));
        newEndM = Math.round(newEndM / 5) * 5;
        cur.currentEndM = newEndM;
        cur.hasMoved = true;
        setDragState({ ...cur });
      }
    };

    const handleGlobalPointerUp = () => {
      const cur = dragRef.current;
      if (!cur) return;
      dragRef.current = null;
      setDragState(null);

      const {
        dayKey,
        targetDayKey = dayKey,
        type,
        interval,
        intervalId,
        currentStartM,
        currentEndM,
        initialStartM,
        initialEndM,
        pointerStartM,
        hasMoved,
      } = cur;

      if (type === "create") {
        let startM = currentStartM;
        let endM = currentEndM;
        // If single click without drag, create a default 2-hour slot
        if (!hasMoved || endM - startM < 15) {
          startM = pointerStartM;
          if (startM >= MAX_SELECTABLE_MINUTES - 30) {
            startM = Math.max(0, MAX_SELECTABLE_MINUTES - 120);
            endM = MAX_SELECTABLE_MINUTES;
          } else {
            endM = Math.min(MAX_SELECTABLE_MINUTES, startM + 120);
          }
        }

        if (endM > startM) {
          const newId = `${dayKey}-int-${Date.now()}`;
          const updatedDays = schedule.days.map((d) => {
            if (d.day !== dayKey) return d;
            return {
              ...d,
              enabled: true,
              intervals: [
                ...d.intervals,
                { id: newId, start: minutesToTime(startM), end: minutesToTime(endM) },
              ],
            };
          });
          updateSchedule({ ...schedule, days: updatedDays });
          setSelectedIntervalInfo({ dayKey, intervalId: newId });
        }
      } else if (type === "move") {
        const isCrossDay = targetDayKey !== dayKey;
        const hasTimeChanged = currentStartM !== initialStartM || currentEndM !== initialEndM;

        if ((hasTimeChanged || isCrossDay) && intervalId && currentEndM > currentStartM) {
          if (isCrossDay) {
            // Remove from source day, add to target day (and ensure target day is enabled)
            const newId = `${targetDayKey}-int-${Date.now()}`;
            const targetInterval: TimeInterval = {
              ...(interval || { id: intervalId }),
              id: newId,
              start: minutesToTime(currentStartM),
              end: minutesToTime(currentEndM),
            };

            const updatedDays = schedule.days.map((d) => {
              if (d.day === dayKey) {
                return {
                  ...d,
                  intervals: d.intervals.filter((int) => int.id !== intervalId),
                };
              }
              if (d.day === targetDayKey) {
                return {
                  ...d,
                  enabled: true, // Automatically open day when dragging work onto it
                  intervals: [...d.intervals, targetInterval],
                };
              }
              return d;
            });

            updateSchedule({ ...schedule, days: updatedDays });
            setSelectedIntervalInfo({ dayKey: targetDayKey, intervalId: newId });
          } else {
            // Same-day move
            const updatedDays = schedule.days.map((d) => {
              if (d.day !== dayKey) return d;
              const updated = d.intervals.map((int) => {
                if (int.id !== intervalId) return int;
                return {
                  ...int,
                  start: minutesToTime(currentStartM),
                  end: minutesToTime(currentEndM),
                };
              });
              return { ...d, intervals: updated };
            });
            updateSchedule({ ...schedule, days: updatedDays });
          }
        }
      } else if (type === "resize-start" || type === "resize-end") {
        const hasChanged = currentStartM !== initialStartM || currentEndM !== initialEndM;
        if (hasChanged && intervalId && currentEndM > currentStartM) {
          const updatedDays = schedule.days.map((d) => {
            if (d.day !== dayKey) return d;
            const updated = d.intervals.map((int) => {
              if (int.id !== intervalId) return int;
              return {
                ...int,
                start: minutesToTime(currentStartM),
                end: minutesToTime(currentEndM),
              };
            });
            return { ...d, intervals: updated };
          });
          updateSchedule({ ...schedule, days: updatedDays });
        }
      }
    };

    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: false });
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, [getMinutesFromClientX, schedule, updateSchedule]);

  // Start creating on lane empty space (Only in create mode)
  const handleLanePointerDown = (e: React.PointerEvent, dayKey: WeekdayKey) => {
    // Left mouse click only
    if (e.button !== 0) return;
    if (interactionMode !== "create") {
      // In view mode, clicking on empty lane does not create an accidental slot
      return;
    }
    e.preventDefault();
    const startM = getMinutesFromClientX(e.clientX, dayKey);
    const newState = {
      type: "create" as const,
      dayKey,
      targetDayKey: dayKey,
      initialStartM: startM,
      initialEndM: startM,
      pointerStartM: startM,
      currentStartM: startM,
      currentEndM: startM,
      hasMoved: false,
    };
    dragRef.current = newState;
    setDragState(newState);
  };

  // Start moving interval block (Works smoothly in BOTH view and create modes!)
  const handleBlockPointerDown = (
    e: React.PointerEvent,
    dayKey: WeekdayKey,
    interval: TimeInterval
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Select this block for inspection / editing
    setSelectedIntervalInfo({ dayKey, intervalId: interval.id });

    const pointerM = getMinutesFromClientX(e.clientX, dayKey);
    const startM = timeToMinutes(interval.start);
    const endM = timeToMinutes(interval.end, true);

    const newState = {
      type: "move" as const,
      dayKey,
      targetDayKey: dayKey,
      interval,
      intervalId: interval.id,
      initialStartM: startM,
      initialEndM: endM,
      pointerStartM: pointerM,
      currentStartM: startM,
      currentEndM: endM,
      hasMoved: false,
    };
    dragRef.current = newState;
    setDragState(newState);
  };

  // Start resizing interval block (Works in BOTH view and create modes!)
  const handleResizePointerDown = (
    e: React.PointerEvent,
    dayKey: WeekdayKey,
    interval: TimeInterval,
    edge: "start" | "end"
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setSelectedIntervalInfo({ dayKey, intervalId: interval.id });

    const startM = timeToMinutes(interval.start);
    const endM = timeToMinutes(interval.end, true);
    const pointerM = getMinutesFromClientX(e.clientX, dayKey);

    const newState = {
      type: edge === "start" ? ("resize-start" as const) : ("resize-end" as const),
      dayKey,
      intervalId: interval.id,
      initialStartM: startM,
      initialEndM: endM,
      pointerStartM: pointerM,
      currentStartM: startM,
      currentEndM: endM,
      hasMoved: false,
    };
    dragRef.current = newState;
    setDragState(newState);
  };

  // Toggle Day Open/Closed
  const handleToggleDay = (dayKey: WeekdayKey) => {
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== dayKey) return d;
      const nextEnabled = !d.enabled;
      let nextIntervals = d.intervals;
      if (nextEnabled && nextIntervals.length === 0) {
        nextIntervals = [
          { id: `${dayKey}-int-1`, start: "08:30", end: "12:00" },
          { id: `${dayKey}-int-2`, start: "12:45", end: "16:00" },
        ];
      }
      return { ...d, enabled: nextEnabled, intervals: nextIntervals };
    });
    updateSchedule({ ...schedule, days: updatedDays });
  };

  // Remove interval
  const handleRemoveInterval = (dayKey: WeekdayKey, intervalId: string) => {
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== dayKey) return d;
      const remaining = d.intervals.filter((i) => i.id !== intervalId);
      return {
        ...d,
        intervals: remaining,
        enabled: remaining.length > 0 ? d.enabled : false,
      };
    });
    updateSchedule({ ...schedule, days: updatedDays });
    if (selectedIntervalInfo?.intervalId === intervalId) {
      setSelectedIntervalInfo(null);
    }
  };

  // Copy schedule to all weekdays
  const handleCopyToWeekdays = (sourceDayKey: WeekdayKey) => {
    const sourceDay = schedule.days.find((d) => d.day === sourceDayKey);
    if (!sourceDay) return;

    const weekdays: WeekdayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const updatedDays = schedule.days.map((d) => {
      if (!weekdays.includes(d.day)) return d;
      return {
        ...d,
        enabled: sourceDay.enabled,
        intervals: sourceDay.intervals.map((i, idx) => ({
          ...i,
          id: `${d.day}-int-${idx + 1}`,
        })),
      };
    });

    updateSchedule({ ...schedule, days: updatedDays });
    setCopiedSuccessDay(sourceDayKey);
    setTimeout(() => setCopiedSuccessDay(null), 3500);
  };

  // Selected interval object for popover modal
  const selectedInterval = useMemo(() => {
    if (!selectedIntervalInfo) return null;
    const day = schedule.days.find((d) => d.day === selectedIntervalInfo.dayKey);
    if (!day) return null;
    const int = day.intervals.find((i) => i.id === selectedIntervalInfo.intervalId);
    if (!int) return null;
    return { day, int };
  }, [selectedIntervalInfo, schedule.days]);

  // Update selected interval exact times (with 5-minute precision)
  const handleSelectedIntervalChange = (field: "start" | "end", rawVal: string) => {
    if (!selectedIntervalInfo) return;
    const snapped = roundTo5Min(rawVal);
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== selectedIntervalInfo.dayKey) return d;
      const updatedIntervals = d.intervals.map((i) => {
        if (i.id !== selectedIntervalInfo.intervalId) return i;
        return { ...i, [field]: snapped };
      });
      return { ...d, intervals: updatedIntervals };
    });
    updateSchedule({ ...schedule, days: updatedDays });
  };

  // Toggle Online Only for an interval
  const handleToggleOnlineOnly = (dayKey: WeekdayKey, intervalId: string) => {
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== dayKey) return d;
      const updatedIntervals = d.intervals.map((i) => {
        if (i.id !== intervalId) return i;
        return { ...i, isOnlineOnly: !i.isOnlineOnly };
      });
      return { ...d, intervals: updatedIntervals };
    });
    updateSchedule({ ...schedule, days: updatedDays });
  };

  // Smart slot creation that respects existing intervals and lunch break
  const handleSmartAddSlot = (dayKey: WeekdayKey) => {
    const day = schedule.days.find((d) => d.day === dayKey);
    if (!day) return;

    let start = "08:30";
    let end = "16:00";

    if (day.intervals.length > 0) {
      const sorted = [...day.intervals].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      const last = sorted[sorted.length - 1];
      const lastEndM = timeToMinutes(last.end, true);

      if (lastEndM <= 12 * 60) {
        start = "12:45";
        end = "16:00";
      } else if (lastEndM <= 16 * 60 + 30) {
        start = "17:00";
        end = "21:00";
      } else if (lastEndM <= 21 * 60) {
        start = "21:30";
        end = "00:00";
      } else {
        start = "06:00";
        end = "08:00";
      }
    }

    const newId = `${dayKey}-int-${Date.now()}`;
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== dayKey) return d;
      return {
        ...d,
        enabled: true,
        intervals: [...d.intervals, { id: newId, start, end }],
      };
    });

    updateSchedule({ ...schedule, days: updatedDays });
    setInteractionMode("create");
    setSelectedIntervalInfo({ dayKey, intervalId: newId });
  };

  // Quick preset template adder
  const handleApplyPreset = (start: string, end: string) => {
    const targetDayKey = selectedIntervalInfo?.dayKey || "monday";
    const newId = `${targetDayKey}-int-${Date.now()}`;
    const updatedDays = schedule.days.map((d) => {
      if (d.day !== targetDayKey) return d;
      return {
        ...d,
        enabled: true,
        intervals: [...d.intervals, { id: newId, start, end }],
      };
    });
    updateSchedule({ ...schedule, days: updatedDays });
    setInteractionMode("create");
    setSelectedIntervalInfo({ dayKey: targetDayKey, intervalId: newId });
  };

  const activeDaysCount = useMemo(
    () => schedule.days.filter((d) => d.enabled && d.intervals.length > 0).length,
    [schedule.days]
  );

  return (
    <div className="d-flex flex-column gap-3 user-select-none">
      {/* Live Header Metrics Counter */}
      <div
        className="card border-0 rounded-4 shadow-xs"
        style={{ backgroundColor: "#f0fdfa", border: "1px solid #ccfbf1" }}
      >
        <div className="card-body p-3 p-md-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                style={{ width: "46px", height: "46px", backgroundColor: "#0f766e", color: "#ffffff" }}
              >
                <i className="bi bi-calendar-range fs-4"></i>
              </div>
              <div>
                <h5 className="fw-bold text-dark mb-0">
                  {loc("Ugentlige Arbejdstider & 2D Tidsplan", "Weekly Working Hours & 2D Timeline")}
                </h5>
                <div className="text-muted small">
                  {loc(
                    "Opret, træk og juster dine arbejdstider direkte på ugens tidslinjer (5 min. præcision).",
                    "Create, drag, and resize working slots directly on the weekly timeline (5 min resolution)."
                  )}
                </div>
              </div>
            </div>

            {/* Live Metrics */}
            <div className="d-flex flex-wrap align-items-center gap-2">
              <div className="px-3 py-1.5 rounded-3 bg-white border shadow-2xs d-flex align-items-center gap-2">
                <i className="bi bi-clock text-teal"></i>
                <div className="small">
                  <span className="text-muted">{loc("Arbejdstid", "Work time")}: </span>
                  <strong className="text-dark">
                    {formatMinutes(schedule.totalWorkMinutes, isEn)} / {loc("uge", "week")}
                  </strong>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded-3 bg-white border shadow-2xs d-flex align-items-center gap-2">
                <i className="bi bi-cup-hot" style={{ color: "#d97706" }}></i>
                <div className="small">
                  <span className="text-muted">{loc("Pausetid", "Break time")}: </span>
                  <strong className="text-dark">
                    {formatMinutes(schedule.totalBreakMinutes, isEn)}
                  </strong>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded-3 bg-white border shadow-2xs d-flex align-items-center gap-2">
                <i className="bi bi-calendar-check text-success"></i>
                <div className="small">
                  <span className="text-muted">{loc("Aktive dage", "Active days")}: </span>
                  <strong className="text-dark">
                    {activeDaysCount} {loc("af 7 dage", "of 7 days")}
                  </strong>
                </div>
              </div>

              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaving}
                  className="btn btn-sm rounded-pill px-4 fw-semibold shadow-xs"
                  style={{ backgroundColor: "#0f766e", color: "#ffffff" }}
                >
                  <i className="bi bi-check2-circle me-1"></i>
                  {isSaving ? loc("Gemmer...", "Saving...") : loc("Gem Arbejdstider", "Save Hours")}
                </button>
              )}
            </div>
          </div>

          {copiedSuccessDay && (
            <div className="alert alert-success py-2 px-3 rounded-3 mt-3 mb-0 small d-flex align-items-center gap-2 animate-fade-in">
              <i className="bi bi-check-circle-fill"></i>
              <span>
                {loc(
                  `Tidsblokkene fra ${WEEKDAY_LABELS[copiedSuccessDay as WeekdayKey]?.da || copiedSuccessDay} er kopieret til alle hverdage (Mandag – Fredag)!`,
                  `Schedule from ${WEEKDAY_LABELS[copiedSuccessDay as WeekdayKey]?.en || copiedSuccessDay} was copied to all weekdays (Monday – Friday)!`
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2D Timeline Grid Container */}
      <div className="card rounded-4 border bg-white shadow-xs overflow-hidden">
        {/* Helper Guide Toolbar / Selected Block Quick Editor */}
        <div
          className={`p-2 px-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2.5 transition-all ${
            selectedInterval && (interactionMode === "edit" || interactionMode === "create")
              ? "bg-teal-subtle bg-opacity-25 border-teal-subtle shadow-xs"
              : "bg-light text-muted small"
          }`}
          style={{ minHeight: "52px" }}
        >
          {/* Left: 3-Mode Toggle (1) Move, 2) Create, 3) Edit) + Active Info */}
          <div className="d-flex flex-wrap align-items-center gap-2.5">
            {/* The 3-Mode Toggle */}
            <div className="btn-group p-0.5 bg-white border rounded-pill shadow-2xs" role="group">
              <button
                type="button"
                onClick={() => setInteractionMode("move")}
                className={`btn btn-sm rounded-pill px-3 py-1 fw-bold d-flex align-items-center gap-1.5 transition-all ${
                  interactionMode === "move"
                    ? "btn-teal text-white shadow-xs"
                    : "text-muted hover-bg-light"
                }`}
                style={{
                  fontSize: "0.78rem",
                  backgroundColor: interactionMode === "move" ? "#0f766e" : "transparent",
                  color: interactionMode === "move" ? "#ffffff" : "#475569",
                  borderColor: interactionMode === "move" ? "#0f766e" : "transparent",
                }}
              >
                <i className="bi bi-arrows-move"></i>
                <span>{loc("Flyt", "Move")}</span>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("create")}
                className={`btn btn-sm rounded-pill px-3 py-1 fw-bold d-flex align-items-center gap-1.5 transition-all ${
                  interactionMode === "create"
                    ? "btn-teal text-white shadow-xs"
                    : "text-muted hover-bg-light"
                }`}
                style={{
                  fontSize: "0.78rem",
                  backgroundColor: interactionMode === "create" ? "#0f766e" : "transparent",
                  color: interactionMode === "create" ? "#ffffff" : "#475569",
                  borderColor: interactionMode === "create" ? "#0f766e" : "transparent",
                }}
              >
                <i className="bi bi-plus-circle"></i>
                <span>{loc("Opret", "Create")}</span>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("edit")}
                className={`btn btn-sm rounded-pill px-3 py-1 fw-bold d-flex align-items-center gap-1.5 transition-all ${
                  interactionMode === "edit"
                    ? "btn-teal text-white shadow-xs"
                    : "text-muted hover-bg-light"
                }`}
                style={{
                  fontSize: "0.78rem",
                  backgroundColor: interactionMode === "edit" ? "#0f766e" : "transparent",
                  color: interactionMode === "edit" ? "#ffffff" : "#475569",
                  borderColor: interactionMode === "edit" ? "#0f766e" : "transparent",
                }}
              >
                <i className="bi bi-pencil-square"></i>
                <span>{loc("Redigér", "Edit")}</span>
              </button>
            </div>

            {/* If in Edit Mode and an Interval is Selected */}
            {interactionMode === "edit" && selectedInterval && (
              <div className="d-flex align-items-center gap-2">
                <span
                  className="badge rounded-pill px-3 py-1.5 fw-bold shadow-2xs"
                  style={{ backgroundColor: "#0f766e", color: "#ffffff", fontSize: "0.78rem" }}
                >
                  {isEn ? selectedInterval.day.labelEn : selectedInterval.day.labelDa}
                </span>
                <span className="fw-bold text-dark small">
                  {loc("Redigér Tidsblok (5 min. præcision)", "Edit Time Block (5 min resolution)")}
                </span>
              </div>
            )}

            {/* If in Create Mode and an Interval is Selected */}
            {interactionMode === "create" && selectedInterval && (
              <div className="d-flex align-items-center gap-2">
                <span
                  className="badge rounded-pill px-2.5 py-1 fw-bold shadow-2xs"
                  style={{ backgroundColor: "#0f766e", color: "#ffffff", fontSize: "0.76rem" }}
                >
                  {isEn ? selectedInterval.day.labelEn : selectedInterval.day.labelDa}
                </span>
                <span className="fw-bold text-dark small">
                  {selectedInterval.int.start} – {selectedInterval.int.end}
                </span>
                <button
                  type="button"
                  onClick={() => setInteractionMode("edit")}
                  className="btn btn-sm btn-outline-teal rounded-pill px-2.5 py-0.5 small fw-semibold shadow-2xs"
                  style={{ fontSize: "0.74rem", borderColor: "#0f766e", color: "#0f766e" }}
                >
                  <i className="bi bi-pencil me-1"></i>
                  {loc("Redigér i toolbar", "Edit in toolbar")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIntervalInfo(null)}
                  className="btn btn-sm btn-link text-muted p-0 ms-1"
                  title={loc("Luk", "Close")}
                >
                  <i className="bi bi-x-circle"></i>
                </button>
              </div>
            )}

            {/* If in Move Mode and an Interval is Selected (Inspector view) */}
            {interactionMode === "move" && selectedInterval && (
              <div className="d-flex align-items-center gap-2">
                <span
                  className="badge rounded-pill px-2.5 py-1 fw-bold shadow-2xs"
                  style={{ backgroundColor: "#0f766e", color: "#ffffff", fontSize: "0.76rem" }}
                >
                  {isEn ? selectedInterval.day.labelEn : selectedInterval.day.labelDa}
                </span>
                <span className="fw-bold text-dark small">
                  {selectedInterval.int.start} – {selectedInterval.int.end}
                </span>
                {selectedInterval.int.isOnlineOnly && (
                  <span
                    className="badge rounded-pill bg-info text-white px-2 py-0.5 small fw-semibold shadow-2xs d-inline-flex align-items-center gap-1"
                    style={{ fontSize: "0.72rem" }}
                  >
                    <i className="bi bi-camera-video-fill"></i>
                    <span>{loc("Online kun", "Online only")}</span>
                  </span>
                )}
                <span className="badge bg-white text-dark border px-2 py-0.5 small fw-semibold shadow-2xs">
                  {formatMinutes(
                    Math.max(
                      0,
                      timeToMinutes(selectedInterval.int.end, true) - timeToMinutes(selectedInterval.int.start)
                    ),
                    isEn
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setInteractionMode("edit")}
                  className="btn btn-sm btn-outline-teal rounded-pill px-2.5 py-0.5 small fw-semibold shadow-2xs"
                  style={{ fontSize: "0.74rem", borderColor: "#0f766e", color: "#0f766e" }}
                >
                  <i className="bi bi-pencil me-1"></i>
                  {loc("Redigér denne", "Edit slot")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIntervalInfo(null)}
                  className="btn btn-sm btn-link text-muted p-0 ms-1"
                  title={loc("Luk", "Close")}
                >
                  <i className="bi bi-x-circle"></i>
                </button>
              </div>
            )}

            {/* Guidance Text when no interval selected */}
            {!selectedInterval && (
              <span className="text-muted small d-none d-lg-inline">
                {interactionMode === "move"
                  ? loc(
                      "💡 Træk en tidsblok for at flytte den til et andet tidspunkt på dagen.",
                      "💡 Drag a timeslot to move it to a different time of day."
                    )
                  : interactionMode === "create"
                  ? loc(
                      "💡 Klik og træk på en tom række for at tegne en ny arbejdsblok (5 min. præcision).",
                      "💡 Click and drag on an empty lane to draw a new working block (5 min resolution)."
                    )
                  : loc(
                      "💡 Vælg en tidsblok på tidslinjen for at justere start- og sluttidspunkter eller trække i kanterne.",
                      "💡 Select a timeslot on the timeline to fine-tune start and end times or drag its edges."
                    )}
              </span>
            )}
          </div>

          {/* Right: Controls based on Mode */}
          <div className="d-flex flex-wrap align-items-center gap-2">
            {(interactionMode === "edit" || interactionMode === "create") && selectedInterval ? (
              <>
                {/* Start Time input */}
                <div className="d-flex align-items-center gap-1.5">
                  <label className="small text-muted mb-0 fw-semibold">{loc("Fra", "From")}:</label>
                  <input
                    type="time"
                    step="300"
                    className="form-control form-control-sm text-center fw-bold bg-white border shadow-2xs"
                    style={{ width: "95px", height: "31px", fontSize: "0.82rem" }}
                    value={selectedInterval.int.start}
                    onChange={(e) => handleSelectedIntervalChange("start", e.target.value)}
                  />
                </div>

                {/* End Time input */}
                <div className="d-flex align-items-center gap-1.5">
                  <label className="small text-muted mb-0 fw-semibold">{loc("Til", "To")}:</label>
                  <input
                    type="time"
                    step="300"
                    className="form-control form-control-sm text-center fw-bold bg-white border shadow-2xs"
                    style={{ width: "95px", height: "31px", fontSize: "0.82rem" }}
                    value={selectedInterval.int.end}
                    onChange={(e) => handleSelectedIntervalChange("end", e.target.value)}
                  />
                </div>

                {/* Duration badge */}
                <span
                  className="badge bg-white text-dark border py-1.5 px-2.5 small fw-semibold shadow-2xs"
                  style={{ fontSize: "0.75rem" }}
                >
                  {formatMinutes(
                    Math.max(
                      0,
                      timeToMinutes(selectedInterval.int.end, true) - timeToMinutes(selectedInterval.int.start)
                    ),
                    isEn
                  )}
                </span>

                {/* Online Only Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleOnlineOnly(selectedInterval.day.day, selectedInterval.int.id)}
                  className={`btn btn-sm rounded-pill px-2.5 py-1 d-flex align-items-center gap-1.5 fw-semibold shadow-2xs transition-all ${
                    selectedInterval.int.isOnlineOnly
                      ? "btn-info text-white shadow-xs"
                      : "btn-light border text-muted"
                  }`}
                  style={{
                    fontSize: "0.76rem",
                    backgroundColor: selectedInterval.int.isOnlineOnly ? "#0284c7" : undefined,
                    borderColor: selectedInterval.int.isOnlineOnly ? "#0284c7" : undefined,
                    color: selectedInterval.int.isOnlineOnly ? "#ffffff" : undefined,
                  }}
                  title={
                    selectedInterval.int.isOnlineOnly
                      ? loc("Dette tidsrum er markeret som 'Online Only'. Klik for at tillade fysisk fremmøde også.", "This slot is marked as 'Online Only'. Click to allow in-person attendance too.")
                      : loc("Klik for at markere dette tidsrum som 'Online Only' (kun online videokonsultationer).", "Click to mark this slot as 'Online Only' (video consultations only).")
                  }
                >
                  <i className={`bi ${selectedInterval.int.isOnlineOnly ? "bi-camera-video-fill" : "bi-camera-video"}`}></i>
                  <span>
                    {selectedInterval.int.isOnlineOnly
                      ? loc("Online kun", "Online only")
                      : loc("Fysisk & Online", "Physical & Online")}
                  </span>
                </button>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveInterval(selectedInterval.day.day, selectedInterval.int.id)}
                  className="btn btn-sm btn-outline-danger rounded-pill px-3 py-1 d-flex align-items-center gap-1 fw-semibold shadow-2xs"
                  style={{ fontSize: "0.78rem" }}
                >
                  <i className="bi bi-trash"></i>
                  <span>{loc("Fjern Blok", "Remove Block")}</span>
                </button>

                {/* Close editor button */}
                <button
                  type="button"
                  onClick={() => setSelectedIntervalInfo(null)}
                  className="btn btn-sm btn-light border rounded-pill px-3 py-1 fw-semibold shadow-2xs text-muted"
                  style={{ fontSize: "0.78rem" }}
                >
                  {loc("Luk", "Close")}
                </button>
              </>
            ) : interactionMode === "create" ? (
              /* Quick Presets in Create Mode when no block is selected */
              <div className="d-flex align-items-center gap-1.5">
                <span className="small text-muted fw-semibold me-1 d-none d-md-inline" style={{ fontSize: "0.72rem" }}>
                  {loc("+ Hurtig skabelon:", "+ Quick template:")}
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("08:30", "16:00")}
                  className="btn btn-sm btn-light border rounded-pill px-2.5 py-0.5 text-muted fw-semibold"
                  style={{ fontSize: "0.72rem" }}
                  title={loc("Tilføj standard dag (08:30 – 16:00)", "Add standard day (08:30 – 16:00)")}
                >
                  08:30–16:00
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("08:00", "12:00")}
                  className="btn btn-sm btn-light border rounded-pill px-2.5 py-0.5 text-muted fw-semibold"
                  style={{ fontSize: "0.72rem" }}
                  title={loc("Tilføj formiddag (08:00 – 12:00)", "Add morning (08:00 – 12:00)")}
                >
                  08:00–12:00
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("12:45", "16:30")}
                  className="btn btn-sm btn-light border rounded-pill px-2.5 py-0.5 text-muted fw-semibold"
                  style={{ fontSize: "0.72rem" }}
                  title={loc("Tilføj eftermiddag (12:45 – 16:30)", "Add afternoon (12:45 – 16:30)")}
                >
                  12:45–16:30
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset("17:00", "00:00")}
                  className="btn btn-sm btn-light border rounded-pill px-2.5 py-0.5 text-muted fw-semibold"
                  style={{ fontSize: "0.72rem" }}
                  title={loc("Tilføj aften (17:00 – 00:00)", "Add evening (17:00 – 00:00)")}
                >
                  17:00–00:00
                </button>
              </div>
            ) : interactionMode === "edit" && !selectedInterval ? (
              <span className="small text-muted fst-italic">
                {loc("Klik på en tidsblok nedenfor for at redigere den", "Click a timeslot below to edit it")}
              </span>
            ) : (
              /* Color Legend in Move Mode */
              <div className="d-flex flex-wrap align-items-center gap-3">
                <span className="d-flex align-items-center gap-1">
                  <span className="d-inline-block rounded-1" style={{ width: "12px", height: "12px", backgroundColor: "#0f766e" }}></span>
                  <span>{loc("Fysisk & Online", "Physical & Online")}</span>
                </span>
                <span className="d-flex align-items-center gap-1">
                  <span className="d-inline-block rounded-1" style={{ width: "12px", height: "12px", backgroundColor: "#0369a1", border: "1px solid #38bdf8" }}></span>
                  <i className="bi bi-camera-video text-info ms-0.5" style={{ fontSize: "0.72rem" }}></i>
                  <span>{loc("Online kun (Video)", "Online only (Video)")}</span>
                </span>
                <span className="d-flex align-items-center gap-1">
                  <span className="d-inline-block rounded-1" style={{ width: "12px", height: "12px", backgroundColor: "#fef3c7", border: "1px dashed #f59e0b" }}></span>
                  <span>{loc("Automatisk pause", "Automatic break")}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="table-responsive p-3">
          <div style={{ minWidth: "1080px" }}>
            {/* Top Time Ruler Header (00:00 to 23:55) */}
            <div className="d-flex align-items-center mb-2">
              {/* Day Label Column Spacer */}
              <div style={{ width: "210px", flexShrink: 0 }} className="pe-2 text-muted small fw-bold">
                {loc("Ugedag & Status", "Weekday & Status")}
              </div>

              {/* Hour Ticks Ruler (Every 2nd hour to avoid overlap: 00:00, 02:00, ..., 22:00, 23:55) */}
              <div className="flex-grow-1 position-relative" style={{ height: "24px" }}>
                {timelineHours
                  .filter((h) => h % 2 === 0)
                  .map((h) => {
                    const percent = (h / 24) * 100;
                    const isStart = h === 0;
                    const isEnd = h === 24;

                    return (
                      <div
                        key={h}
                        className="position-absolute text-muted small user-select-none"
                        style={{
                          left: `${percent}%`,
                          transform: isStart
                            ? "translateX(0%)"
                            : isEnd
                            ? "translateX(-100%)"
                            : "translateX(-50%)",
                          fontSize: isEnd || isStart ? "0.76rem" : "0.72rem",
                          userSelect: "none",
                          fontWeight: isStart || isEnd || h === 12 ? 700 : 500,
                          color: isEnd || isStart ? "#0f766e" : undefined,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isEnd ? "00:00" : `${String(h).padStart(2, "0")}:00`}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* 7 Weekday Rows */}
            <div className="d-flex flex-column gap-2.5">
              {schedule.days.map((day) => {
                const breaks = getBreaksForDay(day);
                const isWeekend = day.day === "saturday" || day.day === "sunday";
                const dayWorkM = day.intervals.reduce((acc, i) => acc + Math.max(0, timeToMinutes(i.end, true) - timeToMinutes(i.start)), 0);

                return (
                  <div
                    key={day.day}
                    className={`d-flex align-items-center rounded-3 p-1.5 transition-all ${
                      day.enabled ? "bg-white border" : "bg-light bg-opacity-60 border-dashed"
                    }`}
                    style={{
                      borderColor: day.enabled ? "#e2e8f0" : "#e2e8f0",
                    }}
                  >
                    {/* Left Column: Day Controls */}
                    {/* Left Column: Day Controls */}
                    <div
                      style={{ width: "205px", flexShrink: 0 }}
                      className="d-flex align-items-center pe-3 border-end"
                    >
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleDay(day.day)}
                          className={`btn btn-sm rounded-pill px-2 py-0.5 small fw-semibold d-flex align-items-center gap-1 ${
                            day.enabled ? "btn-teal text-white" : "btn-outline-secondary"
                          }`}
                          style={{
                            backgroundColor: day.enabled ? "#0f766e" : undefined,
                            borderColor: day.enabled ? "#0f766e" : undefined,
                            fontSize: "0.74rem",
                          }}
                        >
                          <i className={`bi ${day.enabled ? "bi-check-circle-fill" : "bi-slash-circle"}`}></i>
                          <span>{day.enabled ? loc("Åben", "Open") : loc("Luk", "Off")}</span>
                        </button>

                        <div>
                          <div className="fw-bold text-dark small" style={{ lineHeight: 1.2 }}>
                            {isEn ? day.labelEn : day.labelDa}
                          </div>
                          <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                            {day.enabled ? formatMinutes(dayWorkM, isEn) : loc("Lukket", "Closed")}
                          </div>
                          {day.enabled && day.intervals.length > 0 && (
                            <div
                              className="text-teal text-truncate mt-0.5"
                              style={{ fontSize: "0.66rem", maxWidth: "125px", fontWeight: 600 }}
                              title={day.intervals.map((i) => `${i.start}–${i.end}`).join(", ")}
                            >
                              {day.intervals.map((i) => `${i.start}–${i.end}`).join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: 2D Timeline Row Lane */}
                    <div
                      data-lane-day={day.day}
                      ref={(el) => {
                        laneRefs.current[day.day] = el;
                      }}
                      onPointerDown={(e) => {
                        if (day.enabled) {
                          handleLanePointerDown(e, day.day);
                        }
                      }}
                      onPointerMove={(e) => {
                        if (interactionMode === "create" && day.enabled && !dragState) {
                          const m = getMinutesFromClientX(e.clientX, day.day);
                          setHoverTimeInfo({ dayKey: day.day, minutes: m });
                        }
                      }}
                      onPointerLeave={() => {
                        setHoverTimeInfo(null);
                      }}
                      className="flex-grow-1 position-relative ms-2 rounded-2"
                      style={{
                        height: "46px",
                        backgroundColor:
                          dragState?.type === "move" && dragState.targetDayKey === day.day && dragState.dayKey !== day.day
                            ? "#e0f2fe"
                            : day.enabled
                            ? "#f8fafc"
                            : "#f1f5f9",
                        border:
                          dragState?.type === "move" && dragState.targetDayKey === day.day && dragState.dayKey !== day.day
                            ? "2px dashed #0284c7"
                            : "1px solid #e2e8f0",
                        cursor: dragState?.type === "move"
                          ? "grabbing"
                          : !day.enabled
                          ? "not-allowed"
                          : interactionMode === "create"
                          ? "crosshair"
                          : "default",
                        overflow: "visible",
                        touchAction: "none",
                        userSelect: "none",
                        transition: "background-color 0.15s ease, border-color 0.15s ease",
                      }}
                      title={
                        !day.enabled
                          ? loc("Klinikken er lukket på denne dag. Slå til i venstre side.", "Clinic is closed. Toggle switch to open.")
                          : interactionMode === "create"
                          ? loc("Klik og træk for at oprette en arbejdsblok (5 min. præcision)", "Click & drag to draw a working block (5 min precision)")
                          : interactionMode === "move"
                          ? loc("Flyt-tilstand: Træk en tidsblok for at flytte den til et andet tidspunkt eller en anden dag.", "Move mode: Drag a timeslot to move it to another time or day.")
                          : loc("Redigér-tilstand: Klik på en tidsblok for at redigere eller trække i kanterne.", "Edit mode: Click a timeslot to edit or drag edges.")
                      }
                    >
                      {/* Vertical Background Hour Lines */}
                      {timelineHours.map((h) => {
                        const pct = ((h - minTimelineHour) * 60) / totalTimelineMinutes * 100;
                        return (
                          <div
                            key={h}
                            className="position-absolute top-0 bottom-0"
                            style={{
                              left: `${pct}%`,
                              width: "1px",
                              backgroundColor: "#e2e8f0",
                              pointerEvents: "none",
                            }}
                          />
                        );
                      })}

                      {/* If Day is Closed */}
                      {!day.enabled && (
                        <div className="position-absolute top-0 bottom-0 start-0 end-0 d-flex align-items-center justify-content-center text-muted fst-italic small">
                          <i className="bi bi-slash-circle me-1.5 text-secondary"></i>
                          <span>{loc("Lukket for booking", "Closed for bookings")}</span>
                        </div>
                      )}

                      {/* Render Designated Breaks between intervals */}
                      {day.enabled &&
                        breaks.map((b, bIdx) => {
                          const startM = timeToMinutes(b.start);
                          const endM = timeToMinutes(b.end, true);
                          const leftPct = ((startM - minTimelineHour * 60) / totalTimelineMinutes) * 100;
                          const widthPct = ((endM - startM) / totalTimelineMinutes) * 100;

                          if (leftPct + widthPct <= 0 || leftPct >= 100) return null;

                          return (
                            <div
                              key={`break-${bIdx}`}
                              className="position-absolute top-0 bottom-0 d-flex align-items-center justify-content-center text-truncate px-1"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: "#fffbeb",
                                borderLeft: "2px dashed #f59e0b",
                                borderRight: "2px dashed #f59e0b",
                                color: "#b45309",
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                zIndex: 1,
                                pointerEvents: "none",
                              }}
                              title={loc(
                                `☕ Pause: ${b.start} – ${b.end} (${b.durationMinutes} min) - Ingen klientbooking`,
                                `☕ Break: ${b.start} – ${b.end} (${b.durationMinutes} min) - Blocked for booking`
                              )}
                            >
                              ☕ {b.durationMinutes}m {loc("pause", "break")}
                            </div>
                          );
                        })}

                      {/* Render Active Interval Blocks */}
                      {day.enabled &&
                        day.intervals.map((int) => {
                          // Check if currently being dragged
                          const isBeingDragged =
                            dragState &&
                            dragState.dayKey === day.day &&
                            dragState.intervalId === int.id;

                          const isSelected = selectedIntervalInfo?.intervalId === int.id;
                          const startM = isBeingDragged ? dragState.currentStartM : timeToMinutes(int.start);
                          const endM = isBeingDragged ? dragState.currentEndM : timeToMinutes(int.end, true);

                          const leftPct = ((startM - minTimelineHour * 60) / totalTimelineMinutes) * 100;
                          const widthPct = ((endM - startM) / totalTimelineMinutes) * 100;

                          if (leftPct + widthPct <= 0 || leftPct >= 100) return null;

                          return (
                            <div
                              key={int.id}
                              onPointerDown={(e) => handleBlockPointerDown(e, day.day, int)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIntervalInfo({ dayKey: day.day, intervalId: int.id });
                              }}
                              className="position-absolute top-0 bottom-0 rounded-2 d-flex align-items-center justify-content-between px-2 text-white"
                              style={{
                                left: `${Math.max(0, leftPct)}%`,
                                width: `${Math.max(1, widthPct)}%`,
                                backgroundColor: isBeingDragged
                                  ? "#0e7490"
                                  : int.isOnlineOnly
                                  ? isSelected
                                    ? "#0284c7"
                                    : "#0369a1"
                                  : isSelected
                                  ? "#0d9488"
                                  : "#0f766e",
                                border: isBeingDragged
                                  ? "2.5px solid #38bdf8"
                                  : int.isOnlineOnly
                                  ? isSelected
                                    ? "2.5px solid #38bdf8"
                                    : "1.5px solid #38bdf8"
                                  : isSelected
                                  ? "2.5px solid #38bdf8"
                                  : "1px solid #115e59",
                                boxShadow: isBeingDragged
                                  ? "0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 0 0 3px rgba(56, 189, 248, 0.6)"
                                  : isSelected
                                  ? "0 0 0 3.5px rgba(56, 189, 248, 0.45), 0 4px 6px -1px rgba(0, 0, 0, 0.15)"
                                  : int.isOnlineOnly
                                  ? "0 1px 3px rgba(3, 105, 161, 0.3)"
                                  : "0 1px 2px rgba(0, 0, 0, 0.08)",
                                zIndex: isBeingDragged ? 40 : isSelected ? 15 : 2,
                                cursor: isBeingDragged
                                  ? "grabbing"
                                  : interactionMode === "move"
                                  ? "grab"
                                  : "pointer",
                                opacity: isBeingDragged ? 0.95 : 1,
                                transform: isBeingDragged ? "scale(1.02)" : isSelected ? "scaleY(1.04)" : "scaleY(1)",
                                transition: isBeingDragged ? "none" : "all 0.15s ease",
                                touchAction: "none",
                                userSelect: "none",
                              }}
                              title={
                                interactionMode === "move"
                                  ? loc(
                                      `Arbejdstid: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [KUN ONLINE]" : ""}. Træk for at flytte blokken.`,
                                      `Work: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [ONLINE ONLY]" : ""}. Drag to move timeslot.`
                                    )
                                  : interactionMode === "edit"
                                  ? loc(
                                      `Arbejdstid: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [KUN ONLINE]" : ""}. Træk i kanterne for at ændre start/slut, eller redigér i toolbar.`,
                                      `Work: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [ONLINE ONLY]" : ""}. Drag edges to resize or edit in toolbar.`
                                    )
                                  : loc(
                                      `Arbejdstid: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [KUN ONLINE]" : ""}. Klik for at vælge.`,
                                      `Work: ${minutesToTime(startM)} – ${minutesToTime(endM)}${int.isOnlineOnly ? " [ONLINE ONLY]" : ""}. Click to select.`
                                    )
                              }
                            >
                              {/* Floating Live Badge above block when dragging */}
                              {isBeingDragged && (
                                <div
                                  className="position-absolute badge bg-dark text-white rounded-pill px-2.5 py-1 shadow"
                                  style={{
                                    top: "-28px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    fontSize: "0.72rem",
                                    zIndex: 60,
                                    pointerEvents: "none",
                                    userSelect: "none",
                                    whiteSpace: "nowrap",
                                    border: "1px solid #38bdf8",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {dragState.targetDayKey && dragState.targetDayKey !== dragState.dayKey && (
                                    <span className="text-warning fw-bold me-1.5">
                                      ➜ {WEEKDAY_LABELS[dragState.targetDayKey][isEn ? "en" : "da"]}:
                                    </span>
                                  )}
                                  {minutesToTime(startM)} – {minutesToTime(endM)}{int.isOnlineOnly ? " • Online" : ""}
                                </div>
                              )}

                              {/* Left Resize Handle (Only visible in Edit Mode) */}
                              {interactionMode === "edit" && (
                                <div
                                  onPointerDown={(e) => handleResizePointerDown(e, day.day, int, "start")}
                                  className="position-absolute top-0 bottom-0 start-0 d-flex align-items-center justify-content-center"
                                  style={{
                                    width: "14px",
                                    cursor: "ew-resize",
                                    backgroundColor: isBeingDragged ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.22)",
                                    borderTopLeftRadius: "6px",
                                    borderBottomLeftRadius: "6px",
                                    touchAction: "none",
                                    userSelect: "none",
                                    zIndex: 10,
                                  }}
                                  title={loc("Træk i kanten for at ændre starttid", "Drag edge to change start time")}
                                >
                                  <span style={{ fontSize: "0.6rem", pointerEvents: "none", userSelect: "none", color: "#ffffff", fontWeight: "bold" }}>⋮</span>
                                </div>
                              )}

                              {/* Center Content: Times & Duration */}
                              <div
                                className="mx-auto text-truncate small fw-bold text-center d-flex align-items-center gap-1"
                                style={{ fontSize: "0.73rem", pointerEvents: "none", userSelect: "none" }}
                              >
                                {isSelected && <i className="bi bi-pencil-fill text-info" style={{ fontSize: "0.62rem" }}></i>}
                                {int.isOnlineOnly && (
                                  <i
                                    className="bi bi-camera-video-fill text-warning me-0.5"
                                    style={{ fontSize: "0.68rem" }}
                                    title={loc("Online Only (Kun online videokonsultation)", "Online Only (Video consultations only)")}
                                  ></i>
                                )}
                                <span>{minutesToTime(startM)} – {minutesToTime(endM)}</span>
                                {int.isOnlineOnly && (
                                  <span
                                    className="badge bg-white text-info-emphasis rounded-pill px-1.5 py-0.5 ms-0.5 fw-bold d-none d-md-inline"
                                    style={{ fontSize: "0.6rem", lineHeight: 1 }}
                                  >
                                    Online
                                  </span>
                                )}
                              </div>

                              {/* Right Resize Handle (Only visible in Edit Mode) */}
                              {interactionMode === "edit" && (
                                <div
                                  onPointerDown={(e) => handleResizePointerDown(e, day.day, int, "end")}
                                  className="position-absolute top-0 bottom-0 end-0 d-flex align-items-center justify-content-center"
                                  style={{
                                    width: "14px",
                                    cursor: "ew-resize",
                                    backgroundColor: isBeingDragged ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.22)",
                                    borderTopRightRadius: "6px",
                                    borderBottomRightRadius: "6px",
                                    touchAction: "none",
                                    userSelect: "none",
                                    zIndex: 10,
                                  }}
                                  title={loc("Træk i kanten for at ændre sluttid", "Drag edge to change end time")}
                                >
                                  <span style={{ fontSize: "0.6rem", pointerEvents: "none", userSelect: "none", color: "#ffffff", fontWeight: "bold" }}>⋮</span>
                                </div>
                              )}
                            </div>
                          );
                        })}

                      {/* Live Hover Time Indicator (Snapping Guide) in Create Mode */}
                      {interactionMode === "create" && hoverTimeInfo?.dayKey === day.day && !dragState && (
                        <div
                          className="position-absolute top-0 bottom-0 pointer-events-none"
                          style={{
                            left: `${(hoverTimeInfo.minutes / 1440) * 100}%`,
                            width: "1.5px",
                            backgroundColor: "#0284c7",
                            zIndex: 20,
                          }}
                        >
                          <div
                            className="badge bg-dark text-white rounded-pill px-1.5 py-0.5 position-absolute shadow-sm"
                            style={{
                              top: "-2px",
                              left: "50%",
                              transform: "translateX(-50%)",
                              fontSize: "0.68rem",
                              lineHeight: 1,
                              pointerEvents: "none",
                              whiteSpace: "nowrap",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {minutesToTime(hoverTimeInfo.minutes)}
                          </div>
                        </div>
                      )}

                      {/* Ghost preview while drag-creating a new block */}
                      {dragState && dragState.type === "create" && dragState.dayKey === day.day && (
                        <div
                          className="position-absolute top-0 bottom-0 rounded-2 shadow-sm d-flex align-items-center justify-content-center text-white small"
                          style={{
                            left: `${Math.max(0, ((dragState.currentStartM - minTimelineHour * 60) / totalTimelineMinutes) * 100)}%`,
                            width: `${Math.max(1, ((dragState.currentEndM - dragState.currentStartM) / totalTimelineMinutes) * 100)}%`,
                            backgroundColor: "rgba(15, 118, 110, 0.7)",
                            border: "1px dashed #ffffff",
                            zIndex: 8,
                            pointerEvents: "none",
                            fontSize: "0.72rem",
                            fontWeight: "bold",
                          }}
                        >
                          {minutesToTime(dragState.currentStartM)} – {minutesToTime(dragState.currentEndM)}
                        </div>
                      )}

                      {/* Ghost preview when moving a block across to this target day */}
                      {dragState &&
                        dragState.type === "move" &&
                        dragState.targetDayKey === day.day &&
                        dragState.dayKey !== day.day && (
                          <div
                            className="position-absolute top-0 bottom-0 rounded-2 shadow d-flex align-items-center justify-content-center text-white small"
                            style={{
                              left: `${Math.max(0, ((dragState.currentStartM - minTimelineHour * 60) / totalTimelineMinutes) * 100)}%`,
                              width: `${Math.max(1, ((dragState.currentEndM - dragState.currentStartM) / totalTimelineMinutes) * 100)}%`,
                              backgroundColor: "rgba(2, 132, 199, 0.85)",
                              border: "2px dashed #ffffff",
                              zIndex: 35,
                              pointerEvents: "none",
                              fontSize: "0.74rem",
                              fontWeight: "bold",
                              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                            }}
                          >
                            <span className="text-white drop-shadow">
                              ➜ {minutesToTime(dragState.currentStartM)} – {minutesToTime(dragState.currentEndM)}
                              {dragState.interval?.isOnlineOnly ? " • Online" : ""}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
