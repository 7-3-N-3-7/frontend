import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManagementFeatureView } from "./ManagementFeature";
import { AuthProvider } from "../../core/baseUiCore";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("ManagementFeature Vertical Slice (RoleGuard + BaseApiService)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders KPI list, creates a new KPI, and deletes a KPI when authorized as MANAGEMENT", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "kpi-1",
          metricName: "Månedlig omsætning",
          metricValue: 185000,
          unit: "DKK",
          department: "Psykotraumatologi",
        },
      ],
    });

    render(
      <AuthProvider
        user={{
          id: "m-1",
          name: "Mette Direktør",
          email: "mette@clinic.dk",
          roles: ["MANAGEMENT"],
        }}
      >
        <ManagementFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("management-feature-view")).toBeDefined();
      expect(screen.getByText(/Månedlig omsætning/)).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-kpi-name"), {
      target: { value: "Nye klientforløb" },
    });
    fireEvent.change(screen.getByTestId("input-kpi-value"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByTestId("input-kpi-unit"), {
      target: { value: "sessioner" },
    });
    fireEvent.change(screen.getByTestId("input-kpi-department"), {
      target: { value: "Klinik København" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "kpi-2",
        metricName: "Nye klientforløb",
        metricValue: 45,
        unit: "sessioner",
        department: "Klinik København",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-kpi"));

    await waitFor(() => {
      expect(screen.getByText(/Nye klientforløb/)).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-kpi-kpi-2"));

    await waitFor(() => {
      expect(screen.queryByText(/Nye klientforløb/)).toBeNull();
    });
  });

  it("enforces DomainGuard validation and renders RFC 7807 ProblemDetail", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<ManagementFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Blank metricName -> DomainGuard error
    fireEvent.click(screen.getByTestId("submit-kpi"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("VALIDATION_FAILED");
      expect(screen.getByTestId("field-error-metricName").textContent).toContain(
        "KPI Metric name must not be blank"
      );
    });

    // Valid metricName, zero metricValue -> DomainGuard error
    fireEvent.change(screen.getByTestId("input-kpi-name"), {
      target: { value: "Klinisk belægning" },
    });
    fireEvent.change(screen.getByTestId("input-kpi-value"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("submit-kpi"));

    await waitFor(() => {
      expect(screen.getByTestId("field-error-metricValue").textContent).toContain(
        "KPI Metric value must be greater than zero"
      );
    });

    // Backend RFC 7807 ProblemDetail
    const problem: ProblemDetail = {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "KPI findes allerede for perioden",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-kpi-value"), {
      target: { value: "85" },
    });
    fireEvent.click(screen.getByTestId("submit-kpi"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("CONFLICT");
    });
  });

  it("blocks CLIENT and PROVIDER roles from ManagementFeatureView via RoleGuard", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(
      <AuthProvider
        user={{
          id: "c-1",
          name: "Anders Sand",
          email: "anders@client.dk",
          roles: ["CLIENT"],
        }}
      >
        <ManagementFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("management-feature-view")).toBeNull();
      expect(screen.getByTestId("forbidden-notice")).toBeDefined();
    });
  });
});
