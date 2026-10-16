import { describe, it, expect } from "vitest";
import {
  roundTo5Min,
  timeToMinutes,
  minutesToTime,
  getBreaksForDay,
  checkCollisionWithBreak,
  isDayClosed,
  parseWeeklySchedule,
  serializeWeeklySchedule,
  getDefaultWeeklySchedule,
  WeeklyScheduleConfig,
  DaySchedule,
} from "./WeeklyScheduleManager";

describe("WeeklyScheduleManager logic", () => {
  it("snaps time to minimum 5-minute intervals accurately", () => {
    expect(roundTo5Min("08:00")).toBe("08:00");
    expect(roundTo5Min("08:02")).toBe("08:00");
    expect(roundTo5Min("08:03")).toBe("08:05");
    expect(roundTo5Min("08:07")).toBe("08:05");
    expect(roundTo5Min("08:08")).toBe("08:10");
    expect(roundTo5Min("12:58")).toBe("13:00");
  });

  it("calculates designated lunch breaks between intervals", () => {
    const day: DaySchedule = {
      day: "monday",
      labelDa: "Mandag",
      labelEn: "Monday",
      enabled: true,
      intervals: [
        { id: "1", start: "08:00", end: "12:00" },
        { id: "2", start: "12:45", end: "16:30" },
      ],
    };

    const breaks = getBreaksForDay(day);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].start).toBe("12:00");
    expect(breaks[0].end).toBe("12:45");
    expect(breaks[0].durationMinutes).toBe(45);
  });

  it("detects collisions with breaks correctly", () => {
    const day: DaySchedule = {
      day: "tuesday",
      labelDa: "Tirsdag",
      labelEn: "Tuesday",
      enabled: true,
      intervals: [
        { id: "1", start: "09:00", end: "12:00" },
        { id: "2", start: "13:00", end: "17:00" },
      ],
    };

    // Slot at 12:15 collides with break (12:00 - 13:00)
    const collision1 = checkCollisionWithBreak(day, "12:15", 30);
    expect(collision1.collides).toBe(true);
    expect(collision1.breakInfo?.start).toBe("12:00");
    expect(collision1.breakInfo?.end).toBe("13:00");

    // Slot at 10:00 does not collide
    const collision2 = checkCollisionWithBreak(day, "10:00", 60);
    expect(collision2.collides).toBe(false);
  });

  it("identifies closed days correctly", () => {
    const config = getDefaultWeeklySchedule();
    // Monday is enabled by default
    expect(isDayClosed(config, "2026-10-19")).toBe(false); // 2026-10-19 is Monday
    // Sunday is disabled by default
    expect(isDayClosed(config, "2026-10-18")).toBe(true); // 2026-10-18 is Sunday
  });

  it("parses legacy and text formats and produces valid Timefold window", () => {
    const plainText = "Mandag - Fredag 09:00 - 16:00";
    const parsed = parseWeeklySchedule(plainText);
    expect(parsed.overallWindow).toBe("09:00 - 16:00");

    const serialized = serializeWeeklySchedule(parsed);
    // Regex matching Java backend Pattern
    const HOURS_RANGE_PATTERN = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;
    const match = serialized.match(HOURS_RANGE_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("09:00");
    expect(match![2]).toBe("16:00");
  });

  it("handles shifts ending at 00:00 midnight without introducing unwanted breaks", () => {
    expect(timeToMinutes("00:00", true)).toBe(1440);
    expect(timeToMinutes("00:00", false)).toBe(0);
    expect(minutesToTime(1440)).toBe("00:00");

    const day: DaySchedule = {
      day: "monday",
      labelDa: "Mandag",
      labelEn: "Monday",
      enabled: true,
      intervals: [
        { id: "1", start: "20:00", end: "00:00" },
      ],
    };

    // A single shift ending at midnight has no breaks
    const breaks = getBreaksForDay(day);
    expect(breaks).toHaveLength(0);

    // Duration is 4 hours (240 minutes)
    const dur = timeToMinutes(day.intervals[0].end, true) - timeToMinutes(day.intervals[0].start, false);
    expect(dur).toBe(240);
  });
});
