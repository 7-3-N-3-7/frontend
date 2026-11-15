import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  AppointmentFeatureView,
  BookingFeatureView,
  AppointmentDto,
  deduplicateProviders,
  deduplicateServices,
  toDateTimeLocalInput,
  addMinutesToIsoLocal,
  formatAppointmentDateParts,
  filterAppointments,
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
import { AuthProvider } from "../../core/baseUiCore";
import { CachedI18nProvider } from "../i18n/I18nFeature";

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

    fireEvent.click(screen.getByTestId("delete-booking-apt-2"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    expect(screen.getByText(/Bob/)).toBeDefined();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-booking-apt-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

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
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("booking-empty-state")).toBeDefined();
    });

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
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("booking-empty-state")).toBeDefined();
    });

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

describe("AppointmentFeature Trin 1 UI (Timefold AI, Reschedule, JGit, Filters & Weekly Editor)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles pure date/time formatting and appointment filtering helpers", () => {
    expect(toDateTimeLocalInput(null)).toBe("");
    expect(toDateTimeLocalInput("2026-10-19T14:30:00Z")).toBe("2026-10-19T14:30");
    expect(toDateTimeLocalInput("custom")).toBe("custom");

    expect(addMinutesToIsoLocal("2026-10-19T14:30", 60)).toBe("2026-10-19T15:30");
    expect(addMinutesToIsoLocal("2026-10-19T23:30", 60)).toBe("2026-10-20T00:30");
    expect(addMinutesToIsoLocal("invalid", 60)).toBe("");
    expect(addMinutesToIsoLocal("2026-10-19T14:30", Number.NaN)).toBe("");

    const fullParts = formatAppointmentDateParts("2026-10-19T14:00", "2026-10-19T15:00");
    expect(fullParts.monthShort).toBe("OKT");
    expect(fullParts.dayNumber).toBe("19");
    expect(fullParts.timeRange).toBe("14:00 – 15:00");
    expect(fullParts.weekdayShort).toBe("man");

    const singleParts = formatAppointmentDateParts("2026-10-19T09:15");
    expect(singleParts.timeRange).toBe("09:15");
    expect(formatAppointmentDateParts("not-a-date").monthShort).toBe("---");
    expect(formatAppointmentDateParts("").timeRange).toBe("--:--");

    const sample: AppointmentDto[] = [
      { id: "a1", clientName: "A", startTime: "2026-10-20T10:00", status: "CANCELLED" },
      { id: "a2", clientName: "B", startTime: "2026-10-18T10:00", status: "CONFIRMED" },
      { id: "a3", clientName: "C", startTime: "2026-10-25T10:00", status: "SCHEDULED" },
      { id: "a4", clientName: "D", startTime: "2026-10-28T10:00" },
    ];
    expect(filterAppointments(sample, "active").map((x) => x.id)).toEqual([
      "a2",
      "a3",
      "a4",
    ]);
    expect(filterAppointments(sample, "cancelled").map((x) => x.id)).toEqual(["a1"]);
    expect(filterAppointments(sample, "all").map((x) => x.id)).toEqual([
      "a2",
      "a1",
      "a3",
      "a4",
    ]);
    expect(
      filterAppointments(sample, "active", "2026-10-19", "2026-10-26").map((x) => x.id)
    ).toEqual(["a3"]);
    expect(filterAppointments(sample, "all", "", "", "C").map((x) => x.id)).toEqual(["a3"]);

    expect(
      deduplicateProviders([
        { userUuid: "u1", displayName: "Dr. Bo" },
        { userUuid: "u1", displayName: "Dr. Bo Duplicate" },
        { id: "p2", userUuid: "", displayName: "Dr. Mette" },
        { id: "p2", userUuid: "", displayName: "Dr. Mette Dup" },
        { userUuid: "", displayName: "Dr. Lise" },
        { userUuid: "", displayName: "dr. lise" },
        { userUuid: "u-maja-1", displayName: "Dr. maja_terapeut" },
        { userUuid: "u-maja-2", displayName: "dr. maja_terapeut " },
        { userUuid: "", displayName: "" },
      ]).map((p) => p.displayName)
    ).toEqual(["Dr. Bo", "Dr. Mette", "Dr. Lise", "Dr. maja_terapeut"]);

    expect(
      deduplicateServices([
        { id: "s1", name: "EMDR", durationMinutes: 60, providerProfileId: "p1" },
        { id: "s1", name: "EMDR Clone", durationMinutes: 60, providerProfileId: "p1" },
        { id: "s2", name: "  emdr  ", durationMinutes: 60, providerProfileId: "p1" },
        { id: "s3", name: "Check-in", durationMinutes: 30, providerProfileId: "p2" },
      ]).map((s) => s.id)
    ).toEqual(["s1", "s3"]);
    expect(deduplicateProviders(null)).toEqual([]);
    expect(deduplicateServices(undefined)).toEqual([]);
  });

  it("supports status tabs, date filter, duration chips, inline reschedule, and JGit history", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const initialList: AppointmentDto[] = [
      {
        id: "appt-active-1",
        clientName: "Ida Holm",
        therapistName: "Dr. Bo Jensen",
        organisationName: "Klinik Nord",
        location: "Lokale 2",
        title: "EMDR Konsultation",
        startTime: "2026-11-19T10:00:00",
        endTime: "2026-11-19T11:00:00",
        status: "CONFIRMED",
      },
      {
        id: "appt-done-2",
        clientName: "Poul Kjær",
        startTime: "2026-11-18T09:00:00",
        status: "COMPLETED",
      },
      {
        id: "appt-noshow-3",
        clientName: "",
        title: "Udeblevet session",
        startTime: "2026-11-17T09:00:00",
        status: "NO_SHOW",
      },
      {
        id: "appt-cancelled-4",
        clientName: "Gammel Aflysning",
        startTime: "2026-11-10T09:00:00",
        status: "CANCELLED",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => initialList,
    });

    render(<AppointmentFeatureView />);

    await waitFor(() => {
      expect(screen.getByText("Ida Holm")).toBeDefined();
    });
    // Default Aktive tab hides CANCELLED rows and omits raw CONFIRMED enum suffix
    expect(screen.queryByText("Gammel Aflysning")).toBeNull();
    expect(screen.getByText("Klinik Nord")).toBeDefined();
    expect(screen.queryByText(/\(CONFIRMED\)/)).toBeNull();

    // Live search query filter + reset
    fireEvent.change(screen.getByTestId("filter-appointment-search"), {
      target: { value: "Poul" },
    });
    expect(screen.getByText("Poul Kjær")).toBeDefined();
    expect(screen.queryByText("Ida Holm")).toBeNull();
    fireEvent.click(screen.getByTestId("reset-date-filter"));
    expect(screen.getByText("Ida Holm")).toBeDefined();

    // Status tab switching
    fireEvent.click(screen.getByTestId("filter-status-cancelled"));
    expect(screen.getByText("Gammel Aflysning")).toBeDefined();
    expect(screen.queryByText("Ida Holm")).toBeNull();

    fireEvent.click(screen.getByTestId("filter-status-all"));
    expect(screen.getByText("Ida Holm")).toBeDefined();
    expect(screen.getByText("Gammel Aflysning")).toBeDefined();

    fireEvent.click(screen.getByTestId("filter-status-active"));

    // Local date filter -> empty state -> reset
    fireEvent.change(screen.getByTestId("filter-date-from"), {
      target: { value: "2099-01-01" },
    });
    fireEvent.change(screen.getByTestId("filter-date-to"), {
      target: { value: "2099-12-31" },
    });
    fireEvent.click(screen.getByTestId("apply-date-filter"));
    expect(screen.getByTestId("booking-empty-state")).toBeDefined();
    fireEvent.click(screen.getByTestId("reset-date-filter"));
    expect(screen.getByText("Ida Holm")).toBeDefined();

    // Duration chips work both with empty and pre-filled startTime
    fireEvent.click(screen.getByTestId("duration-chip-60"));
    expect((screen.getByTestId("input-endTime") as HTMLInputElement).value).toContain("T11:00");
    fireEvent.change(screen.getByTestId("input-startTime"), {
      target: { value: "2026-11-20T09:00" },
    });
    fireEvent.click(screen.getByTestId("duration-chip-45"));
    expect((screen.getByTestId("input-endTime") as HTMLInputElement).value).toBe(
      "2026-11-20T09:45"
    );

    // Inline reschedule cancel, client-side DomainGuard validation, and PUT success
    fireEvent.click(screen.getByTestId("reschedule-btn-appt-active-1"));
    expect(screen.getByTestId("reschedule-panel-appt-active-1")).toBeDefined();
    fireEvent.click(screen.getByText("Annuller"));
    expect(screen.queryByTestId("reschedule-panel-appt-active-1")).toBeNull();

    fireEvent.click(screen.getByTestId("reschedule-btn-appt-active-1"));
    fireEvent.change(screen.getByTestId("reschedule-start-appt-active-1"), {
      target: { value: "2026-11-19T14:00" },
    });
    fireEvent.change(screen.getByTestId("reschedule-end-appt-active-1"), {
      target: { value: "2026-11-19T13:00" },
    });
    fireEvent.click(screen.getByTestId("reschedule-save-appt-active-1"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...initialList[0],
        startTime: "2026-11-21T13:00:00",
        endTime: "2026-11-21T14:00:00",
      }),
    });
    fireEvent.change(screen.getByTestId("reschedule-start-appt-active-1"), {
      target: { value: "2026-11-21T13:00" },
    });
    fireEvent.change(screen.getByTestId("reschedule-end-appt-active-1"), {
      target: { value: "2026-11-21T14:00" },
    });
    fireEvent.click(screen.getByTestId("reschedule-save-appt-active-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("reschedule-panel-appt-active-1")).toBeNull();
    });

    // JGit audit history inside collapsible technical-audit-history details (provider/default mode)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          commitHash: "abcdef123456",
          author: "Dr. Bo Jensen",
          timestamp: "2026-11-15T10:00:00Z",
          message: "Created appointment",
          snapshot: "{}",
        },
      ],
    });
    fireEvent.click(screen.getByTestId("git-history-btn-appt-active-1"));
    await waitFor(() => {
      expect(screen.getByTestId("technical-audit-history-appt-active-1")).toBeDefined();
      expect(screen.getByText("abcdef12")).toBeDefined();
      expect(screen.getByText("Created appointment")).toBeDefined();
    });
    // Cached reopen + close toggle
    fireEvent.click(screen.getByTestId("git-history-btn-appt-active-1"));
    expect(screen.queryByTestId("git-history-panel-appt-active-1")).toBeNull();
    fireEvent.click(screen.getByTestId("git-history-btn-appt-active-1"));
    expect(screen.getByTestId("git-history-panel-appt-active-1")).toBeDefined();

    // Empty change history
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });
    fireEvent.click(screen.getByTestId("git-history-btn-appt-done-2"));
    await waitFor(() => {
      expect(
        screen.getByText("Ingen ændringer registreret endnu for denne aftale.")
      ).toBeDefined();
    });

    // JGit failure surface ProblemAlert
    fetchMock.mockRejectedValueOnce(new Error("Git offline"));
    fireEvent.click(screen.getByTestId("git-history-btn-appt-noshow-3"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    // Refresh button triggers fetchAll
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => initialList,
    });
    fireEvent.click(screen.getByTitle("Opdater aftaleliste"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/appointments",
        expect.anything()
      );
    });

    // Reschedule item without endTime and save with empty endTime
    fireEvent.click(screen.getByTestId("reschedule-btn-appt-done-2"));
    fireEvent.change(screen.getByTestId("reschedule-end-appt-done-2"), {
      target: { value: "" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...initialList[1],
        startTime: "2026-11-18T11:00:00",
      }),
    });
    fireEvent.click(screen.getByTestId("reschedule-save-appt-done-2"));
    await waitFor(() => {
      expect(screen.queryByTestId("reschedule-panel-appt-done-2")).toBeNull();
    });

    // Open Timefold when !directoryLoaded -> fetches directory & unfeasible result
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        providers: [],
        services: [],
      }),
    });
    fireEvent.click(screen.getByTestId("toggle-timefold-panel"));
    await waitFor(() => {
      expect(screen.getByTestId("timefold-panel")).toBeDefined();
    });
    fireEvent.change(screen.getByTestId("timefold-therapist"), {
      target: { value: "44444444-4444-4444-8444-444444444444" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        feasible: false,
        recommendedSlot: null,
        slots: [],
      }),
    });
    fireEvent.click(screen.getByTestId("fetch-timefold-slots"));
    await waitFor(() => {
      expect(screen.getByText(/Ingen fuld løsning/)).toBeDefined();
    });
  });

  it("integrates Clinic Directory, Timefold AI slots, and Client date-window endpoint under AuthProvider", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const clientUuid = "11111111-1111-4111-8111-111111111111";
    const therapistUuid = "22222222-2222-4222-8222-222222222222";

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/backend/appointments" && (!init?.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "c-appt-1",
              clientUuid,
              therapistUuid,
              clientName: "Anders Sand",
              startTime: "2026-11-22T10:00",
              endTime: "2026-11-22T11:00",
              status: "SCHEDULED",
            },
          ],
        } as Response;
      }
      if (url === "/api/backend/clinic/directory") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [
              {
                id: "prov-1",
                userUuid: therapistUuid,
                organisationId: "org-1",
                organisationName: "Nordic Terapi",
                displayName: "Bo Jensen",
                workingHoursJson: "09:00 - 15:00",
              },
              {
                id: "prov-2",
                userUuid: "99999999-9999-4999-8999-999999999999",
                organisationId: "org-other",
                displayName: "Uden Ydelser",
              },
            ],
            services: [
              {
                id: "svc-1",
                providerProfileId: "prov-1",
                organisationId: "org-1",
                name: "EMDR Terapi",
                durationMinutes: 45,
              },
              {
                id: "svc-2",
                organisationId: "org-unmatched",
                name: "Kort Check-in",
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith("/api/backend/appointments/timefold-slots")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            solver: "Timefold Solver",
            workingHoursWindow: "09:00 - 15:00",
            feasible: true,
            recommendedSlot: "2026-11-25T10:00",
            slots: [
              {
                slot: "10:00–10:45",
                startTime: "2026-11-25T10:00",
                endTime: "2026-11-25T10:45",
                available: true,
                recommended: true,
              },
              {
                slot: "11:00–11:45",
                startTime: "2026-11-25T11:00",
                endTime: "2026-11-25T11:45",
                available: false,
                overlaps: true,
                reason: "Optaget",
              },
            ],
          }),
        } as Response;
      }
      if (url.startsWith(`/api/backend/appointments/client/${clientUuid}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "c-appt-1",
              clientName: "Anders Sand",
              startTime: "2026-11-22T10:00",
              endTime: "2026-11-22T11:00",
              status: "SCHEDULED",
            },
          ],
        } as Response;
      }
      if (url === "/api/backend/appointments/c-appt-1" && init?.method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "c-appt-1",
            clientName: "Anders Sand",
            startTime: "2026-11-22T12:00",
            endTime: "2026-11-22T13:00",
            status: "CONFIRMED",
          }),
        } as Response;
      }
      if (url === "/api/backend/appointments/c-appt-1" && init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    render(
      <AuthProvider
        user={{
          id: clientUuid,
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <AppointmentFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect((screen.getByTestId("input-clientName") as HTMLInputElement).value).toBe(
        "Anders Sand"
      );
      expect(screen.getByTestId("select-therapist").textContent).toContain("Bo Jensen");
    });

    // Weekly schedule button hidden for CLIENT role
    expect(screen.queryByTestId("toggle-weekly-schedule")).toBeNull();

    // Select service -> fills title and Timefold duration
    fireEvent.change(screen.getByTestId("select-therapist"), {
      target: { value: therapistUuid },
    });
    fireEvent.change(screen.getByTestId("select-service"), {
      target: { value: "svc-1" },
    });
    expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("EMDR Terapi");

    // Timefold AI workflow
    fireEvent.click(screen.getByTestId("toggle-timefold-panel"));
    fireEvent.change(screen.getByTestId("timefold-therapist"), {
      target: { value: therapistUuid },
    });
    fireEvent.change(screen.getByTestId("timefold-date"), {
      target: { value: "2026-11-25" },
    });
    fireEvent.change(screen.getByTestId("timefold-duration"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByTestId("timefold-preferred-time"), {
      target: { value: "10:00" },
    });
    fireEvent.click(screen.getByTestId("fetch-timefold-slots"));

    await waitFor(() => {
      expect(screen.getByTestId("apply-recommended-slot")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("apply-recommended-slot"));
    expect((screen.getByTestId("input-startTime") as HTMLInputElement).value).toBe(
      "2026-11-25T10:00"
    );
    expect((screen.getByTestId("input-endTime") as HTMLInputElement).value).toBe(
      "2026-11-25T10:45"
    );
    fireEvent.click(screen.getByTestId("slot-pill-0"));

    // Select service after startTime is populated updates endTime dynamically
    fireEvent.change(screen.getByTestId("select-service"), {
      target: { value: "svc-1" },
    });

    // Deselect service + switch to provider without matched services (fallback)
    fireEvent.change(screen.getByTestId("select-service"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByTestId("select-therapist"), {
      target: { value: "99999999-9999-4999-8999-999999999999" },
    });
    fireEvent.change(screen.getByTestId("select-service"), {
      target: { value: "svc-2" },
    });

    // Client date-window endpoint filter -> error branch, then success + sync
    fireEvent.change(screen.getByTestId("filter-date-from"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByTestId("filter-date-to"), {
      target: { value: "2026-11-30" },
    });
    fetchMock.mockRejectedValueOnce(new Error("Window query failed"));
    fireEvent.click(screen.getByTestId("apply-date-filter"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("apply-date-filter"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/api/backend/appointments/client/${clientUuid}`),
        expect.anything()
      );
    });

    fireEvent.click(screen.getByTestId("reschedule-btn-c-appt-1"));
    fireEvent.change(screen.getByTestId("reschedule-start-c-appt-1"), {
      target: { value: "2026-11-22T12:00" },
    });
    fireEvent.change(screen.getByTestId("reschedule-end-c-appt-1"), {
      target: { value: "2026-11-22T13:00" },
    });
    fireEvent.click(screen.getByTestId("reschedule-save-c-appt-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("reschedule-panel-c-appt-1")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("delete-booking-c-appt-1"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.queryByTestId("delete-booking-c-appt-1")).toBeNull();
    });
  });

  it("supports Therapist Multi-Window Weekly Schedule editing, saving, and error recovery", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const therapistUuid = "33333333-3333-4333-8333-333333333333";

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/backend/appointments") {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url === "/api/backend/clinic/directory") {
        return { ok: false, status: 500, statusText: "Dir down", json: async () => ({}) } as Response;
      }
      if (url.startsWith("/api/backend/appointments/timefold-slots")) {
        // Array fallback response
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              startTime: "2026-11-26T09:00",
              endTime: "2026-11-26T10:00",
              available: true,
            },
          ],
        } as Response;
      }
      if (url === "/api/backend/clinic/me") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            userUuid: therapistUuid,
            providerProfile: {
              organisation: { cvrNumber: "46688244", name: "73N37" },
            },
          }),
        } as Response;
      }
      if (url === "/api/backend/clinic/therapist-onboarding" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ saved: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    render(
      <AuthProvider
        user={{
          id: therapistUuid,
          name: "Dr. Bo Jensen",
          email: "bo@clinic.dk",
          roles: ["THERAPIST"],
        }}
      >
        <AppointmentFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("toggle-weekly-schedule")).toBeDefined();
    });

    // Open Timefold with text-input fallback & flat array slots
    fireEvent.click(screen.getByTestId("toggle-timefold-panel"));
    fireEvent.change(screen.getByTestId("timefold-therapist"), {
      target: { value: therapistUuid },
    });
    fireEvent.click(screen.getByTestId("fetch-timefold-slots"));
    await waitFor(() => {
      expect(screen.getByTestId("slot-pill-0")).toBeDefined();
    });

    // Open Weekly Schedule Manager, toggle days, add/edit/remove interval, and save
    fireEvent.click(screen.getByTestId("toggle-weekly-schedule"));
    expect(screen.getByTestId("weekly-schedule-panel")).toBeDefined();

    fireEvent.click(screen.getByTestId("day-enabled-saturday"));
    fireEvent.click(screen.getByTestId("day-enabled-tuesday"));
    fireEvent.click(screen.getByTestId("add-interval-monday"));

    const timeInputs = screen
      .getByTestId("weekly-schedule-panel")
      .querySelectorAll('input[type="time"]');
    expect(timeInputs.length).toBeGreaterThan(2);
    fireEvent.change(timeInputs[0], { target: { value: "08:03" } });
    fireEvent.change(timeInputs[1], { target: { value: "11:57" } });

    const removeButtons = screen.getAllByTitle("Fjern interval");
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    fireEvent.click(screen.getByTestId("save-weekly-schedule"));
    await waitFor(() => {
      expect(screen.getByTestId("weekly-schedule-saved")).toBeDefined();
    });

    // Save error handling (string rejection exercises toProblemDetail fallback)
    fetchMock.mockRejectedValueOnce("raw-string-error");
    fireEvent.click(screen.getByTestId("save-weekly-schedule"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    // Therapist booking submission & inline reschedule double-toggle/error
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "t-appt-1",
        clientName: "Klara Møller",
        startTime: "2026-11-28T10:00",
        status: "SCHEDULED",
      }),
    });
    fireEvent.change(screen.getByTestId("input-clientName"), {
      target: { value: "Klara Møller" },
    });
    fireEvent.change(screen.getByTestId("input-startTime"), {
      target: { value: "2026-11-28T10:00" },
    });
    fireEvent.click(screen.getByTestId("submit-booking"));
    await waitFor(() => {
      expect(screen.getByText("Klara Møller")).toBeDefined();
    });

    // Open reschedule via button click and close via same reschedule button
    fireEvent.click(screen.getByTestId("reschedule-btn-t-appt-1"));
    expect(screen.getByTestId("reschedule-panel-t-appt-1")).toBeDefined();
    fireEvent.click(screen.getByTestId("reschedule-btn-t-appt-1"));
    expect(screen.queryByTestId("reschedule-panel-t-appt-1")).toBeNull();

    // Timefold with empty preferred time and non-recommended error path
    fireEvent.change(screen.getByTestId("timefold-preferred-time"), {
      target: { value: "" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        status: 400,
        title: "Bad Request",
        detail: "Invalid slot request",
        errorCode: "VALIDATION_FAILED",
        timestamp: new Date().toISOString(),
      }),
    });
    fireEvent.click(screen.getByTestId("fetch-timefold-slots"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
  });

  it("renders Spanish appointment chrome and localized Oct date parts without Danish fallback", async () => {
    expect(
      formatAppointmentDateParts("2026-10-14T10:00:00", "2026-10-14T11:00:00", "es")
    ).toEqual({
      monthShort: "OCT",
      dayNumber: "14",
      weekdayShort: "mié",
      timeRange: "10:00 – 11:00",
      fullDate: "14 oct 2026",
    });

    const therapistUuid = "11111111-1111-1111-1111-111111111111";
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/backend/appointments")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "es-appt-1",
              clientName: "Lucía Gómez",
              title: "Sesión clínica",
              startTime: "2026-10-14T10:00:00",
              endTime: "2026-10-14T11:00:00",
              status: "CONFIRMED",
              therapistUuid,
              serviceCode: "INITIAL_60",
            },
            {
              id: "es-appt-2",
              clientName: "Carlos Ruiz",
              title: "Seguimiento",
              startTime: "2026-10-15T12:00:00",
              endTime: "2026-10-15T13:00:00",
              status: "CANCELLED",
              therapistUuid,
            },
          ],
        } as Response;
      }
      if (url === "/api/backend/clinic/directory") {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              therapistUuid,
              fullName: "Bo Jensen",
              specialty: "Traumaterapi",
              weeklyScheduleJson: JSON.stringify(getDefaultWeeklySchedule()),
              services: [
                {
                  code: "INITIAL_60",
                  title: "Sesión individual (60 min)",
                  durationMinutes: 60,
                  priceDkk: 950,
                },
              ],
            },
          ],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    render(
      <CachedI18nProvider initialLocale="es" initialMessages={{}}>
        <AuthProvider
          user={{
            id: therapistUuid,
            name: "Bo Jensen",
            email: "bo@clinic.dk",
            roles: ["THERAPIST"],
          }}
        >
          <AppointmentFeatureView />
        </AuthProvider>
      </CachedI18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Lucía Gómez")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("toggle-timefold-panel"));
    fireEvent.click(screen.getByTestId("toggle-weekly-schedule"));

    const bodyText = document.body.textContent ?? "";
    for (const expectedSpanish of [
      "Citas y Reservas",
      "Terapeuta",
      "Servicio / Tratamiento",
      "Seleccionar servicio",
      "Título de la sesión",
      "Hora de inicio",
      "Hora de fin",
      "Reservar cita",
      "Aplicar",
      "Horarios IA Timefold",
      "Horarios y Pausas",
      "Confirmada",
      "Historial",
      "Reprogramar",
      "Cancelar",
      "OCT",
      "mié 14 oct 2026",
      "Lunes",
    ]) {
      expect(bodyText).toContain(expectedSpanish);
    }

    for (const unexpectedDanish of [
      "Aftaler & Tidsbestilling",
      "Behandler",
      "Ydelse / Forløb",
      "Vælg ydelse",
      "Starttidspunkt",
      "Sluttidspunkt",
      "Anvend",
      "Bekræftet",
      "OKT",
    ]) {
      expect(bodyText).not.toContain(unexpectedDanish);
    }
  });

  it("paginates >10 appointments and hides commit SHAs when portalMode='client'", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/backend/appointments") {
        const twelve: AppointmentDto[] = Array.from({ length: 12 }, (_, idx) => ({
          id: `pg-apt-${idx + 1}`,
          clientName: `Klient ${String(idx + 1).padStart(2, "0")}`,
          startTime: `2026-12-${String(idx + 10).padStart(2, "0")}T10:00:00`,
          status: "CONFIRMED",
        }));
        return { ok: true, status: 200, json: async () => twelve } as Response;
      }
      if (url === "/api/backend/appointments/pg-apt-1/git-history") {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              commitHash: "deadbeef1234",
              author: "Dr. Bo Jensen",
              timestamp: "2026-11-15T10:00:00Z",
              message: "Booket konsultation",
              snapshot: "{}",
            },
          ],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    global.fetch = fetchMock;

    render(<AppointmentFeatureView portalMode="client" />);

    await waitFor(() => {
      expect(screen.getByText("Klient 01")).toBeDefined();
    });
    expect(screen.queryByTestId("toggle-weekly-schedule")).toBeNull();
    expect(screen.queryByText("Klient 11")).toBeNull();
    expect(screen.getByTestId("booking-pagination")).toBeDefined();

    fireEvent.click(screen.getByTestId("booking-next-page"));
    expect(screen.getByText("Klient 11")).toBeDefined();
    expect(screen.queryByText("Klient 01")).toBeNull();

    fireEvent.click(screen.getByTestId("booking-prev-page"));
    expect(screen.getByText("Klient 01")).toBeDefined();

    fireEvent.click(screen.getByTestId("git-history-btn-pg-apt-1"));
    await waitFor(() => {
      expect(screen.getByText("Booket konsultation")).toBeDefined();
    });
    expect(screen.queryByTestId("technical-audit-history-pg-apt-1")).toBeNull();
    expect(screen.queryByText("deadbeef")).toBeNull();
    cleanup();
  });

  it("covers helper deduplication/formatting branches, window date filtering, duration chips, Timefold slot apply, and empty-day interval add", async () => {
    expect(deduplicateProviders([null as never, {} as never, { id: "p-id-only" } as never, { displayName: "Navn" } as never])).toHaveLength(2);
    expect(deduplicateServices([null as never, {} as never, { id: "s-only", name: "S-Only" } as never, { name: "Klinik" } as never])).toHaveLength(3);
    expect(formatMinutes(0, true)).toBe("0 hrs");
    expect(formatMinutes(0, false)).toBe("0 timer");
    expect(formatMinutes(45, false)).toBe("45 min");
    expect(formatMinutes(120, true)).toBe("2 hrs");
    expect(formatMinutes(120, false)).toBe("2 timer");
    expect(formatMinutes(135, true)).toBe("2h 15m");
    expect(formatMinutes(135, false)).toBe("2t 15m");

    let currentList: AppointmentDto[] = [
      {
        id: "apt-noclient",
        clientName: "",
        title: "",
        startTime: "bad-date-format",
        status: "CONFIRMED",
      },
      {
        clientName: "Uden ID Klient",
        startTime: "2026-12-20T09:00:00",
        status: "CONFIRMED",
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/api/backend/clinic/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [
              { id: "prov-1", userUuid: "th-uuid-1", displayName: "Dr. Sofie", organisationName: "Nordic" },
            ],
            services: [
              { id: "srv-45", name: "Fokuseret Samtale", durationMinutes: 45, providerProfileId: "prov-1" },
              { id: "srv-60", name: "Udvidet Samtale", durationMinutes: 60, providerProfileId: "prov-1" },
            ],
          }),
        };
      }
      if (url.includes("/api/backend/appointments/timefold-slots")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            therapistUuid: "th-uuid-1",
            date: "2026-12-10",
            durationMinutes: 60,
            recommendedSlot: "2026-12-10T10:00:00",
            slots: [],
          }),
        };
      }
      if (url.includes("/api/backend/appointments/client/")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "apt-win-1",
              clientName: "Klient Live",
              title: "Vindue-aftale",
              startTime: "2026-12-12T10:00:00",
              endTime: "2026-12-12T11:00:00",
              status: "CONFIRMED",
            },
          ],
        };
      }
      if (url.includes("/api/backend/appointments/apt-win-1") && method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "apt-win-1",
            clientName: "Klient Live",
            title: "Vindue-aftale",
            startTime: "2026-12-12T12:00",
            endTime: "2026-12-12T13:00",
            status: "CONFIRMED",
          }),
        };
      }
      if (url.includes("/api/backend/appointments/apt-win-1") && method === "DELETE") {
        return { ok: true, status: 204 };
      }
      if (url.endsWith("/api/backend/appointments") && method === "GET") {
        return { ok: true, status: 200, json: async () => currentList };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    global.fetch = fetchMock;

    render(
      <AuthProvider
        user={{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Klient Live",
          email: "live@klient.dk",
          roles: ["CLIENT"],
        }}
      >
        <AppointmentFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Uden ID Klient")).toBeDefined();
    });

    // Apply empty date filter (resets windowItems to null), then with from & to dates
    fireEvent.click(screen.getByTestId("apply-date-filter"));
    fireEvent.change(screen.getByTestId("filter-date-from"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByTestId("filter-date-to"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByTestId("apply-date-filter"));

    await waitFor(() => {
      expect(screen.getByTestId("reschedule-btn-apt-win-1")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("from=2026-12-01&to=2026-12-31"),
      expect.anything()
    );

    // Search query filtering + clear
    fireEvent.change(screen.getByTestId("filter-appointment-search"), { target: { value: "Vindue" } });
    expect(screen.getByText(/Vindue-aftale/)).toBeDefined();
    fireEvent.change(screen.getByTestId("filter-appointment-search"), { target: { value: "" } });

    // Select service before startTime, click duration chip with empty startTime, then select service after startTime
    fireEvent.change(screen.getByTestId("select-service"), { target: { value: "srv-45" } });
    fireEvent.click(screen.getByTestId("duration-chip-45"));
    fireEvent.change(screen.getByTestId("select-service"), { target: { value: "srv-60" } });
    expect((screen.getByTestId("input-endTime") as HTMLInputElement).value).toContain("T");

    // Timefold recommended slot apply
    fireEvent.click(screen.getByTestId("toggle-timefold-panel"));
    fireEvent.click(screen.getByTestId("fetch-timefold-slots"));
    await waitFor(() => {
      expect(screen.getByTestId("apply-recommended-slot")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("apply-recommended-slot"));

    // Reschedule & delete while windowItems is active
    fireEvent.click(screen.getByTestId("reschedule-btn-apt-win-1"));
    fireEvent.change(screen.getByTestId("reschedule-start-apt-win-1"), {
      target: { value: "2026-12-12T12:00" },
    });
    fireEvent.change(screen.getByTestId("reschedule-end-apt-win-1"), {
      target: { value: "2026-12-12T13:00" },
    });
    fireEvent.click(screen.getByTestId("reschedule-save-apt-win-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("reschedule-panel-apt-win-1")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("delete-booking-apt-win-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.queryByTestId("delete-booking-apt-win-1")).toBeNull();
    });
    cleanup();

    // Therapist weekly schedule enable SAT and add interval
    render(
      <AuthProvider
        user={{
          id: "22222222-2222-4222-8222-222222222222",
          name: "Dr. Sofie",
          email: "sofie@klinik.dk",
          roles: ["PROVIDER"],
        }}
      >
        <AppointmentFeatureView />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("toggle-weekly-schedule")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("toggle-weekly-schedule"));
    fireEvent.click(screen.getByTestId("day-enabled-saturday"));
    fireEvent.click(screen.getByTestId("add-interval-saturday"));
    expect(screen.getByTestId("weekly-schedule-panel").textContent).toContain("08:30");
    cleanup();
  });
});

