import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PsychotraumatologyFeatureView,
  calculatePcl5Severity,
  PCL5_QUESTIONS_DA,
  PCL5_QUESTIONS_EN,
} from "./PsychotraumatologyFeature";
import { AuthProvider } from "../../core/baseUiCore";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("PsychotraumatologyFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates PCL-5 severity bands and exports bilingual questions", () => {
    expect(PCL5_QUESTIONS_DA.length).toBeGreaterThan(0);
    expect(PCL5_QUESTIONS_EN.length).toBeGreaterThan(0);
    expect(calculatePcl5Severity(10)).toBe("Minimal");
    expect(calculatePcl5Severity(25)).toBe("Mild / Sub-threshold");
    expect(calculatePcl5Severity(40)).toBe("Moderate (Probable PTSD)");
    expect(calculatePcl5Severity(60)).toBe("Severe");
  });

  it("renders assessments, submits a new PCL-5 score, and deletes it", async () => {
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

    render(<PsychotraumatologyFeatureView />);

    await waitFor(() => {
      expect(screen.getByText(/Score: 28/)).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-2" },
    });
    fireEvent.change(screen.getByTestId("select-testType"), {
      target: { value: "ITQ" },
    });
    fireEvent.change(screen.getByTestId("input-score"), {
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

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-test-pt-2"));

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

    // Score > 80 triggers DomainGuard
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-99" },
    });
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

    fireEvent.change(screen.getByTestId("input-score"), {
      target: { value: "35" },
    });
    fireEvent.click(screen.getByTestId("submit-psychotraumatology"));

    await waitFor(() => {
      expect(screen.getByText(/Score: 35/)).toBeDefined();
    });
  });
});
