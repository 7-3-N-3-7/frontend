import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ClinicPlatformFeatureView,
  ConnectedPortalWorkspaceShell,
  TherapistMultiWindowWorkspace,
  ClientPortalWorkspace,
  isValidDanishCvr,
  mapMeToAuthenticatedUser,
  resolvePortalShellConfig,
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

  it("maps /clinic/me context to RBAC roles and resolves shell config per portal", () => {
    const clientUser = mapMeToAuthenticatedUser({
      userUuid: "u-1",
      username: "anders_sand",
      fullName: "Anders Sand",
      email: "anders@example.dk",
      roles: ["client"],
      isTherapist: false,
      isAdmin: false,
    });
    expect(clientUser.roles).toEqual(["CLIENT"]);

    const therapistUser = mapMeToAuthenticatedUser({
      userUuid: "u-2",
      fullName: "Dr. Mette",
      email: "mette@klinik.dk",
      roles: ["therapist"],
      isTherapist: true,
      clientProfile: {
        id: "cp-1",
        fullName: "Dr. Mette",
        email: "mette@klinik.dk",
      },
    });
    expect(therapistUser.roles).toEqual(["PROVIDER", "THERAPIST", "CLIENT"]);

    const fallbackUser = mapMeToAuthenticatedUser({});
    expect(fallbackUser).toEqual({
      id: "anonymous",
      name: "Bruger",
      email: "",
      roles: ["CLIENT"],
    });

    const clientShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/personal",
      tab: null,
      me: { roles: ["client"], isTherapist: false },
    });
    expect(clientShell.activeArea).toBe("client");
    expect(clientShell.upgradeAction?.href).toBe("/da/dashboard/clinic");
    expect(clientShell.defaultSidebarCollapsed).toBe(false);

    const therapistOverview = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/therapist",
      tab: "overview",
      me: {
        roles: ["therapist"],
        isTherapist: true,
        missingProfileFields: ["IBAN"],
      },
    });
    expect(therapistOverview.activeArea).toBe("therapist");
    expect(therapistOverview.defaultSidebarCollapsed).toBe(true);
    expect(therapistOverview.upgradeAction).toBeUndefined();
    expect(therapistOverview.profileSubtext).toContain("IBAN");

    const clinicShell = resolvePortalShellConfig({
      locale: "en",
      pathname: "/en/dashboard/clinic",
      tab: "clinic_cvr",
      me: { roles: ["therapist"], isTherapist: true },
    });
    expect(clinicShell.pageTitle).toBe("Klinik & CVR-Administration");
    expect(clinicShell.defaultSidebarCollapsed).toBe(false);
    expect(clinicShell.profileSubtext).toBe("Verificeret behandler");

    const adminShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/admin",
      tab: "management",
      me: { roles: ["admin"], isAdmin: true },
    });
    expect(adminShell.activeArea).toBe("admin");
    expect(adminShell.profileSubtext).toBe("Systemadministrator");

    const settingsShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/settings",
      me: null,
    });
    expect(settingsShell.pageTitle).toBe("Profil- & Klinikindstillinger");
  });

  it("renders ConnectedPortalWorkspaceShell, TherapistMultiWindowWorkspace, and ClientPortalWorkspace", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/clinic/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            userUuid: "u-therapist",
            username: "dr_bo",
            fullName: "Dr. Bo",
            email: "bo@klinik.dk",
            roles: ["therapist"],
            isTherapist: true,
            isAdmin: false,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    });
    global.fetch = fetchMock;

    render(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist">
        <TherapistMultiWindowWorkspace />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );

    await waitFor(() => {
      expect(screen.getByText("Dr. Bo")).toBeDefined();
      expect(screen.getByTestId("therapist-greeting").textContent).toContain(
        "Behandler"
      );
      expect(screen.getByTestId("client-greeting").textContent).toContain(
        "Klient"
      );
      expect(screen.getByTestId("portal-switch-therapist")).toBeDefined();
    });

    // Switch tabs in TherapistMultiWindowWorkspace
    fireEvent.click(screen.getByTestId("tab-btn-calendar"));
    await waitFor(() => {
      expect(screen.getByTestId("therapist-calendar-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("tab-btn-clinic-cvr"));
    await waitFor(() => {
      expect(screen.getByTestId("clinic-cvr-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("tab-btn-pcl5"));
    await waitFor(() => {
      expect(screen.getByTestId("therapist-pcl5-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("tab-btn-finance"));
    await waitFor(() => {
      expect(screen.getByTestId("therapist-finance-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("tab-btn-overview"));
    await waitFor(() => {
      expect(
        screen
          .getByTestId("therapist-multi-window-workspace")
          .getAttribute("data-active-tab")
      ).toBe("overview");
    });

    // Switch tabs and quick-action cards in ClientPortalWorkspace
    fireEvent.click(screen.getByText("Mine Aftaler"));
    await waitFor(() => {
      expect(screen.getByTestId("client-appointments-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("client-tab-overview"));
    fireEvent.click(screen.getByText("Samtykke & Profil", { selector: "div.text-sm" }));
    await waitFor(() => {
      expect(screen.getByTestId("client-consents-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("client-tab-overview"));
    fireEvent.click(screen.getByText("PCL-5 Screening"));
    await waitFor(() => {
      expect(screen.getByTestId("client-pcl5-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("client-tab-marketplace"));
    await waitFor(() => {
      expect(screen.getByTestId("client-marketplace-panel")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("client-tab-finance"));
    await waitFor(() => {
      expect(screen.getByTestId("client-finance-panel")).toBeDefined();
    });

    // Client-only shell with CTA + initialMe + graceful offline fallback
    const offlineFetch = vi.fn().mockRejectedValue(new Error("offline"));
    global.fetch = offlineFetch;
    render(
      <ConnectedPortalWorkspaceShell
        initialMe={{
          userUuid: "u-client",
          fullName: "Borger Hansen",
          roles: ["client"],
          isTherapist: false,
        }}
      >
        <ClientPortalWorkspace
          userName="Borger Hansen"
          secureStatus="JWT OK"
        />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("client-secure-status").textContent).toContain(
        "JWT OK"
      );
      expect(screen.getByTestId("upgrade-therapist-cta")).toBeDefined();
    });

    // Fallback when /api/backend/clinic/me fails or returns 503
    render(
      <ConnectedPortalWorkspaceShell>
        <span>FallbackShellChild</span>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByText("FallbackShellChild")).toBeDefined();
    });
  });
});
