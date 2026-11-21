import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PsychotraumatologyFeatureView,
  calculatePcl5Severity,
  filterPcl5ClientOptions,
  localizePcl5Severity,
  normalizeUtcTimestamp,
  PCL5_CLUSTERS,
  PCL5_QUESTIONS_DA,
  PCL5_QUESTIONS_EN,
} from "./PsychotraumatologyFeature";
import { AuthProvider } from "../../core/baseUiCore";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";
import { CachedI18nProvider } from "../i18n/I18nFeature";

describe("PsychotraumatologyFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates PCL-5 severity bands and exports 20-item bilingual clusters", () => {
    expect(PCL5_QUESTIONS_DA).toHaveLength(20);
    expect(PCL5_QUESTIONS_EN).toHaveLength(20);
    expect(PCL5_CLUSTERS).toHaveLength(4);
    expect(PCL5_CLUSTERS.reduce((sum, c) => sum + c.count, 0)).toBe(20);
    expect(calculatePcl5Severity(10)).toBe("Minimal");
    expect(calculatePcl5Severity(25)).toBe("Mild / Sub-threshold");
    expect(calculatePcl5Severity(40)).toBe("Moderate (Probable PTSD)");
    expect(calculatePcl5Severity(60)).toBe("Severe");
    expect(localizePcl5Severity("Moderate (Probable PTSD)", "da")).toBe(
      "Moderat (klinisk grænse nået)"
    );
    expect(localizePcl5Severity("UnknownBand", "en")).toBe("UnknownBand");
  });

  it("navigates 4 PCL-5 clusters, supports manual quick-entry without 25 anchor, and confirms deletion", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "pt-1",
          clientUuid: "client-1",
          testType: "PCL-5",
          score: 28,
          severity: "Mild / Sub-threshold",
          answersJson: "[28]",
        },
      ],
    });

    render(<PsychotraumatologyFeatureView portalMode="provider" />);

    await waitFor(() => {
      expect(screen.getByText(/Score: 28/)).toBeDefined();
    });

    // Interactive 4-cluster wizard is default
    expect(screen.getByTestId("pcl5-questions-reference")).toBeDefined();
    expect(screen.queryByTestId("input-score")).toBeNull();
    fireEvent.click(screen.getByTestId("pcl5-q-0-opt-4"));
    expect(
      screen.getByTestId("pcl5-progress-bar").getAttribute("aria-valuenow")
    ).toBe("1");
    fireEvent.click(screen.getByTestId("pcl5-next-cluster"));
    expect(screen.getByTestId("pcl5-q-5-opt-3")).toBeDefined();
    fireEvent.click(screen.getByTestId("pcl5-prev-cluster"));
    expect(screen.getByTestId("pcl5-q-0-opt-4")).toBeDefined();
    fireEvent.click(screen.getByTestId("pcl5-cluster-tab-2"));
    fireEvent.click(screen.getByTestId("pcl5-q-7-opt-2"));

    // Attempting interactive submit before answering all 20 items shows ProblemDetail error
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-2" },
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));
    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("VALIDATION_FAILED");
    });

    // Answer all remaining 18 items across clusters (B=0..4, C=5..6, D=7..13, E=14..19)
    fireEvent.click(screen.getByTestId("pcl5-cluster-tab-0"));
    for (const q of [1, 2, 3, 4]) {
      fireEvent.click(screen.getByTestId(`pcl5-q-${q}-opt-0`));
    }
    fireEvent.click(screen.getByTestId("pcl5-cluster-tab-1"));
    for (const q of [5, 6]) {
      fireEvent.click(screen.getByTestId(`pcl5-q-${q}-opt-0`));
    }
    fireEvent.click(screen.getByTestId("pcl5-cluster-tab-2"));
    for (const q of [8, 9, 10, 11, 12, 13]) {
      fireEvent.click(screen.getByTestId(`pcl5-q-${q}-opt-0`));
    }
    fireEvent.click(screen.getByTestId("pcl5-cluster-tab-3"));
    for (const q of [14, 15, 16, 17, 18, 19]) {
      fireEvent.click(screen.getByTestId(`pcl5-q-${q}-opt-0`));
    }

    // Interactive submit with calculated total 6 (q-0=4, q-7=2, others=0)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "pt-interactive",
        clientUuid: "client-2",
        testType: "PCL-5",
        score: 6,
        severity: "Minimal",
        answersJson: "[]",
      }),
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(screen.getByText(/Score: 6/)).toBeDefined();
    });

    // Toggle to manual quick-entry: must NOT have default 25 anchor
    fireEvent.click(screen.getByTestId("toggle-manual-score-mode"));
    const scoreInput = screen.getByTestId("input-score") as HTMLInputElement;
    expect(scoreInput.value).toBe("");

    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-2" },
    });
    fireEvent.change(screen.getByTestId("select-testType"), {
      target: { value: "ITQ" },
    });
    fireEvent.change(scoreInput, {
      target: { value: "45" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "pt-2",
        clientUuid: "client-2",
        testType: "ITQ",
        score: 45,
        severity: "Moderate (Probable PTSD)",
        answersJson: "[45]",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(screen.getByText(/Score: 45/)).toBeDefined();
    });

    // ConfirmActionDialog cancel then accept
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-test-pt-2"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    expect(screen.getByText(/Score: 45/)).toBeDefined();

    fireEvent.click(screen.getByTestId("delete-test-pt-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

    await waitFor(() => {
      expect(screen.queryByText(/Score: 45/)).toBeNull();
    });
  });

  it("enforces PCL-5 score bounds (0..80) via DomainGuard and renders ProblemDetail", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<PsychotraumatologyFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("toggle-manual-score-mode"));
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-99" },
    });

    // Blank manual score triggers DomainGuard
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));
    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("BAD_REQUEST");
    });

    // Score > 80 triggers DomainGuard
    fireEvent.change(screen.getByTestId("input-score"), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("BAD_REQUEST");
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "PCL-5 score skal være mellem 0 og 80"
      );
    });

    // Backend ProblemDetail
    const problem: ProblemDetail = {
      type: "about:blank",
      title: "Access Denied",
      status: 403,
      detail: "Client consent required before recording trauma screening",
      errorCode: ErrorCode.ACCESS_DENIED,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-score"), {
      target: { value: "35" },
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("ACCESS_DENIED");
    });
  });

  it("renders human client picker for authenticated PROVIDER and handles fallback toggle", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/backend/clinic/clients")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { id: "cp-self", userId: "prov-1", fullName: "Bo Jensen", email: "bo@clinic.dk" },
            { id: "cp-dr", userId: "t-dr", fullName: "Dr. Maja Lindholm", email: "maja@clinic.dk" },
            { id: "cp-ter", userId: "t-sofie", fullName: "sofie_terapeut", email: "sofie@clinic.dk" },
            { id: "cp-1", userId: "c-real-1", fullName: "Anders Sand", email: "anders@sand.dk" },
            { id: "cp-dup", userId: "c-dup-id", fullName: "anders sand ", email: "anders+dup@sand.dk" },
            { id: "cp-2", fullName: "Maria Hansen" },
          ],
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AuthProvider
        user={{
          id: "prov-1",
          name: "Bo Jensen",
          email: "bo@clinic.dk",
          roles: ["PROVIDER"],
        }}
      >
        <PsychotraumatologyFeatureView portalMode="provider" />
      </AuthProvider>
    );

    await waitFor(() => {
      const picker = screen.getByTestId("select-pcl5-client");
      expect(picker.innerHTML).toContain("Anders Sand (anders@sand.dk)");
    });
    const pickerHtml = screen.getByTestId("select-pcl5-client").innerHTML;
    expect(pickerHtml).toContain("Maria Hansen");
    expect(pickerHtml).not.toContain("Bo Jensen");
    expect(pickerHtml).not.toContain("Dr. Maja Lindholm");
    expect(pickerHtml).not.toContain("sofie_terapeut");
    expect(pickerHtml).not.toContain("anders+dup@sand.dk");

    fireEvent.change(screen.getByTestId("select-pcl5-client"), {
      target: { value: "c-real-1" },
    });
    fireEvent.change(screen.getByTestId("select-pcl5-client"), {
      target: { value: "__manual__" },
    });
    expect(screen.getByTestId("input-clientUuid")).toBeDefined();
    fireEvent.click(screen.getByTestId("btn-back-to-client-list"));
    expect(screen.getByTestId("select-pcl5-client")).toBeDefined();
  });

  it("handles clinic client list fetch failure gracefully", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/backend/clinic/clients")) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AuthProvider
        user={{
          id: "prov-2",
          name: "Bo Jensen",
          email: "bo@clinic.dk",
          roles: ["PROVIDER"],
        }}
      >
        <PsychotraumatologyFeatureView portalMode="provider" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("input-clientUuid")).toBeDefined();
    });
  });

  it("renders self-service screening view for CLIENT role using own UUID and hiding delete buttons", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "pt-own",
          clientUuid: "client-self-1",
          testType: "PCL-5",
          score: 18,
          severity: "Minimal",
          answersJson: "[18]",
        },
        {
          id: "pt-other",
          clientUuid: "someone-else",
          testType: "ITQ",
          score: 52,
          severity: "Severe",
          answersJson: "[52]",
        },
      ],
    });

    render(
      <AuthProvider
        user={{
          id: "client-self-1",
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <PsychotraumatologyFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("pcl5-questions-reference")).toBeDefined();
      expect(screen.getByText(/Score: 18/)).toBeDefined();
    });
    expect(screen.queryByTestId("input-clientUuid")).toBeNull();
    expect(screen.queryByText(/Score: 52/)).toBeNull();
    expect(screen.queryByTestId("delete-test-pt-own")).toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "pt-new",
        clientUuid: "client-self-1",
        testType: "PCL-5",
        score: 35,
        severity: "Moderate (Probable PTSD)",
        answersJson: "[35]",
      }),
    });

    fireEvent.click(screen.getByTestId("toggle-manual-score-mode"));
    fireEvent.change(screen.getByTestId("input-score"), {
      target: { value: "35" },
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(screen.getByText(/Score: 35/)).toBeDefined();
    });
  });

  it("filterPcl5ClientOptions filters invalid rows, self, therapists, and duplicate IDs/names", async () => {
    expect(filterPcl5ClientOptions(null)).toEqual([]);
    expect(
      filterPcl5ClientOptions([
        { id: "  ", userId: "  ", fullName: "No Valid Id" },
        { id: "c-mail", fullName: "Eva", email: "MATCH@clinic.dk" },
      ], undefined, "match@clinic.dk")
    ).toEqual([]);
    const filtered = filterPcl5ClientOptions(
      [
        null,
        "invalid",
        { id: 123, fullName: "Bad Id Type" },
        { id: "missing-name" },
        { id: "blank-name", fullName: "   " },
        { id: "   ", fullName: "Blank Id" },
        { id: "self-id-row", userId: "prov-1", fullName: "Self By ID", email: "other@mail.dk" },
        { id: "self-mail-row", userId: "other-id", fullName: "Self By Mail", email: "  PROV@CLINIC.DK " },
        { id: "dr-row", userId: "t-1", fullName: "Dr. Maja" },
        { id: "ter-row", userId: "t-2", fullName: "maja_terapeut" },
        { id: "cp-1", userId: "c-1", fullName: "  Anders Sand  ", email: "anders@sand.dk" },
        { id: "cp-dup-id", userId: "c-1", fullName: "Anders Rename", email: "rename@sand.dk" },
        { id: "cp-dup-name", userId: "c-2", fullName: "anders sand", email: "dup@sand.dk" },
        { id: "cp-2", userId: "   ", fullName: "Maria Hansen" },
      ],
      " prov-1 ",
      "prov@clinic.dk"
    );
    expect(filtered).toEqual([
      { id: "cp-1", userId: "c-1", fullName: "Anders Sand", email: "anders@sand.dk" },
      { id: "cp-2", userId: null, fullName: "Maria Hansen", email: undefined },
    ]);

    // Cover clinic/clients !res.ok and unmount before fetch resolves
    let resolveClients!: (r: Response) => void;
    global.fetch = vi.fn((url: string) => {
      if (url.includes("/api/backend/clinic/clients")) {
        return new Promise<Response>((res) => {
          resolveClients = res;
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
    }) as unknown as typeof fetch;

    const { unmount } = render(
      <AuthProvider user={{ id: "prov-1", name: "Bo", email: "bo@clinic.dk", roles: ["PROVIDER"] }}>
        <PsychotraumatologyFeatureView portalMode="provider" />
      </AuthProvider>
    );
    unmount();
    resolveClients({ ok: false, status: 500, json: async () => [] } as Response);
  });

  it("blocks therapist self-assessment in manual mode and renders client name and timestamp on assessments", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/clinic/clients")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "cp-9", userId: "c-listed-9", fullName: "Lukas Holm", email: "lukas@dk.dk" }],
        };
      }
      if (url.includes("/api/backend/psychotraumatology/tests")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "pcl-9",
              clientUuid: "c-listed-9",
              testType: "PCL-5",
              score: 42,
              severity: "SIGNIFICANT_PTSD",
              createdAt: "2026-10-12T09:15:00Z",
            },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    render(
      <AuthProvider user={{ id: "th-self-1", name: "Dr. Egen", email: "egen@dk.dk", roles: ["THERAPIST"] }}>
        <PsychotraumatologyFeatureView portalMode="provider" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("psychotraumatology-item-pcl-9").textContent).toContain("Lukas Holm");
    });

    fireEvent.click(screen.getByTestId("toggle-manual-score-mode"));
    fireEvent.change(screen.getByTestId("select-pcl5-client"), { target: { value: "__manual__" } });
    fireEvent.change(screen.getByTestId("input-clientUuid"), { target: { value: "th-self-1" } });
    fireEvent.change(screen.getByTestId("input-score"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "Kontrollér det markerede felt nedenfor."
      );
      expect(screen.getByTestId("field-error-clientUuid").textContent).toContain(
        "sig selv som klient"
      );
    });

    // Cover English self-assessment error & invalid/missing createdAt date fallback
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/clinic/clients")) {
        return { ok: true, status: 200, json: async () => [{ id: "cp-x", userId: null, fullName: "Client ById", email: "o@dk.dk" }] };
      }
      if (url.includes("/psychotraumatology/tests")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "pcl-bad", clientUuid: "unknown-id", testType: "PCL-5", score: 15, severity: "Minimal", createdAt: "bad-date" },
            { id: "pcl-ts-en", clientUuid: "cp-x", testType: "PCL-5", score: 28, severity: "Mild / Sub-threshold", timestamp: "2026-10-12T10:00:00Z" },
            { id: "pcl-noclient", clientUuid: "", testType: "PCL-5", score: 5, severity: "Minimal" },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const enRender = render(
      <CachedI18nProvider initialLocale="en" initialMessages={{}}>
        <AuthProvider user={{ id: "th-en-1", name: "Dr. En", email: "en@dk.dk", roles: ["THERAPIST"] }}>
          <PsychotraumatologyFeatureView portalMode="provider" />
        </AuthProvider>
      </CachedI18nProvider>
    );
    await waitFor(() => expect(screen.getByTestId("psychotraumatology-item-pcl-ts-en").textContent).toContain("Client ById"));
    fireEvent.click(screen.getAllByTestId("toggle-manual-score-mode").pop()!);
    fireEvent.change(screen.getAllByTestId("select-pcl5-client").pop()!, { target: { value: "__manual__" } });
    fireEvent.change(screen.getAllByTestId("input-clientUuid").pop()!, { target: { value: "th-en-1" } });
    fireEvent.change(screen.getAllByTestId("input-score").pop()!, { target: { value: "25" } });
    fireEvent.click(screen.getAllByTestId("submit-psychotraumatology").pop()!);
    await waitFor(() => {
      expect(screen.getAllByTestId("field-error-clientUuid").pop()?.textContent).toContain("for themselves as client");
    });
    enRender.unmount();

    // Cover normalizeUtcTimestamp + loading&&!error + client self-view name display
    expect(normalizeUtcTimestamp("")).toBe("");
    expect(normalizeUtcTimestamp("2026-11-20T12:32:00")).toBe("2026-11-20T12:32:00Z");
    expect(normalizeUtcTimestamp("2026-11-20T12:32:00Z")).toBe("2026-11-20T12:32:00Z");

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "pcl-client-self",
          clientUuid: "c-self-1",
          testType: "PCL-5",
          score: 35,
          severity: "Moderate",
          createdAt: "2026-11-20T12:32:00",
        },
      ],
    }));
    const clientView = render(
      <AuthProvider user={{ id: "c-self-1", name: "Maja Lindholm", email: "m@dk.dk", roles: ["CLIENT"] }}>
        <PsychotraumatologyFeatureView portalMode="client" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("psychotraumatology-item-pcl-client-self").textContent).toContain(
        "Maja Lindholm"
      );
    });
    clientView.unmount();

    expect(filterPcl5ClientOptions([{ id: "cp-z", userId: "u-z", fullName: "Zoe", email: "z@dk.dk" }], "u1", null)).toHaveLength(1);

    // Client self-view with empty auth.user.name renders item cleanly with '' fallback
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { id: "pcl-empty-auth", clientUuid: "c-empty-name", testType: "PCL-5", score: 10, severity: "Minimal" },
      ],
    });
    const emptyNameClient = render(
      <AuthProvider user={{ id: "c-empty-name", name: "", email: "e@dk.dk", roles: ["CLIENT"] }}>
        <PsychotraumatologyFeatureView portalMode="client" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("psychotraumatology-item-pcl-empty-auth")).toBeDefined());
    emptyNameClient.unmount();

    // Empty auth.user.name + API 401 error hides loading indicator
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ status: 401, title: "Unauthorized", detail: "Unauthorized", errorCode: ErrorCode.UNAUTHORIZED, timestamp: "" }),
    });
    const unauthView = render(
      <AuthProvider user={{ id: "c-empty-name", name: "", email: "e@dk.dk", roles: ["CLIENT"] }}>
        <PsychotraumatologyFeatureView portalMode="client" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
    expect(screen.queryByTestId("loading-indicator")).toBeNull();
    unauthView.unmount();
  });
});
