import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
  localizeHandshakeStatus,
  localizeMissingField,
  deduplicateClinicProviders,
  deduplicateClinicServices,
  filterAndDeduplicateClinicClients,
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
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.getByText("Mette Lind")).toBeDefined();

    fireEvent.click(screen.getByTestId("delete-clinic-client-c-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

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
    expect(
      clientShell.navItems.some((item) => item.href === "/da/dashboard/personal?tab=journal")
    ).toBe(true);

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
    expect(therapistOverview.defaultSidebarCollapsed).toBe(false);
    expect(therapistOverview.upgradeAction).toBeUndefined();
    expect(therapistOverview.profileSubtext).toContain("Bankkonto (IBAN)");
    expect(
      therapistOverview.navItems.some(
        (item) => item.href === "/da/dashboard/therapist?tab=timeline"
      )
    ).toBe(true);

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
    expect(clientClinicShell.navItems.every((item) => !item.active)).toBe(true);

    // Pure helper localization & deduplication checks
    expect(localizeHandshakeStatus("ACTIVE", "da")).toBe("Aktiv");
    expect(localizeHandshakeStatus("REVOKED", "en")).toBe("Revoked");
    expect(localizeHandshakeStatus("CUSTOM_STATE", "fr")).toBe("CUSTOM_STATE");
    expect(localizeHandshakeStatus("", "es")).toBe("-");
    expect(localizeMissingField("cvrNumber", "da")).toBe("CVR-nummer");
    expect(localizeMissingField("unknownKey", "de")).toBe("unknownKey");
    expect(localizeMissingField("  ", "da")).toBe("");
    expect(
      deduplicateClinicProviders([
        { id: "p1", userUuid: "u-1", displayName: "Dr. Bo" },
        { id: "p2", userUuid: "u-1", displayName: "Dr. Bo Dup" },
        { id: "p3", displayName: "" },
        { id: "p4", displayName: "Dr. Eva" },
        { id: "p5", userUuid: "u-maja-1", displayName: "Dr. maja_terapeut" },
        { id: "p6", userUuid: "u-maja-2", displayName: "dr. maja_terapeut " },
      ])
    ).toHaveLength(4);
    expect(
      filterAndDeduplicateClinicClients(
        [
          { id: "c-self", userId: "u-self", fullName: "bo jensen", email: "bo@klinik.dk" },
          { id: "c-self-mail", userId: "u-other", fullName: "Bo Mail", email: "Bo@Klinik.dk" },
          { id: "c-dr", userId: "u-dr-1", fullName: "Dr. maja_terapeut", email: "m1@klinik.dk" },
          { id: "c-ter-mail", userId: "u-ter-2", fullName: "Sofie", email: "sofie_terapeut@klinik.dk" },
          { id: "c-1", userId: "u-real-1", fullName: "Anders Sand", email: "anders@sand.dk" },
          { id: "c-1-dup-id", userId: "u-real-1", fullName: "Anders Copy", email: "dup@sand.dk" },
          { id: "c-2", userId: "u-real-2", fullName: "anders sand", email: "anders2@sand.dk" },
          { id: "c-empty", fullName: "", email: "" },
          { id: "c-maria", fullName: "Maria Hansen", email: "maria@hansen.dk" },
        ],
        { excludeUserId: "u-self", excludeEmail: "bo@klinik.dk" }
      ).map((c) => c.id)
    ).toEqual(["c-1", "c-empty", "c-maria"]);
    expect(
      deduplicateClinicServices([
        { id: "s1", name: "Terapi", durationMinutes: 60, price: 900 },
        { id: "s2", name: " terapi ", durationMinutes: 60, priceDkk: 900 },
        { id: "s3", name: "EMDR", durationMinutes: 90, price: 1400 },
      ])
    ).toHaveLength(2);
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

    const { rerender, unmount: unmountMainShell } = render(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist">
        <TherapistMultiWindowWorkspace activeTab="overview" />
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

    // Duplicated horizontal top-tab rows are removed
    expect(screen.queryByTestId("tab-btn-calendar")).toBeNull();
    expect(screen.queryByTestId("client-tab-appointments")).toBeNull();

    // Quick-open CTA from overview opens timeline workspace panel
    fireEvent.click(screen.getByTestId("therapist-open-timeline-btn"));
    rerender(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist" activeTab="timeline">
        <TherapistMultiWindowWorkspace activeTab="timeline" />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("therapist-timeline-panel")).toBeDefined();
    });

    // Verify all TherapistMultiWindowWorkspace tabs render via activeTab prop
    rerender(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist" activeTab="calendar">
        <TherapistMultiWindowWorkspace activeTab="calendar" />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("therapist-calendar-panel")).toBeDefined();
    });

    rerender(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist" activeTab="clinic_cvr">
        <TherapistMultiWindowWorkspace activeTab="clinic_cvr" />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("clinic-cvr-panel")).toBeDefined();
    });

    rerender(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist" activeTab="pcl5">
        <TherapistMultiWindowWorkspace activeTab="pcl5" />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("therapist-pcl5-panel")).toBeDefined();
    });

    rerender(
      <ConnectedPortalWorkspaceShell pathname="/da/dashboard/therapist" activeTab="finance">
        <TherapistMultiWindowWorkspace activeTab="finance" />
        <ClientPortalWorkspace />
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => {
      expect(screen.getByTestId("therapist-finance-panel")).toBeDefined();
    });
    unmountMainShell();

    // Quick-action cards, "Min Dagbog", and header CTA in ClientPortalWorkspace
    const { rerender: rerenderClient, unmount: unmountClient } = render(
      <ClientPortalWorkspace userName="Borger Hansen" initialTab="overview" />
    );
    fireEvent.click(screen.getByText("Mine Aftaler"));
    await waitFor(() => {
      expect(screen.getByTestId("client-appointments-panel")).toBeDefined();
    });

    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="overview" />);
    fireEvent.click(screen.getByTestId("client-card-journal"));
    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="journal" />);
    await waitFor(() => {
      expect(screen.getByTestId("client-journal-panel")).toBeDefined();
    });

    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="overview" />);
    fireEvent.click(screen.getByText("Samtykke & Profil", { selector: "div.text-sm" }));
    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="consents" />);
    await waitFor(() => {
      expect(screen.getByTestId("client-consents-panel")).toBeDefined();
    });

    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="overview" />);
    fireEvent.click(screen.getByText("PCL-5 Screening"));
    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="pcl5" />);
    await waitFor(() => {
      expect(screen.getByTestId("client-pcl5-panel")).toBeDefined();
    });

    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="marketplace" />);
    await waitFor(() => {
      expect(screen.getByTestId("client-marketplace-panel")).toBeDefined();
    });

    rerenderClient(<ClientPortalWorkspace userName="Borger Hansen" activeTab="finance" />);
    await waitFor(() => {
      expect(screen.getByTestId("client-finance-panel")).toBeDefined();
    });
    unmountClient();

    // Uncontrolled ClientPortalWorkspace header CTA -> marketplace & sanitized secureStatus
    const { unmount: unmountSanitized } = render(
      <ClientPortalWorkspace
        userName="Borger Test"
        secureStatus="This is highly sensitive enterprise data!"
      />
    );
    expect(screen.getByTestId("client-secure-status").textContent).toBe(
      "Sikkerhedstjek: Krypteret klinisk forbindelse aktiv"
    );
    expect(screen.getByTestId("client-secure-status").textContent).not.toContain(
      "sensitive enterprise data"
    );
    fireEvent.click(screen.getByTestId("client-find-therapist-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("client-marketplace-panel")).toBeDefined();
    });
    unmountSanitized();

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
      expect(screen.getByTestId("handshake-status-prov-2").textContent).toBe("Aktiv");
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

    // Per-handshake datadeling settings panel & PATCH save + toggle collapse + error path
    fireEvent.click(screen.getByTestId("toggle-handshake-settings-hs-1"));
    expect(screen.getByTestId("handshake-settings-panel-hs-1")).toBeDefined();
    fireEvent.change(screen.getByTestId("input-hs-start-hs-1"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("input-hs-end-hs-1"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.click(screen.getByTestId("input-hs-no-mood-hs-1"));

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "hs-1", status: "ACTIVE" }),
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
            therapistName: "Dr. Sofie Holm",
            organisationName: "Nordic Kognitiv",
            status: "ACTIVE",
            historyStartDate: "2026-01-01",
            historyEndDate: "2026-10-31",
            customRestrictions: "NO_MOOD_SCORES",
          },
        ],
      });
    fireEvent.click(screen.getByTestId("save-handshake-settings-hs-1"));
    await waitFor(() => {
      expect(screen.getByTestId("handshake-settings-saved")).toBeDefined();
    });
    const patchCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/handshakes/hs-1/status") && (c[1] as RequestInit)?.method === "PATCH"
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String((patchCall![1] as RequestInit).body))).toEqual({
      historyStartDate: "2026-01-01",
      historyEndDate: "2026-10-31",
      customRestrictions: "NO_MOOD_SCORES",
    });

    // Save datadeling failure shows ProblemAlert, then collapse toggle closes panel
    fetchMock.mockRejectedValueOnce(new Error("Patch failed"));
    fireEvent.click(screen.getByTestId("save-handshake-settings-hs-1"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));
    fireEvent.click(screen.getByTestId("toggle-handshake-settings-hs-1"));
    expect(screen.queryByTestId("handshake-settings-panel-hs-1")).toBeNull();

    // Failed revoke shows ProblemAlert after confirming dialog
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
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.getByTestId("revoke-handshake-hs-1")).toBeDefined();
    fireEvent.click(screen.getByTestId("revoke-handshake-hs-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
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
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
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
              price: 2,
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
      target: { value: "2" },
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
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    fireEvent.click(screen.getByTestId("delete-service-srv-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
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
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    // Error paths on toggle/delete/handshake/initial load
    fetchMock.mockRejectedValueOnce(new Error("Toggle fail"));
    fireEvent.click(screen.getByTestId("toggle-service-srv-1"));
    await waitFor(() => expect(screen.getByTestId("error-banner")).toBeDefined());
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fetchMock.mockRejectedValueOnce(new Error("Delete fail"));
    fireEvent.click(screen.getByTestId("delete-service-srv-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
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

  it("paginates lists with more than 10 items across clinic, marketplace, and onboarding views", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const twelveClients = Array.from({ length: 12 }, (_, idx) => ({
      id: `cl-${idx + 1}`,
      fullName: `Klient ${idx + 1}`,
      email: `k${idx + 1}@example.dk`,
    }));
    const twelveProviders = Array.from({ length: 12 }, (_, idx) => ({
      id: `pr-${idx + 1}`,
      userUuid: `u-pr-${idx + 1}`,
      displayName: `Dr. Praksis ${idx + 1}`,
      organisation: { id: `org-${idx + 1}`, name: `Klinik ${idx + 1}`, cvrNumber: "12345678" },
    }));
    const twelveServices = Array.from({ length: 12 }, (_, idx) => ({
      id: `sr-${idx + 1}`,
      name: `Ydelse ${idx + 1}`,
      priceDkk: 900 + idx,
      durationMinutes: 50,
      currency: "DKK",
      isActive: idx % 2 === 0,
    }));

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => twelveClients })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ providers: twelveProviders, services: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ userUuid: "prov-1", fullName: "Dr. Sofie" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => twelveServices })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });

    render(
      <>
        <ClinicPlatformFeatureView />
        <ClientMarketplaceView />
        <TherapistClinicOnboardingView />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId("clinic-clients-pagination")).toBeDefined();
      expect(screen.getByTestId("marketplace-pagination")).toBeDefined();
      expect(screen.getByTestId("services-pagination")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("clinic-clients-next"));
    expect(screen.getByText("Klient 12")).toBeDefined();
    fireEvent.click(screen.getByTestId("clinic-clients-prev"));
    expect(screen.getByText("Klient 1")).toBeDefined();

    fireEvent.click(screen.getByTestId("marketplace-next"));
    expect(screen.getByText("Dr. Praksis 12")).toBeDefined();
    fireEvent.click(screen.getByTestId("marketplace-prev"));
    expect(screen.getByText("Dr. Praksis 1")).toBeDefined();

    fireEvent.click(screen.getByTestId("services-next"));
    expect(screen.getByText("Ydelse 12")).toBeDefined();
    fireEvent.click(screen.getByTestId("services-prev"));
    expect(screen.getByText("Ydelse 1")).toBeDefined();
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
    expect(screen.queryByTestId("settings-clinic-shortcut-card")).toBeNull();

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
      expect(screen.queryByTestId("therapist-onboarding-view")).toBeNull();
      expect(screen.getByTestId("settings-clinic-shortcut-card")).toBeDefined();
      expect(
        screen.getByTestId("settings-open-clinic-cvr-link").getAttribute("href")
      ).toBe("/da/dashboard/clinic");
    });
  });

  it("covers fallback helpers, empty handshake sharing save, revoking open handshake, and marketplace/onboarding fallbacks", async () => {
    expect(localizeMissingField("")).toBe("");
    expect(localizeMissingField("cvrNumber")).toBe("CVR-nummer");
    expect(localizeMissingField("cvrNumber", "zz" as never)).toBe("Company registration ID");
    expect(localizeMissingField("customFieldKey", "en")).toBe("customFieldKey");
    expect(localizeHandshakeStatus("ACTIVE")).toBe("Aktiv");
    expect(localizeHandshakeStatus("CUSTOM_X", "zz" as never)).toBe("CUSTOM_X");

    const dedupProv = deduplicateClinicProviders([
      { userId: "u-1", displayName: "A" } as never,
      { userId: "u-1", displayName: "A Dup" } as never,
      { fullName: "Dr. Full" } as never,
      { id: "id-only" } as never,
      {} as never,
    ]);
    expect(dedupProv).toHaveLength(4);

    const dedupSrv = deduplicateClinicServices([
      { name: undefined, durationMinutes: undefined, price: undefined, priceDkk: undefined } as never,
      { name: "Standard", durationMinutes: 50, price: 800 } as never,
    ]);
    expect(dedupSrv).toHaveLength(2);

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/api/backend/clinic/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            userUuid: "c-fb-1",
            fullName: "Fallback Klient",
            clientProfile: {},
            providerProfile: { organisation: {} },
          }),
        };
      }
      if (url.includes("/api/backend/clinic/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [
              {
                id: "pr-nuid",
                displayName: "Uden UUID Behandler",
                organisation: { id: "org-1", name: "Basis Klinik", cvrNumber: "12345678" },
              },
            ],
            services: [
              {
                id: "srv-price-only",
                name: "Basiskonsultation",
                price: 750,
                durationMinutes: 45,
                provider: { id: "pr-nuid" },
              },
            ],
          }),
        };
      }
      if (url.includes("/api/backend/clinic/handshakes/client/")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "hs-open-1",
              therapistUuid: "t-open-1",
              therapistName: "Dr. Open",
              organisationName: "Åben Klinik",
              status: "ACTIVE",
              historyStartDate: "2026-01-01",
              historyEndDate: "2026-06-01",
              customRestrictions: "NO_MOOD_SCORES",
            },
          ],
        };
      }
      if (url.includes("/api/backend/clinic/handshakes/hs-open-1/status") && method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({ id: "hs-open-1", status: "ACTIVE" }) };
      }
      if (url.includes("/api/backend/clinic/handshakes/hs-open-1") && method === "DELETE") {
        return { ok: true, status: 204 };
      }
      if (url.includes("/api/backend/clinic/services")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "srv-onb-1",
              name: "Onb Ydelse",
              price: 650,
              durationMinutes: 50,
              isActive: true,
            },
          ],
        };
      }
      if (url.includes("/api/backend/clinic/handshakes/therapist/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ notAnArray: true }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    global.fetch = fetchMock;

    render(
      <AuthProvider
        user={{ id: "c-fb-1", name: "Fallback Klient", email: "fb@dk", roles: ["CLIENT"] }}
      >
        <ClientMarketplaceView />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("Uden UUID Behandler")).toBeDefined();
      expect(screen.getByText(/750 DKK/)).toBeDefined();
    });
    cleanup();

    render(<ClientConsentAndProfileView />);
    await waitFor(() => {
      expect(screen.getByTestId("toggle-handshake-settings-hs-open-1")).toBeDefined();
    });

    // Expand settings, clear dates and checkbox, save empty payload, then revoke while panel stays open
    fireEvent.click(screen.getByTestId("toggle-handshake-settings-hs-open-1"));
    expect(screen.getByTestId("handshake-settings-panel-hs-open-1")).toBeDefined();
    fireEvent.change(screen.getByTestId("input-hs-start-hs-open-1"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-hs-end-hs-open-1"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("input-hs-no-mood-hs-open-1"));
    fireEvent.click(screen.getByTestId("save-handshake-settings-hs-open-1"));
    await waitFor(() => {
      expect(screen.getByTestId("handshake-settings-saved")).toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/handshakes/hs-open-1/status") && (c[1] as RequestInit)?.method === "PATCH"
    );
    expect(JSON.parse(String((patchCall![1] as RequestInit).body))).toEqual({
      historyStartDate: "",
      historyEndDate: "",
      customRestrictions: "",
    });

    // Keep panel expanded and revoke -> covers expandedHandshakeId === handshakeId reset
    fireEvent.click(screen.getByTestId("revoke-handshake-hs-open-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.queryByTestId("handshake-settings-panel-hs-open-1")).toBeNull();
    });
    cleanup();

    // Non-array handshakes + price-only service in TherapistClinicOnboardingView + terminate cancel
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/clinic/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            userUuid: "prov-fb-1",
            fullName: "Dr. Fallback",
            providerProfile: { displayName: "Dr. Fallback", organisation: { name: "Klinik" } },
          }),
        };
      }
      if (url.includes("/api/backend/clinic/services")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "srv-fb", name: "Basis", price: 650, durationMinutes: 50, isActive: false }],
        };
      }
      if (url.includes("/api/backend/clinic/handshakes/therapist/")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "hs-term-cancel", clientName: "Anne", status: "ACTIVE" },
          ],
        };
      }
      if (url.includes("/api/backend/clinic/handshakes/client/")) {
        return { ok: true, status: 200, json: async () => ({ notAnArray: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <>
        <ClientConsentAndProfileView />
        <TherapistClinicOnboardingView />
      </>
    );
    await waitFor(() => {
      expect(screen.getByTestId("terminate-handshake-hs-term-cancel")).toBeDefined();
      expect(screen.getByText(/650 DKK/)).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("terminate-handshake-hs-term-cancel"));
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    cleanup();

    // Cover helper edge fallbacks & non-array responses in TherapistClinicOnboardingView
    const mergedProviders = deduplicateClinicProviders([
      { fullName: "Dr. Sam", displayName: "" },
      { userUuid: "p-sam-2", fullName: "Dr. Sam", displayName: "Dr. Sam" },
    ]);
    expect(mergedProviders).toHaveLength(1);
    expect(mergedProviders[0].displayName).toBe("Dr. Sam");

    expect(
      filterAndDeduplicateClinicClients([{ id: "  ", userId: "  ", fullName: "No Id Klient" }])
    ).toHaveLength(1);

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({ userUuid: "prov-empty", fullName: "Me Fallback Navn" }) };
      }
      if (url.includes("/api/backend/clinic/providers")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes("/api/backend/clinic/services") || url.includes("/api/backend/clinic/handshakes/therapist/")) {
        return { ok: true, status: 200, json: async () => ({ unexpectedObject: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(<TherapistClinicOnboardingView />);
    await waitFor(() => {
      expect((screen.getByTestId("input-onboard-displayName") as HTMLInputElement).value).toBe("Me Fallback Navn");
    });
    cleanup();

    // Cover mapMeToAuthenticatedUser fallbacks, settings tab shell config, and non-Error reject + non-array handshakes
    const anonMapped = mapMeToAuthenticatedUser({});
    expect(anonMapped.id).toBe("anonymous");
    expect(anonMapped.name).toBe("Bruger");
    expect(anonMapped.roles).toEqual(["CLIENT"]);

    const settingsShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/clinic",
      tab: "settings",
      me: { isTherapist: true },
    });
    expect(settingsShell.navItems.some((n) => n.active)).toBe(true);

    const adminShell = resolvePortalShellConfig({
      locale: "da",
      pathname: "/da/dashboard/admin",
    });
    expect(adminShell.navItems[0].active).toBe(true);
    expect(filterAndDeduplicateClinicClients([{ id: "c-no-email", fullName: "Uden Email" }])).toHaveLength(1);

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({ unexpected: true }) };
      }
      if (u.includes("/api/backend/clinic/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [{ id: "p-key-only", userUuid: "p-uuid-key", displayName: "UuidKeyTerapeut" }],
            services: [
              { id: "s-dkk-fallback", name: "BasisYdelse", durationMinutes: 50, priceDkk: 790, currency: "", provider: { id: "p-key-only" } },
            ],
          }),
        };
      }
      if (u.includes("/api/backend/clinic/handshakes/client/")) {
        return { ok: true, status: 200, json: async () => ({ notArray: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <AuthProvider user={{ id: "c-mkt-2", name: "", email: "", roles: ["CLIENT"] }}>
        <ClientMarketplaceView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("UuidKeyTerapeut")).toBeDefined());
    expect(screen.getByText(/790 DKK/)).toBeDefined();
    cleanup();

    // Unauthenticated ClientMarketplaceView (no AuthProvider -> empty clientUuid) + ClinicPlatformFeatureView empty fullName avatar
    render(<ClientMarketplaceView />);
    await waitFor(() => expect(screen.getByText("UuidKeyTerapeut")).toBeDefined());
    cleanup();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ id: "c-blank-name", fullName: "", email: "blank@dk.dk" }],
    });
    render(<ClinicPlatformFeatureView />);
    await waitFor(() => expect(screen.getByText("?")).toBeDefined());
    cleanup();

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({ unexpected: true }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    render(
      <ConnectedPortalWorkspaceShell locale="da" pathname="/da/dashboard/personal">
        <div>shell-body</div>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => expect(screen.getByText("shell-body")).toBeDefined());
    cleanup();

    global.fetch = vi.fn().mockRejectedValue("string rejection");
    render(
      <AuthProvider user={{ id: "c-mkt-3", name: "", email: "", roles: ["CLIENT"] }}>
        <ClientMarketplaceView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("error-detail").textContent).toContain("Unexpected error"));
    cleanup();

    // Cover empty keys, !res.ok shell me, provider without id, and empty /clinic/me in onboarding
    expect(deduplicateClinicServices([{ name: "" } as never])).toHaveLength(1);
    expect(filterAndDeduplicateClinicClients([{} as never])).toHaveLength(1);

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    render(
      <ConnectedPortalWorkspaceShell locale="da" pathname="/da/dashboard/settings">
        <div>unauth-shell</div>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => expect(screen.getByText("unauth-shell")).toBeDefined());
    cleanup();

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (u.includes("/api/backend/clinic/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [{ userUuid: "p-no-id", displayName: "UdenIdTerapeut" }],
            services: [],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    render(
      <>
        <ClientMarketplaceView />
        <TherapistClinicOnboardingView />
      </>
    );
    await waitFor(() => expect(screen.getByText("UdenIdTerapeut")).toBeDefined());
    cleanup();

    // Cover pending handshake badge in shell, edujournal:me-refresh, therapist alert CTA, and marketplace search
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            authenticated: true,
            userUuid: "th-pend-1",
            username: "drpend",
            roles: ["THERAPIST", "CLIENT"],
            isTherapist: true,
          }),
        };
      }
      if (u.includes("/api/backend/clinic/handshakes/therapist/th-pend-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "hs-req-1", clientUuid: "c-1", therapistUuid: "th-pend-1", status: "REQUESTED" },
            { id: "hs-act-1", clientUuid: "c-2", therapistUuid: "th-pend-1", status: "ACTIVE" },
          ],
        };
      }
      if (u.includes("/api/backend/clinic/directory")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            providers: [
              { id: "pr-1", userUuid: "th-a", displayName: "Sofie Lind", organisation: { name: "Ro Klink", cvrNumber: "11223344" } },
              { id: "pr-2", userUuid: "th-b", displayName: "Lars Holm", organisation: { name: "Nord Klink", cvrNumber: "87654321" } },
              { id: "pr-empty", userUuid: "th-e" },
            ],
            services: [
              { id: "sv-1", name: "EMDR Session", provider: { id: "pr-1", userUuid: "th-a" } },
              { id: "sv-noname", provider: { id: "pr-empty", userUuid: "th-e" } },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const onTabChange = vi.fn();
    render(
      <AuthProvider user={{ id: "th-pend-1", name: "Dr. Pend", email: "pend@dk.dk", roles: ["THERAPIST", "PROVIDER"] }}>
        <ConnectedPortalWorkspaceShell locale="da" pathname="/da/dashboard/therapist" activeTab="overview">
          <TherapistMultiWindowWorkspace activeTab="overview" onTabChange={onTabChange} />
        </ConnectedPortalWorkspaceShell>
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("therapist-pending-handshakes-alert")).toBeDefined());
    window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    fireEvent.click(screen.getByTestId("therapist-review-handshakes-btn"));
    expect(onTabChange).toHaveBeenCalledWith("clinic_cvr");
    cleanup();

    render(
      <AuthProvider user={{ id: "c-search", name: "Search Klient", email: "s@dk.dk", roles: ["CLIENT"] }}>
        <ClientMarketplaceView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("marketplace-search-input")).toBeDefined());
    fireEvent.change(screen.getByTestId("marketplace-search-input"), { target: { value: "EMDR" } });
    expect(screen.getByText(/Sofie Lind/)).toBeDefined();
    expect(screen.queryByText(/Lars Holm/)).toBeNull();
    fireEvent.change(screen.getByTestId("marketplace-search-input"), { target: { value: "Ro Klink" } });
    expect(screen.getByText(/Sofie Lind/)).toBeDefined();
    fireEvent.change(screen.getByTestId("marketplace-search-input"), { target: { value: "87654321" } });
    expect(screen.getByText(/Lars Holm/)).toBeDefined();
    fireEvent.change(screen.getByTestId("marketplace-search-input"), { target: { value: "nonexistent-xyz" } });
    expect(screen.queryByTestId("marketplace-provider-list")).toBeNull();
    cleanup();

    // Cover non-therapist client shell (hasTherapistAccess = false) + rejected handshake catch in therapist workspace
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, userUuid: "c-only", roles: ["CLIENT"], isTherapist: false }) };
      }
      if (u.includes("/api/backend/clinic/handshakes/therapist/")) {
        throw new Error("offline");
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    render(
      <ConnectedPortalWorkspaceShell locale="da" pathname="/da/dashboard/personal">
        <div>client-shell</div>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => expect(screen.getByText("client-shell")).toBeDefined());
    cleanup();

    render(
      <AuthProvider user={{ id: "th-err-hs", name: "Dr. Err", email: "err@dk.dk", roles: ["PROVIDER"] }}>
        <TherapistMultiWindowWorkspace activeTab="overview" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("therapist-multi-window-workspace")).toBeDefined());
    cleanup();

    // Cover ConnectedPortalWorkspaceShell when role comes from roles=['PROVIDER'] & handshakes returns !res.ok
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/api/backend/clinic/me")) {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, userUuid: "p-hs-fail", roles: ["PROVIDER"], isTherapist: false }) };
      }
      if (u.includes("/api/backend/clinic/handshakes/therapist/")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    render(
      <ConnectedPortalWorkspaceShell locale="da" pathname="/da/dashboard/therapist">
        <div>provider-hs-fail</div>
      </ConnectedPortalWorkspaceShell>
    );
    await waitFor(() => expect(screen.getByText("provider-hs-fail")).toBeDefined());
    cleanup();
  });
});
