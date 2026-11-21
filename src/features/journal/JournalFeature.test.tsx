import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  JournalFeatureView,
  PatientTimelineContainer,
  SemanticTimelineStream,
  VerticalZoomScrollbar,
  JournalDetailInspector,
  clampNumber,
  resolveSemanticZoomTier,
  computeThumbMetrics,
  computeDragUpdate,
  parseSoapSections,
  mapBundleToClinicalTimelineEvents,
  getReferenceClinicalTimelineEvents,
  filterInternalNotes,
  computeCommitDelta,
  cleanAppointmentReference,
  classifyCommit,
  formatReadableAuthorName,
  parseCommitMetadata,
  computeInitials,
  ClinicalJournalEvent,
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
      expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
      fireEvent.click(screen.getByTestId("confirm-action-cancel"));
      expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
      expect(screen.getByText("Dag 2")).toBeDefined();

      fireEvent.click(screen.getByTestId("delete-journal-j-2"));
      fireEvent.click(screen.getByTestId("confirm-action-accept"));

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

    it("supports portalMode='client' diary with active handshake checkboxes and privacy filtering", async () => {
      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/clinic/handshakes/client/")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                id: "hs-1",
                therapistUuid: "th-1",
                therapistName: "Maja Lindholm",
                status: "ACTIVE",
              },
              {
                id: "hs-2",
                therapistUuid: "th-2",
                therapistName: "Paused Therapist",
                status: "REVOKED",
              },
            ],
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "cj-1",
              clientUuid: "c-1",
              title: "Klientrefleksion",
              content: "Ro i dag<!-- INTERNAL_MEDICAL_NOTES -->Skjult note",
              moodRating: 8,
              sharedWithTherapists: true,
            },
            {
              id: "cj-other",
              clientUuid: "c-other",
              title: "Anden borgers dagbog",
              content: "Skal filtreres væk",
            },
          ],
        };
      });
      global.fetch = fetchMock;

      render(
        <AuthProvider
          user={{
            id: "c-1",
            name: "Anders Sand",
            email: "anders@client.dk",
            roles: ["CLIENT"],
          }}
        >
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Klientrefleksion")).toBeDefined();
      });
      expect(screen.queryByText("Anden borgers dagbog")).toBeNull();
      expect(screen.getByText("Ro i dag")).toBeDefined();

      // Enable sharing with active therapist
      fireEvent.click(screen.getByTestId("input-journal-shared"));
      await waitFor(() => {
        expect(screen.getByTestId("share-therapist-checkbox-th-1")).toBeDefined();
      });
      // Toggle checkbox off & on again
      fireEvent.click(screen.getByTestId("share-therapist-checkbox-th-1"));
      fireEvent.click(screen.getByTestId("share-therapist-checkbox-th-1"));

      fireEvent.change(screen.getByTestId("input-journal-title"), {
        target: { value: "Delt refleksion" },
      });
      fireEvent.change(screen.getByTestId("input-journal-content"), {
        target: { value: "Delte tanker med Maja" },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "cj-2",
          clientUuid: "c-1",
          title: "Delt refleksion",
          content: "Delte tanker med Maja",
          moodRating: 7,
          sharedWithTherapists: true,
          sharedTherapistUuids: ["th-1"],
        }),
      });
      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => {
        expect(screen.getByText("Delt refleksion")).toBeDefined();
      });
    });

    it("shows empty handshake guidance when client has no active handshakes", async () => {
      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/clinic/handshakes/client/")) {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      global.fetch = fetchMock;

      render(
        <AuthProvider
          user={{
            id: "c-no-hs",
            name: "Ny Klient",
            email: "ny@client.dk",
            roles: ["CLIENT"],
          }}
        >
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      fireEvent.click(screen.getByTestId("input-journal-shared"));
      await waitFor(() => {
        expect(screen.getByTestId("no-active-handshakes-tip")).toBeDefined();
      });
    });

    it("toggles the inline semantic timeline lazily when clicked in provider view", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });
      global.fetch = fetchMock;

      render(<JournalFeatureView portalMode="provider" />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      expect(screen.queryByTestId("inline-semantic-timeline-panel")).toBeNull();
      fireEvent.click(screen.getByTestId("toggle-semantic-timeline"));

      await waitFor(() => {
        expect(screen.getByTestId("inline-semantic-timeline-panel")).toBeDefined();
        expect(screen.getByTestId("patient-timeline-container")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("toggle-semantic-timeline"));
      expect(screen.queryByTestId("inline-semantic-timeline-panel")).toBeNull();
    });
  });

  describe("Vertikal Semantisk Zoom-Tidslinje", () => {
    it("computes zoom tiers, ViewportThumb metrics, drag updates, SOAP parsing, and bundle mapping", () => {
      expect(clampNumber(Number.NaN, 15, 100)).toBe(15);
      expect(clampNumber(5, 15, 100)).toBe(15);
      expect(clampNumber(150, 15, 100)).toBe(100);
      expect(clampNumber(42, 15, 100)).toBe(42);

      expect(resolveSemanticZoomTier(15)).toBe("macro");
      expect(resolveSemanticZoomTier(37)).toBe("macro");
      expect(resolveSemanticZoomTier(38)).toBe("meso");
      expect(resolveSemanticZoomTier(74)).toBe("meso");
      expect(resolveSemanticZoomTier(75)).toBe("micro");
      expect(resolveSemanticZoomTier(100)).toBe("micro");

      expect(computeThumbMetrics(15, 0)).toEqual({
        thumbHeightPct: 85,
        maxTop: 15,
        topPct: 0,
      });
      expect(computeThumbMetrics(100, 1)).toEqual({
        thumbHeightPct: 30,
        maxTop: 70,
        topPct: 70,
      });
      expect(computeThumbMetrics(55, 0.5)).toEqual({
        thumbHeightPct: 63.75,
        maxTop: 36.25,
        topPct: 18.125,
      });

      // Exact spec formulas + JSDOM zero trackHeight fallback (240px)
      expect(
        computeDragUpdate({
          mode: "zoomTop",
          dy: 60,
          trackHeight: 0,
          startZoom: 50,
          startRatio: 0.2,
          currentZoom: 50,
        })
      ).toEqual({ zoomLevel: 85, scrollRatio: 0.2 });

      expect(
        computeDragUpdate({
          mode: "zoomBottom",
          dy: -60,
          trackHeight: 240,
          startZoom: 50,
          startRatio: 0.5,
          currentZoom: 50,
        })
      ).toEqual({ zoomLevel: 85, scrollRatio: 0.5 });

      const scrollUpdate = computeDragUpdate({
        mode: "scroll",
        dy: 40,
        trackHeight: 200,
        startZoom: 60,
        startRatio: 0,
        currentZoom: 60,
      });
      expect(scrollUpdate.zoomLevel).toBe(60);
      expect(scrollUpdate.scrollRatio).toBeGreaterThan(0);

      const structuredSoap = parseSoapSections(
        "S: Bedre nattesøvn.\nO: Rolig fremtoning.\nA: Fremgang på PCL-5.\nP: Fortsæt IRT.",
        "Opsummering",
        "da"
      );
      expect(structuredSoap).toEqual({
        subjective: "Bedre nattesøvn.",
        objective: "Rolig fremtoning.",
        assessment: "Fremgang på PCL-5.",
        plan: "Fortsæt IRT.",
      });

      const fallbackSoap = parseSoapSections("", "Fritekst uden markører", "en");
      expect(fallbackSoap.subjective).toBe("Fritekst uden markører");
      expect(fallbackSoap.objective).toContain("Clinical observation");
      expect(parseSoapSections("", "", "en").subjective).toContain("Clinical observation");
      expect(mapBundleToClinicalTimelineEvents({})).toEqual([]);
      const untitledBundle = mapBundleToClinicalTimelineEvents({
        entries: [{ title: "Samtale", content: "Rolig" }],
        clinicalNotes: [{ content: "O: Stabil note", createdAt: "2026-05-01" }],
      });
      expect(untitledBundle.length).toBe(2);

      const mapped = mapBundleToClinicalTimelineEvents(
        {
          entries: [
            {
              id: "e1",
              title: "Opstart Diagnose & Mål",
              content: "F43.1 baseline<!-- INTERNAL_MEDICAL_NOTES -->Skjult",
              moodRating: 4,
              timestamp: "2024-09-10T10:00:00",
              gitCommitHash: "abcdef123456",
            },
            {
              id: "e2",
              title: "Tiltag: Søvnmedicin",
              content: "Stabilisering",
              moodRating: 7,
              createdAt: "2025-05-01",
            },
            {
              id: "e3",
              title: "Samtale opfølgning",
              content: "Tilbagefald",
              moodRating: 5,
            },
          ],
          clinicalNotes: [
            {
              id: "n1",
              title: "Klinisk notat",
              confidentialMarkdown: "S: Stabil\nP: Opfølgning",
              authorTherapistName: "Bo Jensen",
              organisationName: "Klinik Nord",
              gitCommitHash: "1234567890",
              createdAt: "2026-02-15T14:30:00",
            },
            {
              confidentialMarkdown: "Tiltag: Eksponering i gang",
              createdAt: "",
            },
          ],
          commits: [
            {
              commitHash: "9988776655",
              author: "bijens",
              timestamp: "2026-04-01T09:15:00",
              message: "Revision v2",
              snapshot: "Opdateret epikrise",
            },
            {
              commitHash: "",
              author: "",
              timestamp: "",
              message: "",
              snapshot: "",
            },
          ],
        },
        "da"
      );

      expect(mapped.length).toBe(7);
      expect(mapped[0].date).toBe("2026-04-01");
      expect(mapped.find((e) => e.id === "e1")?.who5Score).toBe("40 / 100");
      expect(mapped.find((e) => e.id === "e2")?.who5Score).toBe("70 / 100 (+30)");
      expect(mapped.find((e) => e.id === "e3")?.who5Score).toBe("50 / 100 (-20)");
      expect(mapped.find((e) => e.id === "e1")?.lane).toBe("goals");
      expect(mapped.find((e) => e.id === "e2")?.lane).toBe("interventions");
      expect(mapped.find((e) => e.id === "n1")?.tag).toBe("Klinik Nord");

      (["da", "en", "fr", "es", "de"] as const).forEach((loc) => {
        const ref = getReferenceClinicalTimelineEvents(loc);
        expect(ref.length).toBe(6);
        expect(ref.map((e) => e.date.slice(0, 4))).toContain("2026");
        expect(ref.map((e) => e.date.slice(0, 4))).toContain("2025");
        expect(ref.map((e) => e.date.slice(0, 4))).toContain("2024");
      });
    });

    it("switches semantic zoom levels (Macro, Meso, Micro), filters lanes, and opens/closes inspector", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });
      global.fetch = fetchMock;

      render(<PatientTimelineContainer />);

      await waitFor(() => {
        expect(screen.getByTestId("timeline-year-2026")).toBeDefined();
        expect(screen.getByTestId("timeline-year-2025")).toBeDefined();
        expect(screen.getByTestId("timeline-year-2024")).toBeDefined();
      });

      const firstCard = screen.getByTestId("timeline-event-card-ref-2026-session-18");
      expect(firstCard.getAttribute("data-zoom-tier")).toBe("meso");

      // Switch to Macro (< 38)
      fireEvent.click(screen.getByTestId("zoom-preset-macro"));
      expect(
        screen
          .getByTestId("timeline-event-card-ref-2026-session-18")
          .getAttribute("data-zoom-tier")
      ).toBe("macro");
      expect(screen.getByTestId("zoom-percentage-value").textContent).toBe("25%");

      // Switch to Micro (>= 75) -> displays 2x2 SOAP grid & auditLog
      fireEvent.click(screen.getByTestId("zoom-preset-micro"));
      expect(
        screen
          .getByTestId("timeline-event-card-ref-2026-session-18")
          .getAttribute("data-zoom-tier")
      ).toBe("micro");
      expect(
        screen.getAllByText(/Oprettet af aut\. psykolog M\. Vestergaard/).length
      ).toBeGreaterThan(0);

      // Switch back to Meso via preset button
      fireEvent.click(screen.getByTestId("zoom-preset-meso"));
      expect(
        screen
          .getByTestId("timeline-event-card-ref-2026-session-18")
          .getAttribute("data-zoom-tier")
      ).toBe("meso");

      // Category filtering
      fireEvent.click(screen.getByTestId("timeline-filter-goals"));
      expect(
        screen.queryByTestId("timeline-event-card-ref-2026-session-18")
      ).toBeNull();
      expect(
        screen.getByTestId("timeline-event-card-ref-2025-goal-update")
      ).toBeDefined();

      fireEvent.click(screen.getByTestId("timeline-filter-all"));
      expect(
        screen.getByTestId("timeline-event-card-ref-2026-session-18")
      ).toBeDefined();

      // Click & keyboard Enter open/close JournalDetailInspector
      fireEvent.keyDown(
        screen.getByTestId("timeline-event-card-ref-2026-session-18"),
        { key: "Enter" }
      );
      expect(screen.getByTestId("journal-detail-inspector")).toBeDefined();

      fireEvent.click(screen.getByTestId("close-detail-inspector"));
      expect(screen.queryByTestId("journal-detail-inspector")).toBeNull();

      // Space toggles inspector on and clicking the card toggles it off
      fireEvent.keyDown(
        screen.getByTestId("timeline-event-card-ref-2026-session-18"),
        { key: " " }
      );
      expect(screen.getByTestId("journal-detail-inspector")).toBeDefined();
      fireEvent.keyDown(
        screen.getByTestId("timeline-event-card-ref-2026-session-18"),
        { key: "Tab" }
      );
      fireEvent.click(
        screen.getByTestId("timeline-event-card-ref-2026-session-18")
      );
      expect(screen.queryByTestId("journal-detail-inspector")).toBeNull();
    });

    it("supports pointer/touch dragging, keyboard shortcuts, wheel zoom, range slider, and scroll sync", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });
      global.fetch = fetchMock;

      const { unmount } = render(<PatientTimelineContainer initialZoomLevel={55} />);

      const track = screen.getByTestId("zoom-scrollbar-track");
      expect(track.getAttribute("role")).toBe("slider");
      expect(track.getAttribute("aria-label")).toBe(
        "Zoom detaljegrad i patientjournal"
      );
      expect(track.getAttribute("aria-valuemin")).toBe("15");
      expect(track.getAttribute("aria-valuemax")).toBe("100");
      expect(track.getAttribute("aria-valuenow")).toBe("55");

      // Mouse drag zoomTop down -> increases zoomLevel
      fireEvent.mouseDown(screen.getByTestId("zoom-handle-top"), { clientY: 100 });
      fireEvent.mouseMove(window, { clientY: 160 });
      fireEvent.mouseUp(window);
      expect(Number(track.getAttribute("aria-valuenow"))).toBeGreaterThan(55);

      // Touch drag zoomBottom down -> decreases zoomLevel
      const beforeBottom = Number(track.getAttribute("aria-valuenow"));
      vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
        height: 240,
        width: 120,
        top: 0,
        left: 0,
        right: 120,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      fireEvent.touchStart(screen.getByTestId("zoom-handle-bottom"), {
        touches: [{ clientY: 100 }],
      });
      fireEvent.touchMove(window, { touches: [{ clientY: 150 }] });
      fireEvent.touchEnd(window);
      expect(Number(track.getAttribute("aria-valuenow"))).toBeLessThan(
        beforeBottom
      );

      // Middle thumb scroll drag + bidirectional scroll sync on stream
      const stream = screen.getByTestId("semantic-timeline-stream");
      Object.defineProperty(stream, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(stream, "clientHeight", { value: 200, configurable: true });

      fireEvent.mouseDown(screen.getByTestId("zoom-handle-scroll"), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 90 });
      fireEvent.mouseUp(window);
      expect(stream.scrollTop).toBeGreaterThan(0);

      stream.scrollTop = 400;
      fireEvent.scroll(stream);
      Object.defineProperty(stream, "scrollHeight", { value: 200, configurable: true });
      fireEvent.scroll(stream);

      // Keyboard +, =, -, _, ArrowDown, ArrowUp, Tab & Wheel (up/down, non-ctrl) + Range slider
      fireEvent.keyDown(track, { key: "=" });
      fireEvent.keyDown(track, { key: "_" });
      fireEvent.keyDown(track, { key: "Tab" });
      fireEvent.keyDown(track, { key: "+" });
      expect(screen.getByTestId("zoom-percentage-value").textContent).not.toBe("15%");
      fireEvent.keyDown(track, { key: "-" });
      fireEvent.keyDown(track, { key: "ArrowDown" });
      fireEvent.keyDown(track, { key: "ArrowUp" });

      fireEvent.wheel(track, { deltaY: -100 });
      fireEvent.wheel(track, { deltaY: 100 });
      fireEvent.wheel(stream, { deltaY: 100, ctrlKey: false });
      fireEvent.wheel(stream, { deltaY: -100, metaKey: true });
      fireEvent.wheel(stream, { deltaY: 100, ctrlKey: true });

      fireEvent.change(screen.getByTestId("zoom-range-slider"), {
        target: { value: "82" },
      });
      expect(screen.getByTestId("zoom-percentage-value").textContent).toBe("82%");

      // Let requestAnimationFrame scroll-preservation run cleanly
      await new Promise((resolve) => setTimeout(resolve, 35));

      unmount();
    });

    it("loads live patient bundles, handles empty client states, and respects RoleGuard", async () => {
      const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/clinic/clients")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              null,
              { id: "c-self-id", userId: "th-1", fullName: "Bo Jensen", email: "other@klinik.dk" },
              { id: "c-self-mail", userId: "u-self-mail", fullName: "Bo Kopi", email: "BO@klinik.dk" },
              { id: "c-dr", userId: "u-dr", fullName: "Dr. Maja Lindholm" },
              { id: "c-ter", userId: "u-ter", fullName: "sofie_terapeut" },
              { id: "c-1", userId: "u-client-1", fullName: "Anders Sand" },
              { id: "c-dup", userId: "u-client-1", fullName: "Dup Anders" },
              { id: "c-dup-name", userId: "u-dup-name", fullName: "anders sand ", email: "anders.dup@sand.dk" },
              { id: "c-full-email", userId: "u-client-mail", fullName: "Nora Vester", email: "nora@vester.dk" },
              { id: "" },
              { id: "u-client-empty", email: "empty@client.dk" },
              { id: "u-client-idonly" },
            ],
          };
        }
        if (url.includes("/api/backend/journals/client/u-client-1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              clientUuid: "u-client-1",
              entries: [
                {
                  id: "live-1",
                  title: "Live Session Notat",
                  content: "S: God energi i dag\nP: Ny samtale om 2 uger",
                  moodRating: 8,
                  timestamp: "2026-09-01T10:30:00",
                },
              ],
              clinicalNotes: [],
            }),
          };
        }
        if (url.includes("/api/backend/journals/history/u-client-1")) {
          return {
            ok: true,
            status: 200,
            json: async () => [],
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      });
      global.fetch = fetchMock;

      // Verify offline fetch catch fallback & non-array payload tolerance
      fetchMock.mockRejectedValueOnce(new Error("Network offline"));
      const offlineRender = render(<PatientTimelineContainer />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      offlineRender.unmount();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ invalid: true }),
      });
      const nonArrayRender = render(<PatientTimelineContainer />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      fireEvent.change(
        screen.getByTestId("timeline-client-select"),
        { target: { value: "demo-multiyear" } }
      );
      nonArrayRender.unmount();

      const { rerender } = render(
        <AuthProvider
          user={{
            id: "th-1",
            name: "Bo Jensen",
            email: "bo@klinik.dk",
            roles: ["PROVIDER"],
          }}
        >
          <PatientTimelineContainer />
        </AuthProvider>
      );

      const select = await screen.findByTestId("timeline-client-select");
      await waitFor(() => {
        expect(select.innerHTML).toContain("Anders Sand");
        expect(select.innerHTML).toContain("Nora Vester (nora@vester.dk)");
      });
      expect(select.innerHTML).not.toContain("Bo Jensen");
      expect(select.innerHTML).not.toContain("Bo Kopi");
      expect(select.innerHTML).not.toContain("Dr. Maja Lindholm");
      expect(select.innerHTML).not.toContain("sofie_terapeut");
      expect(select.innerHTML).not.toContain("anders.dup@sand.dk");

      fireEvent.change(select, { target: { value: "u-client-1" } });
      await waitFor(() => {
        expect(screen.getByTestId("timeline-event-card-live-1")).toBeDefined();
      });

      // Select empty client and click fallback CTA to reload reference history
      fireEvent.change(select, { target: { value: "u-client-empty" } });
      await waitFor(() => {
        expect(screen.getByTestId("timeline-empty-state")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("timeline-load-demo-btn"));
      await waitFor(() => {
        expect(
          screen.getByTestId("timeline-event-card-ref-2026-session-18")
        ).toBeDefined();
      });

      // Custom events prop + single-event scrollbar branch + RoleGuard CLIENT rejection
      const customEvents: ClinicalJournalEvent[] = [
        {
          id: "single-ev",
          date: "2026-01-01",
          lane: "revisions",
          tag: "Rev",
          title: "Single",
          summary: "Summary",
          version: "v1.0",
          soap: {
            subjective: "S",
            objective: "O",
            assessment: "A",
            plan: "P",
          },
          auditLog: "Audit",
        },
      ];
      rerender(
        <AuthProvider
          user={{
            id: "th-1",
            name: "Bo Jensen",
            email: "bo@klinik.dk",
            roles: ["PROVIDER"],
          }}
        >
          <PatientTimelineContainer events={customEvents} />
        </AuthProvider>
      );
      expect(screen.getByTestId("timeline-event-card-single-ev")).toBeDefined();

      rerender(
        <AuthProvider
          user={{
            id: "c-1",
            name: "Anders",
            email: "anders@client.dk",
            roles: ["CLIENT"],
          }}
        >
          <PatientTimelineContainer />
        </AuthProvider>
      );
      expect(screen.getByTestId("forbidden-notice")).toBeDefined();

      // Cover JournalFeatureView portalMode="client" forbidden notice & legacy clinicalNote content + non-array commits
      rerender(
        <AuthProvider
          user={{
            id: "th-1",
            name: "Bo",
            email: "bo@klinik.dk",
            roles: ["PROVIDER"],
          }}
        >
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );
      expect(screen.getByTestId("forbidden-notice")).toBeDefined();

      const legacyMapped = mapBundleToClinicalTimelineEvents(
        {
          entries: [],
          clinicalNotes: [{ content: "Legacy content note" }, { confidentialMarkdown: "", content: "" }],
          commits: [{ commitHash: "abc1234", author: "bijens", message: "msg", timestamp: "" }],
        },
        "da"
      );
      expect(legacyMapped).toHaveLength(3);

      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/clients")) {
          return { ok: true, status: 200, json: async () => [{ id: "c-obj", fullName: "Obj Klient" }] };
        }
        return { ok: true, status: 200, json: async () => ({ notArray: true }) };
      });
      rerender(
        <AuthProvider user={{ id: "th-obj", name: "Bo", email: "bo@klinik.dk", roles: ["PROVIDER"] }}>
          <PatientTimelineContainer />
        </AuthProvider>
      );
      const sel = await screen.findByTestId("timeline-client-select");
      fireEvent.change(sel, { target: { value: "c-obj" } });
      await waitFor(() => {
        expect(screen.getByTestId("timeline-empty-state")).toBeDefined();
      });

      // Cover unauthenticated PatientTimelineContainer (no AuthProvider -> therapistUuid undefined -> query = "")
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/clients")) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (u.includes("/api/backend/journals/client/")) {
          return { ok: true, status: 200, json: async () => ({ entries: [], clinicalNotes: [] }) };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      rerender(<PatientTimelineContainer skipRoleGuard={true} initialClientId="client-no-auth" />);
      await waitFor(() => {
        expect(screen.getByTestId("timeline-empty-state")).toBeDefined();
      });

      // Cover JournalFeatureView portalMode="client" handshakes fallbacks & visibleItems branches
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/handshakes/client/")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { therapistUuid: "t1", status: "ACTIVE" },
              { therapistUuid: "t2", organisationName: "Klinik Nord", status: "ACTIVE" },
              { therapistUuid: "t3", status: "" },
            ],
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "j-orphan", title: "Orphan", content: "S: x", moodRating: 5, sharedWithTherapist: false },
            { id: "j-uid", userId: "u-client-1", title: "ByUserId", content: "S: y", moodRating: 7, sharedWithTherapist: false },
            { id: "j-other", clientUuid: "other-client", title: "Other", content: "S: z", moodRating: 4, sharedWithTherapist: false },
          ],
        };
      });
      rerender(
        <AuthProvider user={{ id: "u-client-1", name: "Klara", email: "klara@dk.dk", roles: ["CLIENT"] }}>
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );
      const shareBox = await screen.findByTestId("input-journal-shared");
      fireEvent.click(shareBox);
      await waitFor(() => {
        expect(screen.getByTestId("share-therapist-checkbox-t1")).toBeDefined();
        expect(screen.getByTestId("share-therapist-checkbox-t2")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("share-therapist-checkbox-t1"));

      // Cover helper default parameters, invalid month fallback & timestamp badge rendering
      expect(cleanAppointmentReference("Booking 2026-99-01")).toContain("99");
      expect(parseSoapSections("S: hovedpine", "fallback").subjective).toBe("hovedpine");
      expect(getReferenceClinicalTimelineEvents().length).toBeGreaterThan(0);
      const timestampedEvents: ClinicalJournalEvent[] = [
        { ...customEvents[0], id: "ev-ts", timestamp: "10:15" },
        { ...customEvents[0], id: "ev-nots", timestamp: "" },
      ];

      // Standalone component coverage sanity
      const dummyRef = { current: null };
      render(
        <>
          <SemanticTimelineStream
            events={timestampedEvents}
            zoomLevel={90}
            selectedEventId={null}
            onSelectEvent={() => undefined}
            streamRef={dummyRef}
            onScrollRatioChange={() => undefined}
          />
          <VerticalZoomScrollbar
            zoomLevel={55}
            scrollRatio={0}
            events={timestampedEvents}
            onZoomChange={() => undefined}
            onScrollRatioChange={() => undefined}
          />
          <JournalDetailInspector
            event={timestampedEvents[0]}
            onClose={() => undefined}
          />
          <JournalDetailInspector
            event={timestampedEvents[1]}
            onClose={() => undefined}
          />
        </>
      );

      // Cover empty touches guard branches on VerticalZoomScrollbar
      const zoomHandleTop = screen.getByTestId("zoom-handle-top");
      fireEvent.touchStart(zoomHandleTop, { touches: [] });
      fireEvent.touchStart(zoomHandleTop, { touches: [{ clientY: 40 }] });
      fireEvent.touchMove(window, { touches: [] });
      fireEvent.touchEnd(window);

      // Cover non-array handshakes response + unmount cancellation guards
      let resolvePendingClients!: (v: unknown) => void;
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/handshakes/client/")) {
          return { ok: true, status: 200, json: async () => ({ notArray: true }) };
        }
        if (u.includes("/api/backend/clinic/clients")) {
          const data = await new Promise((resolve) => {
            resolvePendingClients = resolve;
          });
          return { ok: true, status: 200, json: async () => data };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      const unm1 = render(
        <AuthProvider user={{ id: "u-hs-nonarr", name: "K", email: "k@dk.dk", roles: ["CLIENT"] }}>
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      unm1.unmount();

      const unm2 = render(<PatientTimelineContainer skipRoleGuard={true} initialClientId="c-pending" />);
      unm2.unmount();
      if (resolvePendingClients) resolvePendingClients([]);
    });

    it("supports authenticated PROVIDER client selector, confidential therapist-note POST, and CLIENT branch selector", async () => {
      let notePostShouldThrow = false;
      let postCount = 0;
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        const method = init?.method ?? "GET";
        if (u.includes("/api/backend/clinic/clients")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: "cp-1", userId: "c-live-1", fullName: "Maja Klient", email: "maja@k.dk" }],
          };
        }
        if (u.includes("/api/backend/clinic/handshakes/client/")) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (u.includes("/api/backend/journals/therapist-notes") && method === "POST") {
          if (notePostShouldThrow) {
            throw new Error("note failed");
          }
          return { ok: true, status: 201, json: async () => ({ id: "tn-1" }) };
        }
        if (u.includes("/api/backend/journals") && method === "POST") {
          postCount += 1;
          const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: `j-prov-${postCount}`,
              title: body.title || `Session ${postCount}`,
              content: body.content || "Shared note",
              moodRating: body.moodRating ?? 7,
              sharedWithTherapist: true,
            }),
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      });

      const provRender = render(
        <AuthProvider user={{ id: "th-live-1", name: "Dr. Hansen", email: "hansen@klinik.dk", roles: ["PROVIDER"] }}>
          <JournalFeatureView portalMode="provider" />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByTestId("journal-client-select")).toBeDefined());
      fireEvent.change(screen.getByTestId("journal-client-select"), { target: { value: "c-live-1" } });
      fireEvent.change(screen.getByTestId("input-journal-title"), { target: { value: "Session 1" } });
      fireEvent.change(screen.getByTestId("input-journal-content"), { target: { value: "Shared note" } });
      fireEvent.change(screen.getByTestId("input-journal-internal-note"), { target: { value: "Confidential observation" } });
      fireEvent.click(screen.getByTestId("submit-journal"));
      await waitFor(() => expect(screen.getByTestId("internal-note-saved-banner")).toBeDefined());

      notePostShouldThrow = true;
      fireEvent.change(screen.getByTestId("input-journal-title"), { target: { value: "Session 2" } });
      fireEvent.change(screen.getByTestId("input-journal-content"), { target: { value: "Shared 2" } });
      fireEvent.change(screen.getByTestId("input-journal-internal-note"), { target: { value: "Fails softly" } });
      fireEvent.click(screen.getByTestId("submit-journal"));
      await waitFor(() => expect(screen.getByText("Session 2")).toBeDefined());
      provRender.unmount();

      const clientRender = render(
        <AuthProvider user={{ id: "c-branch-1", name: "Klara", email: "klara@dk.dk", roles: ["CLIENT"] }}>
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByTestId("input-journal-branch")).toBeDefined());
      fireEvent.change(screen.getByTestId("input-journal-branch"), { target: { value: "trauma" } });
      expect((screen.getByTestId("input-journal-branch") as HTMLSelectElement).value).toBe("trauma");
      clientRender.unmount();
    });

    it("renders Markdown notes, filters client journal by JGit branch, and auto-selects real client in timeline", async () => {
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/backend/clinic/clients")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: "c-real-1", userId: "c-real-1", fullName: "Freja Lind", email: "freja@dk.dk" }],
          };
        }
        if (url.includes("/api/backend/journals/client/c-real-1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              entries: [],
              clinicalNotes: [
                {
                  id: "cn-assoc",
                  title: "Klinisk note",
                  confidentialMarkdown: "**Status** Stabil",
                  organisationName: "Associated Clinic",
                  createdAt: "2026-10-10T10:00:00Z",
                },
              ],
            }),
          };
        }
        if (url.includes("/api/backend/journals/history/")) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.endsWith("/api/backend/journals")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                id: "jm-1",
                clientUuid: "c-real-1",
                title: "Markdown Notat",
                content: "### Delmål\n\n## Del\n\n**Fokuspunkt** i hverdagen\n\n   ",
                moodRating: 8,
                sharedWithTherapist: true,
                gitBranch: "trauma",
              },
              {
                id: "jm-2",
                clientUuid: "c-real-1",
                title: "Søvnlog",
                content: "   ",
                moodRating: 6,
                sharedWithTherapist: false,
                gitBranch: "sleep",
              },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      });

      const clientRender = render(
        <AuthProvider user={{ id: "c-real-1", name: "Freja", email: "freja@dk.dk", roles: ["CLIENT"] }}>
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByText("Delmål")).toBeDefined());
      expect(screen.getByText("Fokuspunkt")).toBeDefined();
      expect(screen.getByTestId("journal-branch-badge-jm-1")).toBeDefined();

      fireEvent.click(screen.getByTestId("journal-branch-filter-trauma"));
      expect(screen.queryByText("Søvnlog")).toBeNull();
      expect(screen.getByText("Markdown Notat")).toBeDefined();
      fireEvent.click(screen.getByTestId("journal-branch-filter-sleep"));
      expect(screen.getByText("Søvnlog")).toBeDefined();
      fireEvent.click(screen.getByTestId("journal-branch-filter-all"));
      clientRender.unmount();

      render(
        <AuthProvider user={{ id: "th-real-1", name: "Dr. Mette", email: "m@dk.dk", roles: ["THERAPIST"] }}>
          <PatientTimelineContainer />
        </AuthProvider>
      );
      await waitFor(() => {
        expect((screen.getByTestId("timeline-client-select") as HTMLSelectElement).value).toBe("c-real-1");
        expect(screen.getByTestId("timeline-event-card-cn-assoc")).toBeDefined();
      });
    });

    it("keeps unchecked confidential therapist notes out of /journals and renders H5/UL Markdown + sharedTherapistUuids", async () => {
      const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        fetchCalls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
        if (url.includes("/api/backend/clinic/clients")) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: "cp-r4", userId: "c-r4-1", fullName: "Maja Lindholm", email: "m@dk.dk" }],
          };
        }
        if (url.includes("/api/backend/journals/therapist-notes") && method === "POST") {
          return { ok: true, status: 201, json: async () => ({ id: "tn-priv" }) };
        }
        if (url.endsWith("/api/backend/journals") && method === "POST") {
          const parsed = typeof init?.body === "string" ? JSON.parse(init.body) : {};
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: "j-shared-md",
              clientUuid: "c-r4-1",
              title: parsed.title,
              content: parsed.content,
              moodRating: parsed.moodRating ?? 7,
              sharedWithTherapist: true,
              sharedWithTherapists: true,
            }),
          };
        }
        if (url.endsWith("/api/backend/journals")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                id: "j-md-list",
                clientUuid: "c-r4-1",
                title: "Struktureret refleksion",
                content: "### Overskrift\n\n#### Underoverskrift\n\n- **Første** punkt\n* Andet punkt",
                moodRating: 8,
                sharedWithTherapist: true,
              },
              {
                id: "j-nobranch",
                clientUuid: "c-r4-1",
                title: "Standard gren",
                content: "Kort note",
                moodRating: 7,
                sharedWithTherapist: false,
                gitBranch: undefined,
              },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      });

      render(
        <AuthProvider user={{ id: "th-priv-1", name: "Mikkel V", email: "mv@dk.dk", roles: ["PROVIDER"] }}>
          <JournalFeatureView portalMode="provider" />
        </AuthProvider>
      );

      await waitFor(() => expect(screen.getByTestId("journal-client-select")).toBeDefined());
      fireEvent.change(screen.getByTestId("journal-client-select"), { target: { value: "c-r4-1" } });

      // Uncheck shared checkbox -> confidential note MUST only hit /therapist-notes, never /journals
      fireEvent.click(screen.getByTestId("input-journal-shared"));
      fireEvent.change(screen.getByTestId("input-journal-title"), { target: { value: "F4 FORTROLIG NOTE" } });
      fireEvent.change(screen.getByTestId("input-journal-content"), { target: { value: "Kun intern tekst" } });
      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => expect(screen.getByTestId("internal-note-saved-banner")).toBeDefined());
      expect(fetchCalls.some((c) => c.url.endsWith("/api/backend/journals") && c.method === "POST")).toBe(false);
      expect(fetchCalls.some((c) => c.url.includes("/journals/therapist-notes") && c.method === "POST")).toBe(true);

      // Shared note includes provider auth userId in sharedTherapistUuids and renders H5/UL Markdown
      const journalList = screen.getByTestId("journal-list");
      expect(journalList.querySelector("h4")?.textContent).toBe("Overskrift");
      expect(journalList.querySelector("h5")?.textContent).toBe("Underoverskrift");
      expect(journalList.querySelectorAll("ul.list-disc li")).toHaveLength(2);

      fireEvent.click(screen.getByTestId("input-journal-shared"));
      fireEvent.change(screen.getByTestId("input-journal-title"), { target: { value: "F4 DELT" } });
      fireEvent.change(screen.getByTestId("input-journal-content"), { target: { value: "- Punkt A\n- Punkt B" } });
      fireEvent.click(screen.getByTestId("submit-journal"));

      await waitFor(() => {
        const journalPost = fetchCalls.find((c) => c.url.endsWith("/api/backend/journals") && c.method === "POST");
        expect(journalPost).toBeDefined();
        expect(JSON.parse(journalPost!.body!).sharedTherapistUuids).toContain("th-priv-1");
      });
      cleanup();

      // Confidential note without title + failing /therapist-notes (500 + network reject)
      let rejectNotePost = false;
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/backend/clinic/clients")) {
          return { ok: true, status: 200, json: async () => [{ id: "cp-e", userId: "c-e", fullName: "Eva" }] };
        }
        if (url.includes("/therapist-notes") && init?.method === "POST") {
          if (rejectNotePost) throw new Error("network down");
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      const errPriv = render(
        <AuthProvider user={{ id: "th-e", name: "", email: "b@dk.dk", roles: ["PROVIDER"] }}>
          <JournalFeatureView portalMode="provider" />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getAllByTestId("journal-client-select").pop()).toBeDefined());
      fireEvent.change(screen.getAllByTestId("journal-client-select").pop()!, { target: { value: "c-e" } });
      fireEvent.click(screen.getAllByTestId("input-journal-shared").pop()!);
      fireEvent.change(screen.getAllByTestId("input-journal-content").pop()!, { target: { value: "Ingen titel" } });
      fireEvent.click(screen.getAllByTestId("submit-journal").pop()!);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/backend/journals/therapist-notes", expect.any(Object)));
      rejectNotePost = true;
      fireEvent.click(screen.getAllByTestId("submit-journal").pop()!);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
      errPriv.unmount();

      // PatientTimelineContainer renders Markdown headings, bold & bullet lists across meso, micro & inspector
      const mdTimelineEvent: ClinicalJournalEvent[] = [
        {
          id: "ev-md-1",
          date: "2026-11-20",
          lane: "sessions",
          tag: "Samtale",
          title: "Markdown Tidslinje",
          summary: "### Klinisk Hovedpunkt\n#### Delmål\nStatus med **fed markering**\n- Første fokuspunkt\n- Andet fokuspunkt",
          version: "v1.0",
          soap: {
            subjective: "### Subjektivt\n- Søvn bedret\n- **Færre** flashbacks",
            objective: "Rolig fremtoning",
            assessment: "#### Stabil\nFremgang",
            plan: "Fortsæt plan",
          },
          auditLog: "Audit",
        },
      ];
      const tlRender = render(
        <AuthProvider user={{ id: "th-tl-md", name: "Bo", email: "bo@klinik.dk", roles: ["PROVIDER"] }}>
          <PatientTimelineContainer events={mdTimelineEvent} initialZoomLevel={55} />
        </AuthProvider>
      );
      const cardMeso = screen.getByTestId("timeline-event-card-ev-md-1");
      expect(cardMeso.querySelector("h4")?.textContent).toBe("Klinisk Hovedpunkt");
      expect(cardMeso.querySelector("h5")?.textContent).toBe("Delmål");
      expect(cardMeso.querySelectorAll("ul li")).toHaveLength(2);

      // Select card to open JournalDetailInspector and verify rendered Markdown there too
      fireEvent.click(cardMeso);
      const inspector = screen.getByTestId("journal-detail-inspector");
      expect(inspector.querySelector("h4")?.textContent).toBe("Klinisk Hovedpunkt");
      expect(inspector.querySelector("strong")?.textContent).toBe("fed markering");
      expect(inspector.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(4);
      tlRender.unmount();

      // 1. Deferred getClinicClients unmount in provider journal view + empty confidential note submit + shared w/ blank userName & failing noteRes (500)
      cleanup();
      let resolveProviderClients!: (v: unknown) => void;
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/clients")) {
          return new Promise((res) => {
            resolveProviderClients = res;
          });
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      const unmountProv = render(
        <AuthProvider user={{ id: "th-unm-1", name: "Dr. Unmount", email: "u@dk.dk", roles: ["PROVIDER"] }}>
          <JournalFeatureView portalMode="provider" />
        </AuthProvider>
      );
      unmountProv.unmount();
      resolveProviderClients({ ok: true, status: 200, json: async () => [{ id: "cp-u", userId: "c-u", fullName: "U Klient" }] });
      await Promise.resolve();

      // Unshared empty confidential form -> returns early without POST; shared + internalNote + blank user.name + failing /therapist-notes (500)
      const callsAfter: string[] = [];
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        callsAfter.push(`${init?.method || "GET"} ${u}`);
        if (u.includes("/api/backend/clinic/clients")) {
          return { ok: true, status: 200, json: async () => [{ id: "cp-j1", userId: "c-j1", fullName: "Klient J" }] };
        }
        if (u.endsWith("/api/backend/journals") && init?.method === "POST") {
          return { ok: true, status: 201, json: async () => ({ id: "j-created-1", title: "T", content: "C", moodRating: 7 }) };
        }
        if (u.includes("/therapist-notes") && init?.method === "POST") {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      const provEmptyName = render(
        <AuthProvider user={{ id: "th-empty-name", name: "", email: "e@dk.dk", roles: ["PROVIDER"] }}>
          <JournalFeatureView portalMode="provider" />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByTestId("journal-client-select")).toBeDefined());
      fireEvent.change(screen.getByTestId("journal-client-select"), { target: { value: "c-j1" } });
      // Unshare while title, content, and internalNote are all blank -> combinedConfidential is ""
      fireEvent.click(screen.getByTestId("input-journal-shared"));
      fireEvent.click(screen.getByTestId("submit-journal"));
      await Promise.resolve();
      expect(callsAfter.some((c) => c.includes("POST /api/backend/journals/therapist-notes"))).toBe(false);

      // Re-enable share, fill title + content + internalNote, submit -> noteRes.ok === false (500) & auth.user.name === "" fallback
      fireEvent.click(screen.getByTestId("input-journal-shared"));
      fireEvent.change(screen.getByTestId("input-journal-title"), { target: { value: "Delt Indlæg" } });
      fireEvent.change(screen.getByTestId("input-journal-content"), { target: { value: "Indhold" } });
      fireEvent.change(screen.getByTestId("input-journal-internal-note"), { target: { value: "Intern note" } });
      fireEvent.click(screen.getByTestId("submit-journal"));
      await waitFor(() => expect(callsAfter.some((c) => c.includes("POST /api/backend/journals/therapist-notes"))).toBe(true));
      provEmptyName.unmount();

      // 2. Client mode: rejected handshakes fetch + branch filter when item.gitBranch is undefined (falls back to "main")
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/handshakes/client/")) {
          throw new Error("handshakes offline");
        }
        if (u.endsWith("/api/backend/journals")) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: "j-nobranch", title: "Uden Branch", content: "Tekst", moodRating: 7, clientUuid: "c-branch-1" },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      });
      const branchClient = render(
        <AuthProvider user={{ id: "c-branch-1", name: "Client B", email: "b@dk.dk", roles: ["CLIENT"] }}>
          <JournalFeatureView portalMode="client" />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByText("Uden Branch")).toBeDefined());
      fireEvent.click(screen.getByTestId("journal-branch-filter-main"));
      expect(screen.getByText("Uden Branch")).toBeDefined();
      branchClient.unmount();

      // 3. PatientTimelineContainer: providedEvents sort with 2+ events, deferred getClinicClients when source manually switched, & rAF firing after unmount
      const unsortedEvents: ClinicalJournalEvent[] = [
        { ...mdTimelineEvent[0], id: "ev-older", date: "2026-01-01" },
        { ...mdTimelineEvent[0], id: "ev-newer", date: "2026-12-01" },
      ];
      const sortedTl = render(<PatientTimelineContainer events={unsortedEvents} />);
      expect(screen.getByTestId("timeline-event-card-ev-newer")).toBeDefined();
      sortedTl.unmount();

      let resolveTlClients!: (v: unknown) => void;
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes("/api/backend/clinic/clients")) {
          return new Promise((res) => {
            resolveTlClients = res;
          });
        }
        return { ok: true, status: 200, json: async () => ({ entries: [], commits: [], clinicalNotes: [] }) };
      });
      let capturedRafCb: FrameRequestCallback | null = null;
      const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        capturedRafCb = cb;
        return 77;
      });
      const cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
      const raceTl = render(
        <AuthProvider user={{ id: "th-tl-race", name: "Bo", email: "bo@dk.dk", roles: ["PROVIDER"] }}>
          <PatientTimelineContainer skipRoleGuard />
        </AuthProvider>
      );
      fireEvent.change(screen.getByTestId("timeline-client-select"), { target: { value: "manual-client-id" } });
      resolveTlClients({
        ok: true,
        status: 200,
        json: async () => [{ id: "cp-r", userId: "c-auto", fullName: "Auto Klient" }],
      });
      await waitFor(() => expect(screen.getByTestId("timeline-client-select").textContent).toContain("Auto Klient"));
      raceTl.unmount();
      capturedRafCb?.(0);
      rafSpy.mockRestore();
      cafSpy.mockRestore();
    });
  });
});
