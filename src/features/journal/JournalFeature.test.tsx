import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  JournalFeatureView,
  filterInternalNotes,
  computeCommitDelta,
  cleanAppointmentReference,
  classifyCommit,
  formatReadableAuthorName,
  parseCommitMetadata,
  computeInitials,
} from "./JournalFeature";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";
import { AuthProvider } from "../../core/baseUiCore";

describe("JournalFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Pure Journal & JGit Domain Functions", () => {
    it("filters INTERNAL_MEDICAL_NOTES for non-therapist views while keeping therapist views intact", () => {
      const raw =
        "Public reflection\n<!-- INTERNAL_MEDICAL_NOTES_START -->Secret clinical note<!-- INTERNAL_MEDICAL_NOTES_END -->\nAfter block\n<!-- INTERNAL_MEDICAL_NOTES -->Trailing confidential";
      expect(filterInternalNotes(null, false)).toBe("");
      expect(filterInternalNotes(raw, true)).toBe(raw);
      expect(filterInternalNotes(raw, false)).toBe("Public reflection\n\nAfter block");
    });

    it("computes commit deltas, cleans appointment references, and classifies commits", () => {
      expect(computeCommitDelta("First entry", "")).toBe("First entry");
      expect(computeCommitDelta("Same", "Same")).toBe("");
      expect(computeCommitDelta("Line 1\nLine 2", "Line 1")).toBe("Line 2");
      expect(computeCommitDelta("A\nB\nC", "A\nX")).toBe("B\nC");

      expect(cleanAppointmentReference(null)).toBe("");
      expect(
        cleanAppointmentReference(
          "123e4567-e89b-12d3-a456-426614174000 (Trauma Session 2026-10-14 kl. 10:0)"
        )
      ).toBe("Trauma Session 14. okt. 2026 kl. 10:00");
      expect(
        cleanAppointmentReference("123e4567-e89b-12d3-a456-426614174000")
      ).toBe("Aftale");

      expect(classifyCommit("Aftale oprettet", "", "system")).toBe("APPOINTMENT");
      expect(
        classifyCommit("Entry", "INTERNAL_MEDICAL_NOTES", "bjens")
      ).toBe("CONFIDENTIAL");
      expect(classifyCommit("Terapeut opfølgning", "Delta", "dr. bo")).toBe(
        "THERAPIST"
      );
      expect(classifyCommit("Tanker i dag", "Jeg havde en god dag", "anders")).toBe(
        "CLIENT"
      );
    });

    it("formats readable author names, parses metadata, and computes initials", () => {
      expect(formatReadableAuthorName("", "APPOINTMENT")).toBe("Klinik Booking");
      expect(formatReadableAuthorName("bjens", "THERAPIST")).toBe(
        "Bo Jensen (Terapeut)"
      );
      expect(formatReadableAuthorName("anders_sand", "CLIENT")).toBe(
        "Anders Sand"
      );
      expect(formatReadableAuthorName("", "CLIENT")).toBe("Anders Sand");
      expect(formatReadableAuthorName("", "THERAPIST")).toBe(
        "Bo Jensen (Terapeut)"
      );
      expect(formatReadableAuthorName("mette.lind", "THERAPIST")).toBe(
        "Mette Lind (Terapeut)"
      );
      expect(formatReadableAuthorName("soren.kierkegaard", "CLIENT")).toBe(
        "Soren Kierkegaard"
      );
      expect(formatReadableAuthorName("Custom Name", "CLIENT")).toBe(
        "Custom Name"
      );

      const meta1 = parseCommitMetadata(
        "Mood: 8/10\nShared: true\nRefs-Commit: #abcdef12\nRefs-Appointment: Apt-1",
        ""
      );
      expect(meta1).toEqual({
        moodScore: 8,
        isShared: true,
        referencedCommitHash: "abcdef12",
        referencedAppointment: "Apt-1",
      });

      const meta2 = parseCommitMetadata("delt med terapeut", "");
      expect(meta2.isShared).toBe(true);

      const meta3 = parseCommitMetadata("privat notat", "");
      expect(meta3.isShared).toBe(false);

      const meta4 = parseCommitMetadata("Mood: 99/10", "");
      expect(meta4.moodScore).toBeNull();

      expect(computeInitials("Dr. Bo Jensen (Terapeut)")).toBe("BJ");
      expect(computeInitials("Anders")).toBe("AN");
      expect(computeInitials("")).toBe("UK");
      expect(computeInitials("()")).toBe("UK");
      expect(computeCommitDelta("", "prev")).toBe("");
      expect(classifyCommit("", "", "")).toBe("CLIENT");
      expect(formatReadableAuthorName("dr.bo_jensen", "CONFIDENTIAL")).toBe(
        "Dr Bo Jensen (Terapeut)"
      );
    });
  });

  describe("JournalFeatureView CRUD + DomainGuard + ProblemDetail", () => {
    it("renders journal entries, creates a new entry, and deletes it", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "j-1",
            title: "Dag 1",
            content: "God søvn<!-- INTERNAL_MEDICAL_NOTES -->Secret",
            moodRating: 8,
          },
        ],
      });

      render(<JournalFeatureView />);

      await waitFor(() => {
        expect(screen.getByText("Dag 1")).toBeDefined();
        expect(screen.getByText("God søvn")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("input-journal-title"), {
        target: { value: "Dag 2" },
      });
      fireEvent.change(screen.getByTestId("input-journal-content"), {
        target: { value: "Gik en lang tur" },
      });
      fireEvent.change(screen.getByTestId("input-journal-mood"), {
        target: { value: "9" },
      });
      fireEvent.click(screen.getByTestId("input-journal-shared"));

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "j-2",
          title: "Dag 2",
          content: "Gik en lang tur",
          moodRating: 9,
          sharedWithTherapist: false,
        }),
      });

      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => {
        expect(screen.getByText("Dag 2")).toBeDefined();
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });
      fireEvent.click(screen.getByTestId("delete-journal-j-2"));

      await waitFor(() => {
        expect(screen.queryByText("Dag 2")).toBeNull();
      });
    });

    it("enforces DomainGuard mood bounds (1..10) and renders ProblemDetail", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      });

      render(<JournalFeatureView />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByTestId("input-journal-title"), {
        target: { value: "Ugyldigt humør" },
      });
      fireEvent.change(screen.getByTestId("input-journal-content"), {
        target: { value: "Indhold" },
      });
      fireEvent.change(screen.getByTestId("input-journal-mood"), {
        target: { value: "15" },
      });
      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => {
        expect(
          screen.getByTestId("error-banner").getAttribute("data-error-code")
        ).toBe("VALIDATION_FAILED");
        expect(
          screen.getByTestId("field-error-moodRating").textContent
        ).toContain("Mood rating must be between 1 and 10");
      });

      const problem: ProblemDetail = {
        type: "about:blank",
        title: "Internal Error",
        status: 500,
        detail: "JGit repository lock failed",
        errorCode: ErrorCode.INTERNAL_ERROR,
        timestamp: new Date().toISOString(),
      };
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => problem,
      });

      fireEvent.change(screen.getByTestId("input-journal-mood"), {
        target: { value: "6" },
      });
      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => {
        expect(
          screen.getByTestId("error-banner").getAttribute("data-error-code")
        ).toBe("INTERNAL_ERROR");
      });
    });

    it("enforces RoleGuard allowed=['PROVIDER'] and pending AuthProvider without calling fetch", async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const { rerender } = render(
        <AuthProvider user={null}>
          <JournalFeatureView />
        </AuthProvider>
      );

      expect(screen.queryByTestId("journal-feature-view")).toBeNull();
      expect(screen.queryByTestId("forbidden-notice")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      rerender(
        <AuthProvider
          user={{
            id: "c-1",
            name: "Anders Sand",
            email: "anders@client.dk",
            roles: ["CLIENT"],
          }}
        >
          <JournalFeatureView />
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.queryByTestId("journal-feature-view")).toBeNull();
        expect(screen.getByTestId("forbidden-notice")).toBeDefined();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
