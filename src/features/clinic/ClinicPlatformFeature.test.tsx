import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ClinicPlatformFeatureView,
  ConnectedPortalWorkspaceShell,
  TherapistMultiWindowWorkspace,
  ClientPortalWorkspace,
  ClientMarketplaceView,
  ClientConsentAndProfileView,
  TherapistClinicOnboardingView,
  ProfileSettingsWorkspace,
  isValidDanishCvr,
  mapMeToAuthenticatedUser,
  resolvePortalShellConfig,
} from "./ClinicPlatformFeature";
import { AuthProvider } from "../../core/baseUiCore";
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
    expect(clinicShell.pageTitle).toBe("Clinic & Company Administration");
    expect(clinicShell.defaultSidebarCollapsed).toBe(false);
    expect(clinicShell.profileSubtext).toBe("Verified Therapist");

    const fallbackLocaleShell = resolvePortalShellConfig({
      locale: "sv",
      pathname: "/sv/dashboard/personal",
      me: { roles: ["client"], isTherapist: false },
    });
    expect(fallbackLocaleShell.pageTitle).toBe("My Client Portal");
    expect(fallbackLocaleShell.upgradeAction?.label).toBe("Become a therapist");

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

    const clientClinicShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/clinic",
      me: { roles: ["client"], isTherapist: false },
    });
    expect(clientClinicShell.activeArea).toBe("client");
    expect(clientClinicShell.pageTitle).toBe("Bliv Behandler — CVR Onboarding");
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

    // Fallback when /api/backend/clinic/me fails or returns 503 + localized workspace assertions
    render(
      <ConnectedPortalWorkspaceShell locale="en">
        <TherapistMultiWindowWorkspace locale="en" />
        <ClientPortalWorkspace locale="de" />
        <span>FallbackShellChild</span>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByText("FallbackShellChild")).toBeDefined();
      const therapistGreetings = screen.getAllByTestId("therapist-greeting");
      const clientGreetings = screen.getAllByTestId("client-greeting");
      expect(
        therapistGreetings[therapistGreetings.length - 1].textContent
      ).toBe("Therapist Workspace: Therapist");
      expect(clientGreetings[clientGreetings.length - 1].textContent).toBe(
        "Willkommen, Klient"
      );
    });
  });

  it("ClientMarketplaceView excludes self, renders services, requests handshakes, and handles empty/error states", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [
            {
              id: "p-self",
              userUuid: "client-1",
              displayName: "Anders Self",
              organisation: { id: "o-self", name: "Self Org", cvrNumber: "11111111" },
            },
            {
              id: "p-2",
              userUuid: "prov-2",
              displayName: "Dr. Sofie Holm",
              organisation: { id: "o-2", name: "Nordic Kognitiv", cvrNumber: "87654321" },
            },
          ],
          services: [
            {
              id: "srv-1",
              name: "Traumeterapi",
              price: 1100,
              durationMinutes: 60,
              location: "Online",
              currency: "DKK",
              isActive: true,
              provider: { id: "p-2", userUuid: "prov-2" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      });

    render(
      <AuthProvider
        user={{
          id: "client-1",
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <ClientMarketplaceView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Dr. Sofie Holm")).toBeDefined();
      expect(screen.getByText(/Traumeterapi \(60 min\)/)).toBeDefined();
    });
    expect(screen.queryByText("Anders Self")).toBeNull();

    // Failed handshake POST displays ProblemAlert, then dismiss + retry succeeds
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        title: "Validation Error",
        status: 400,
        detail: "Kan ikke oprette dublet-handshake",
        errorCode: ErrorCode.VALIDATION_FAILED,
      }),
    });
    fireEvent.click(screen.getByTestId("request-handshake-prov-2"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    // Successful handshake request & reload
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "hs-1", status: "REQUESTED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          providers: [
            {
              id: "p-2",
              userUuid: "prov-2",
              displayName: "Dr. Sofie Holm",
              organisation: { id: "o-2", name: "Nordic Kognitiv", cvrNumber: "87654321" },
            },
          ],
          services: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "hs-1",
            clientUuid: "client-1",
            therapistUuid: "prov-2",
            therapistName: "Dr. Sofie Holm",
            status: "ACTIVE",
          },
        ],
      });
    fireEvent.click(screen.getByTestId("request-handshake-prov-2"));
    await waitFor(() => {
      expect(screen.getByTestId("handshake-status-prov-2").textContent).toBe("ACTIVE");
    });

    // Empty directory without AuthProvider + error branch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const { unmount } = render(<ClientMarketplaceView />);
    await waitFor(() => {
      expect(
        screen.getByText("Ingen eksterne behandlere er offentliggjort endnu.")
      ).toBeDefined();
    });
    unmount();

    fetchMock.mockRejectedValueOnce(new Error("Network down"));
    render(<ClientMarketplaceView />);
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
  });

  it("ClientConsentAndProfileView updates personal profile, validates blank name, and revokes consent", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userUuid: "client-1",
          fullName: "Anders Sand",
          email: "anders@sand.dk",
          clientProfile: {
            fullName: "Anders Sand",
            email: "anders@sand.dk",
            phoneNumber: "+45 12345678",
            dateOfBirth: "1990-01-01",
            homeAddress: "Bredgade 10",
            postalCode: "1260",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "hs-1",
            therapistName: "Dr. Sofie Holm",
            organisationName: "Nordic Kognitiv",
            status: "ACTIVE",
          },
        ],
      });

    render(
      <AuthProvider
        user={{
          id: "client-1",
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <ClientConsentAndProfileView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("revoke-handshake-hs-1")).toBeDefined();
    });

    // DomainGuard blank fullName error
    fireEvent.change(screen.getByTestId("input-profile-fullName"), {
      target: { value: "  " },
    });
    fireEvent.submit(screen.getByTestId("personal-profile-form"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner").getAttribute("data-error-code")).toBe(
        "VALIDATION_FAILED"
      );
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    // Valid PUT save
    fireEvent.change(screen.getByTestId("input-profile-fullName"), {
      target: { value: "Anders Ny Sand" },
    });
    fireEvent.change(screen.getByTestId("input-profile-email"), {
      target: { value: "anders.ny@sand.dk" },
    });
    fireEvent.change(screen.getByTestId("input-profile-phone"), {
      target: { value: "+45 22 33 44 55" },
    });
    fireEvent.change(screen.getByTestId("input-profile-dob"), {
      target: { value: "1991-02-02" },
    });
    fireEvent.change(screen.getByTestId("input-profile-address"), {
      target: { value: "Nørregade 5" },
    });
    fireEvent.change(screen.getByTestId("input-profile-postalCode"), {
      target: { value: "1165" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "saved" }),
    });
    fireEvent.submit(screen.getByTestId("personal-profile-form"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-saved-badge")).toBeDefined();
    });

    // Failed revoke shows ProblemAlert
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        title: "Forbidden",
        status: 403,
        detail: "Kan ikke tilbagekalde",
        errorCode: ErrorCode.ACCESS_DENIED,
      }),
    });
    fireEvent.click(screen.getByTestId("revoke-handshake-hs-1"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    // Successful revoke reloads empty handshake list
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "hs-1", status: "REVOKED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ userUuid: "" }),
      });
    // Re-mock with userUuid present & revoked handshake, plus check empty fallback
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "hs-1", status: "REVOKED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ userUuid: "client-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "hs-1",
            organisationName: "Nordic Kognitiv",
            status: "REVOKED",
          },
        ],
      });
    fireEvent.click(screen.getByTestId("revoke-handshake-hs-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("revoke-handshake-hs-1")).toBeNull();
    });

    // Initial load failure + empty handshakes
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    render(<ClientConsentAndProfileView />);
    await waitFor(() => {
      expect(
        screen.getByText(/Du har ingen behandlerrelationer endnu/)
      ).toBeDefined();
    });
  });

  it("TherapistClinicOnboardingView manages CVR onboarding, services, and handshakes", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const onSuccess = vi.fn();

    const mockInitialLoad = () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            userUuid: "prov-1",
            fullName: "Dr. Sofie",
            missingProfileFields: ["cvrNumber", "iban"],
            providerProfile: {
              displayName: "Dr. Sofie",
              iban: "",
              currency: "DKK",
              workingHoursJson: "09:00-17:00",
              organisation: {
                name: "",
                cvrNumber: "",
                address: "",
                postalCode: "",
                phoneNumber: "",
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "srv-1",
              name: "EMDR Session",
              price: 1200,
              durationMinutes: 60,
              location: "Klinik",
              currency: "DKK",
              isActive: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            { id: "hs-2", clientName: "Anders Sand", status: "REQUESTED" },
            { id: "hs-3", clientUuid: "client-3", status: "ACTIVE" },
          ],
        });
    };

    mockInitialLoad();
    render(<TherapistClinicOnboardingView onOnboardingSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-missing-fields")).toBeDefined();
      expect(screen.getByText(/EMDR Session/)).toBeDefined();
      expect(screen.getByTestId("approve-handshake-hs-2")).toBeDefined();
      expect(screen.getByTestId("terminate-handshake-hs-3")).toBeDefined();
    });

    // DomainGuard blank organisation error
    fireEvent.submit(screen.getByTestId("therapist-onboarding-form"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner").getAttribute("data-error-code")).toBe(
        "VALIDATION_FAILED"
      );
    });

    // DomainGuard invalid CVR error
    fireEvent.change(screen.getByTestId("input-onboard-orgName"), {
      target: { value: "Klinik Nord" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-cvr"), {
      target: { value: "123" },
    });
    fireEvent.submit(screen.getByTestId("therapist-onboarding-form"));
    await waitFor(() => {
      expect(screen.getByTestId("error-detail").textContent).toContain("8 Danish digits");
    });

    // Valid onboarding submit
    fireEvent.change(screen.getByTestId("input-onboard-cvr"), {
      target: { value: "39485712" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-displayName"), {
      target: { value: "Dr. Sofie" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-iban"), {
      target: { value: "DK5000400440116243" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-currency"), {
      target: { value: "EUR" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-hours"), {
      target: { value: "08:00-16:00" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-address"), {
      target: { value: "Vesterbrogade 1" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-postalCode"), {
      target: { value: "1620" },
    });
    fireEvent.change(screen.getByTestId("input-onboard-phone"), {
      target: { value: "+4533112233" },
    });

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    mockInitialLoad();
    fireEvent.submit(screen.getByTestId("therapist-onboarding-form"));
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-saved-badge")).toBeDefined();
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    // Blank service error -> then create valid service
    fireEvent.submit(screen.getByTestId("therapist-service-form"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fireEvent.change(screen.getByTestId("input-service-name"), {
      target: { value: "Kropsterapi" },
    });
    fireEvent.change(screen.getByTestId("input-service-price"), {
      target: { value: "950" },
    });
    fireEvent.change(screen.getByTestId("input-service-duration"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByTestId("input-service-location"), {
      target: { value: "Aarhus" },
    });
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "srv-2" }) });
    mockInitialLoad();
    fireEvent.submit(screen.getByTestId("therapist-service-form"));
    await waitFor(() => {
      expect(
        (screen.getByTestId("input-service-name") as HTMLInputElement).value
      ).toBe("");
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    // Toggle service, delete service, approve handshake, terminate handshake
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    mockInitialLoad();
    fireEvent.click(screen.getByTestId("toggle-service-srv-1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
    mockInitialLoad();
    fireEvent.click(screen.getByTestId("delete-service-srv-1"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    mockInitialLoad();
    fireEvent.click(screen.getByTestId("approve-handshake-hs-2"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    mockInitialLoad();
    fireEvent.click(screen.getByTestId("terminate-handshake-hs-3"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    // Error paths on toggle/delete/handshake/initial load
    fetchMock.mockRejectedValueOnce(new Error("Toggle fail"));
    fireEvent.click(screen.getByTestId("toggle-service-srv-1"));
    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fetchMock.mockRejectedValueOnce(new Error("Delete fail"));
    fireEvent.click(screen.getByTestId("delete-service-srv-1"));
    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fetchMock.mockRejectedValueOnce(new Error("Handshake fail"));
    fireEvent.click(screen.getByTestId("approve-handshake-hs-2"));
    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fetchMock.mockRejectedValueOnce(new Error("Load fail"));
    render(<TherapistClinicOnboardingView />);
    await waitFor(() => expect(screen.getAllByTestId("error-banner").length).toBeGreaterThan(0));
  });

  it("ProfileSettingsWorkspace renders role-appropriate views for CLIENT vs PROVIDER", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ userUuid: "" }),
    });
    global.fetch = fetchMock;

    const { rerender } = render(
      <AuthProvider
        user={{
          id: "c-1",
          name: "Anders",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <ProfileSettingsWorkspace />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("client-consent-profile-view")).toBeDefined();
    });
    expect(screen.queryByTestId("therapist-onboarding-view")).toBeNull();

    rerender(
      <AuthProvider
        user={{
          id: "p-1",
          name: "Sofie",
          email: "sofie@klinik.dk",
          roles: ["PROVIDER"],
        }}
      >
        <ProfileSettingsWorkspace />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("client-consent-profile-view")).toBeDefined();
      expect(screen.getByTestId("therapist-onboarding-view")).toBeDefined();
    });
  });
});
