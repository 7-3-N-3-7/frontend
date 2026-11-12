import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ClinicPlatformFeatureView,
  ConnectedPortalWorkspaceShell,
  TherapistMultiWindowWorkspace,
  ClientPortalWorkspace,
  isValidDanishCvr,
} from "./ClinicPlatformFeature";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("ClinicPlatformFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("validates 8-digit Danish CVR numbers", () => {
    expect(isValidDanishCvr("39485712")).toBe(true);
    expect(isValidDanishCvr("1234")).toBe(false);
    expect(isValidDanishCvr("ABCDEFGH")).toBe(false);
    expect(isValidDanishCvr("")).toBe(false);
  });

  it("renders client profiles, registers a new client, and removes a client (Happy Path)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "c-1",
          fullName: "Anders Sand",
          email: "anders@sand.dk",
          phone: "+45 12 34 56 78",
        },
      ],
    });

    render(<ClinicPlatformFeatureView />);

    await waitFor(() => {
      expect(screen.getByText("Anders Sand")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-client-fullName"), {
      target: { value: "Mette Lind" },
    });
    fireEvent.change(screen.getByTestId("input-client-email"), {
      target: { value: "mette@lind.dk" },
    });
    fireEvent.change(screen.getByTestId("input-client-phone"), {
      target: { value: "+45 87 65 43 21" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "c-2",
        fullName: "Mette Lind",
        email: "mette@lind.dk",
        phone: "+45 87 65 43 21",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-clinic-client"));

    await waitFor(() => {
      expect(screen.getByText("Mette Lind")).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-clinic-client-c-2"));

    await waitFor(() => {
      expect(screen.queryByText("Mette Lind")).toBeNull();
    });
  });

  it("enforces DomainGuard on client registration and renders backend ProblemDetail", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<ClinicPlatformFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Blank fullName triggers DomainGuard
    fireEvent.click(screen.getByTestId("submit-clinic-client"));
    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("VALIDATION_FAILED");
      expect(
        screen.getByTestId("field-error-fullName").textContent
      ).toContain("Client full name must not be blank");
    });

    // Backend ProblemDetail
    const problem: ProblemDetail = {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Client profile with this email already exists in clinic",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-client-fullName"), {
      target: { value: "Søren Kierkegaard" },
    });
    fireEvent.change(screen.getByTestId("input-client-email"), {
      target: { value: "soren@clinic.dk" },
    });
    fireEvent.click(screen.getByTestId("submit-clinic-client"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("CONFLICT");
      expect(screen.getByTestId("error-detail").textContent).toBe(
        "Client profile with this email already exists in clinic"
      );
    });
  });

  it("renders ConnectedPortalWorkspaceShell, TherapistMultiWindowWorkspace, and ClientPortalWorkspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    global.fetch = fetchMock;

    render(
      <ConnectedPortalWorkspaceShell>
        <TherapistMultiWindowWorkspace />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByTestId("therapist-greeting").textContent).toContain(
        "Behandler"
      );
      expect(screen.getByTestId("client-greeting").textContent).toContain(
        "Klient"
      );
    });

    // Switch tabs in TherapistMultiWindowWorkspace
    fireEvent.click(screen.getByTestId("tab-btn-clinic-cvr"));
    await waitFor(() => {
      expect(screen.getByTestId("clinic-cvr-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("tab-btn-overview"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("therapist-multi-window-workspace")
          .getAttribute("data-active-tab")
      ).toBe("overview");
    });

    render(
      <ClientPortalWorkspace
        userName="Borger Hansen"
        secureStatus="JWT OK"
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("client-secure-status").textContent).toContain(
        "JWT OK"
      );
    });
  });
});
