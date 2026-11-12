import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AppointmentFeatureView,
  BookingFeatureView,
  roundTo5Min,
  timeToMinutes,
  minutesToTime,
  formatMinutes,
  getBreaksForDay,
  checkCollisionWithBreak,
  isDayClosed,
  getScheduleForDate,
  recomputeSchedule,
  getDefaultWeeklySchedule,
  parseWeeklySchedule,
  serializeWeeklySchedule,
  DaySchedule,
  WeeklyScheduleConfig,
} from "./AppointmentFeature";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("AppointmentFeature Vertical Slice (UI + DomainGuard + ProblemDetail)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial appointments and creates & deletes a booking (Happy Path)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "apt-1",
          clientName: "Alice",
          startTime: "2026-05-01T10:00",
          status: "SCHEDULED",
        },
      ],
    });

    render(<BookingFeatureView />);

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-clientName"), {
      target: { value: "Bob" },
    });
    fireEvent.change(screen.getByTestId("input-startTime"), {
      target: { value: "2026-05-01T12:00" },
    });
    fireEvent.change(screen.getByTestId("input-endTime"), {
      target: { value: "2026-05-01T13:00" },
    });
    fireEvent.change(screen.getByTestId("input-title"), {
      target: { value: "Trauma Session" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "apt-2",
        clientName: "Bob",
        startTime: "2026-05-01T12:00",
        endTime: "2026-05-01T13:00",
        title: "Trauma Session",
        status: "SCHEDULED",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-booking"));

    await waitFor(() => {
      expect(screen.getByText(/Bob/)).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-booking-apt-2"));

    await waitFor(() => {
      expect(screen.queryByText(/Bob/)).toBeNull();
    });
  });

  it("displays RFC 7807 ProblemDetail error banner when backend returns 409 Conflict", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<AppointmentFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const conflictProblem: ProblemDetail = {
      type: "https://api.platform.com/errors/conflict",
      title: "Conflict",
      status: 409,
      detail: "The selected time slot is already booked.",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => conflictProblem,
    });

    fireEvent.change(screen.getByTestId("input-clientName"), {
      target: { value: "Charlie" },
    });
    fireEvent.change(screen.getByTestId("input-startTime"), {
      target: { value: "2026-05-01T10:00" },
    });
    fireEvent.click(screen.getByTestId("submit-booking"));

    await waitFor(() => {
      const errorBanner = screen.getByTestId("error-banner");
      expect(errorBanner).toBeDefined();
      expect(errorBanner.getAttribute("data-error-code")).toBe("CONFLICT");
      expect(screen.getByTestId("error-title").textContent).toBe(
        "Conflict (409)"
      );
      expect(screen.getByTestId("error-detail").textContent).toBe(
        "The selected time slot is already booked."
      );
    });
  });

  it("enforces client-side DomainGuard before calling backend", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<AppointmentFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 1. Blank clientName
    fireEvent.click(screen.getByTestId("submit-booking"));
    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("VALIDATION_FAILED");
      expect(screen.getByTestId("field-error-clientName").textContent).toContain(
        "Client name must not be blank"
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. End time before start time
    fireEvent.change(screen.getByTestId("input-clientName"), {
      target: { value: "Dana" },
    });
    fireEvent.change(screen.getByTestId("input-startTime"), {
      target: { value: "2026-05-01T14:00" },
    });
    fireEvent.change(screen.getByTestId("input-endTime"), {
      target: { value: "2026-05-01T13:00" },
    });
    fireEvent.click(screen.getByTestId("submit-booking"));

    await waitFor(() => {
      expect(screen.getByTestId("field-error-endTime").textContent).toContain(
        "End time must be after start time"
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("WeeklyScheduleManager Domain Logic", () => {
  it("rounds time strings to 5-minute increments", () => {
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

  it("covers all edge cases for time conversion, formatting, breaks, dates, and parsing", async () => {

    // roundTo5Min edge cases
    expect(roundTo5Min("")).toBe("09:00");
    expect(roundTo5Min("invalid")).toBe("09:00");
    expect(roundTo5Min("xx:yy")).toBe("09:00");
    expect(roundTo5Min("23:59")).toBe("00:00");

    // timeToMinutes edge cases
    expect(timeToMinutes("")).toBe(0);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(timeToMinutes("xx:yy")).toBe(0);

    // minutesToTime edge cases
    expect(minutesToTime(-10)).toBe("00:00");
    expect(minutesToTime(1500)).toBe("00:00");
    expect(minutesToTime(90)).toBe("01:30");

    // formatMinutes edge cases
    expect(formatMinutes(0, false)).toBe("0 timer");
    expect(formatMinutes(-5, true)).toBe("0 hrs");
    expect(formatMinutes(45, false)).toBe("45 min");
    expect(formatMinutes(45, true)).toBe("45 min");
    expect(formatMinutes(120, false)).toBe("2 timer");
    expect(formatMinutes(120, true)).toBe("2 hrs");
    expect(formatMinutes(135, false)).toBe("2t 15m");
    expect(formatMinutes(135, true)).toBe("2h 15m");

    // getBreaksForDay edge cases (disabled day, tiny gap < 5m, overlapping intervals)
    expect(
      getBreaksForDay({
        day: "monday",
        labelDa: "Mandag",
        labelEn: "Monday",
        enabled: false,
        intervals: [
          { id: "1", start: "08:00", end: "10:00" },
          { id: "2", start: "11:00", end: "12:00" },
        ],
      })
    ).toEqual([]);

    expect(
      getBreaksForDay({
        day: "monday",
        labelDa: "Mandag",
        labelEn: "Monday",
        enabled: true,
        intervals: [
          { id: "1", start: "08:00", end: "10:00" },
          { id: "2", start: "10:02", end: "12:00" },
          { id: "3", start: "11:30", end: "13:00" },
        ],
      })
    ).toEqual([]);

    // checkCollisionWithBreak edge cases
    expect(checkCollisionWithBreak(null, "10:00")).toEqual({ collides: false });
    expect(
      checkCollisionWithBreak(
        { day: "monday", labelDa: "Mandag", labelEn: "Monday", enabled: false, intervals: [] },
        "10:00"
      )
    ).toEqual({ collides: false });

    // isDayClosed & getScheduleForDate edge cases
    expect(isDayClosed(null, "2026-10-19")).toBe(false);
    expect(isDayClosed(getDefaultWeeklySchedule(), new Date("2026-10-19T10:00:00Z"))).toBe(false);
    expect(getScheduleForDate(null, "2026-10-19")).toBeNull();
    const defSched = getDefaultWeeklySchedule();
    expect(getScheduleForDate(defSched, new Date("2026-10-19T10:00:00Z"))?.day).toBe("monday");
    expect(getScheduleForDate({ ...defSched, days: [] }, "2026-10-19")).toBeNull();

    // recomputeSchedule edge cases: all days disabled, or mismatched weekday intervals
    const emptySched = recomputeSchedule({
      ...defSched,
      days: defSched.days.map((d) => ({ ...d, enabled: false, intervals: [] })),
    });
    expect(emptySched.overallWindow).toBe("08:30 - 16:00");
    expect(emptySched.summaryText).toContain("(Alle hverdage)");

    const diffMondaySched = recomputeSchedule({
      ...defSched,
      days: defSched.days.map((d) =>
        d.day === "monday"
          ? { ...d, intervals: [{ id: "m1", start: "09:00", end: "15:00" }] }
          : d
      ),
    });
    expect(diffMondaySched.summaryText).toContain("Mandag: 09:00 - 15:00");

    // parseWeeklySchedule edge cases
    expect(parseWeeklySchedule(null).version).toBe(1);
    expect(parseWeeklySchedule("   ").version).toBe(1);
    const fullSerialized = serializeWeeklySchedule(defSched);
    expect(parseWeeklySchedule(fullSerialized).overallWindow).toBe("08:30 - 16:00");
    expect(parseWeeklySchedule('{"legacy":"09:00 - 15:00"}').overallWindow).toBe("09:00 - 15:00");
    expect(parseWeeklySchedule('{"invalidJson":').version).toBe(1);
    expect(parseWeeklySchedule('{"noRange":true}').version).toBe(1);
    expect(parseWeeklySchedule("No time range here").version).toBe(1);
  });
});

