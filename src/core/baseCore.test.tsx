import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  FrontendDomainException,
  HasId,
  ProblemDetail,
  expandRoleAliases,
  matchesAnyRole,
} from "./baseDomainCore";
import {
  AuthProvider,
  ConfirmActionDialog,
  PortalWorkspaceShell,
  ProblemAlert,
  RoleGuard,
  useAuth,
  useBaseCrud,
  useOptionalAuth,
} from "./baseUiCore";
import { AuthGateway } from "./authGateway";

interface TestEntityDto extends HasId<string> {
  id?: string;
  name: string;
  amount?: number;
}

class TestEntityApiService extends BaseApiService<TestEntityDto, string> {
  constructor() {
    super("/api/backend/test-entities");
  }

  protected override validateBeforeCreate(dto: Partial<TestEntityDto>): void {
    DomainGuard.requireNotBlank(dto.name, "Entity name", "name");
    if (dto.amount !== undefined) {
      DomainGuard.requirePositive(dto.amount, "Amount", "amount");
    }
  }

  protected override validateBeforeUpdate(
    _id: string,
    dto: Partial<TestEntityDto>
  ): void {
    if (dto.name !== undefined) {
      DomainGuard.requireNotBlank(dto.name, "Entity name", "name");
    }
  }
}

const CrudHarness: React.FC<{
  service: TestEntityApiService;
  autoFetch?: boolean;
}> = ({ service, autoFetch = true }) => {
  const { items, loading, error, fetchAll, create, update, remove, clearError } =
    useBaseCrud(service, autoFetch);

  return (
    <div>
      <ProblemAlert error={error} onDismiss={clearError} />
      {loading && <span data-testid="loading">Loading</span>}
      <button
        type="button"
        data-testid="btn-fetch"
        onClick={() => fetchAll()}
      >
        Fetch
      </button>
      <button
        type="button"
        data-testid="btn-create-valid"
        onClick={() => create({ name: "Created Item", amount: 10 })}
      >
        Create Valid
      </button>
      <button
        type="button"
        data-testid="btn-create-invalid"
        onClick={() => create({ name: "   " })}
      >
        Create Invalid
      </button>
      <button
        type="button"
        data-testid="btn-update"
        onClick={() => update("1", { name: "Updated Item" })}
      >
        Update 1
      </button>
      <button
        type="button"
        data-testid="btn-delete"
        onClick={() => remove("1")}
      >
        Delete 1
      </button>
      <ul data-testid="items-list">
        {items.map((i) => (
          <li key={i.id}>{i.name}</li>
        ))}
      </ul>
    </div>
  );
};

describe("baseDomainCore & baseUiCore (2-File Core Architecture)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("DomainGuard & FrontendDomainException", () => {
    it("validates requireNotBlank, check, and requirePositive", () => {
      expect(() =>
        DomainGuard.requireNotBlank("Valid", "Field", "field")
      ).not.toThrow();
      expect(() => DomainGuard.check(true, "Ok")).not.toThrow();
      expect(() => DomainGuard.requirePositive(42, "Price", "price")).not.toThrow();

      expect(() =>
        DomainGuard.requireNotBlank("   ", "Client Name", "clientName")
      ).toThrowError(FrontendDomainException);

      try {
        DomainGuard.requireNotBlank("", "Client Name", "clientName");
      } catch (err) {
        expect(err).toBeInstanceOf(FrontendDomainException);
        const domainErr = err as FrontendDomainException;
        expect(domainErr.status).toBe(400);
        expect(domainErr.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
        expect(domainErr.is(ErrorCode.VALIDATION_FAILED)).toBe(true);
        expect(domainErr.is(ErrorCode.CONFLICT)).toBe(false);
        expect(domainErr.problem.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
        expect(domainErr.problem.status).toBe(400);
        expect(domainErr.problem.fieldErrors).toEqual({
          clientName: "Client Name must not be blank",
        });
      }

      try {
        DomainGuard.check(false, "Custom invariant failed", ErrorCode.CONFLICT);
      } catch (err) {
        const domainErr = err as FrontendDomainException;
        expect(domainErr.problem.errorCode).toBe(ErrorCode.CONFLICT);
        expect(domainErr.problem.fieldErrors).toBeUndefined();
      }

      const fallbackTitleErr = new FrontendDomainException({
        title: "FallbackTitleOnly",
        status: 422,
        detail: "",
        errorCode: ErrorCode.UNPROCESSABLE_ENTITY,
        timestamp: new Date().toISOString(),
      });
      expect(fallbackTitleErr.message).toBe("FallbackTitleOnly");
      expect(fallbackTitleErr.problem.type).toBe("about:blank");

      const defaultCtorErr = new FrontendDomainException("DefaultMsg");
      expect(defaultCtorErr.status).toBe(400);

      expect(() => DomainGuard.requirePositive(0, "Total", "total")).toThrow(
        "Total must be greater than zero"
      );
      expect(() =>
        DomainGuard.requirePositive(undefined, "Total", "total")
      ).toThrow("Total must be greater than zero");

      try {
        DomainGuard.requireNotBlank("", "OmittedKeyField");
      } catch (err) {
        expect((err as FrontendDomainException).problem.fieldErrors).toEqual({
          OmittedKeyField: "OmittedKeyField must not be blank",
        });
      }
      try {
        DomainGuard.requirePositive(0, "OmittedKeyAmount");
      } catch (err) {
        expect((err as FrontendDomainException).problem.fieldErrors).toEqual({
          OmittedKeyAmount: "OmittedKeyAmount must be greater than zero",
        });
      }
    });
  });

  describe("BaseApiService CRUD & RFC 7807 ProblemDetail handling", () => {
    it("executes getAll, getPage, getById, create, update, and 204 delete", async () => {
      const service = new TestEntityApiService();
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: "1", name: "Alpha" }],
      });
      const all = await service.getAll();
      expect(all).toEqual([{ id: "1", name: "Alpha" }]);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ id: "1", name: "Alpha" }],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        }),
      });
      const page = await service.getPage();
      expect(page.totalElements).toBe(1);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", name: "Alpha" }),
      });
      const single = await service.getById("1");
      expect(single.name).toBe("Alpha");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "2", name: "Beta", amount: 50 }),
      });
      const created = await service.create({ name: "Beta", amount: 50 });
      expect(created.id).toBe("2");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "2", name: "Beta Updated" }),
      });
      const updated = await service.update("2", { name: "Beta Updated" });
      expect(updated.name).toBe("Beta Updated");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });
      await expect(service.delete("2")).resolves.toBeUndefined();

      // Test default hooks, getAllPaged, and deleteById on a minimal BaseApiService subclass
      class MinimalApiService extends BaseApiService<TestEntityDto, string> {
        constructor() {
          super("/api/backend/minimal");
        }
      }
      const minService = new MinimalApiService();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: [],
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
        }),
      });
      await minService.getAllPaged();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "m1", name: "Min" }),
      });
      await minService.create({ name: "Min" });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "m1", name: "Min2" }),
      });
      await minService.update("m1", { name: "Min2" });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });
      await minService.deleteById("m1");
    });

    it("parses RFC 7807 ProblemDetail JSON and falls back cleanly on non-JSON errors", async () => {
      const service = new TestEntityApiService();
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      // 1. RFC 7807 JSON response with partial fields
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({
          title: "Conflict",
        }),
      });

      await expect(service.getAll()).rejects.toMatchObject({
        problem: {
          status: 409,
          title: "Conflict",
          errorCode: ErrorCode.INTERNAL_ERROR,
        },
      });

      // 2. JSON error response with empty title and empty statusText -> Request Error fallback
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "",
        json: async () => ({ title: "" }),
      });

      await expect(service.getAll()).rejects.toMatchObject({
        problem: {
          status: 502,
          title: "Request Error",
        },
      });

      // 3. Non-JSON 500 error response
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "",
        json: async () => {
          throw new Error("Unexpected token < in JSON");
        },
      });

      await expect(service.getAll()).rejects.toMatchObject({
        problem: {
          status: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          detail: "An unexpected network or server error occurred.",
        },
      });
    });
  });

  describe("useBaseCrud & ProblemAlert UI Integration", () => {
    it("handles CRUD lifecycle, DomainGuard errors, backend ProblemDetail, and generic exceptions", async () => {
      const service = new TestEntityApiService();
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      // Initial mount autoFetch returns 2 items
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: "1", name: "First" },
          { id: "2", name: "Second" },
        ],
      });

      render(<CrudHarness service={service} />);

      await waitFor(() => {
        expect(screen.getByText("First")).toBeDefined();
        expect(screen.getByText("Second")).toBeDefined();
      });

      // Trigger client-side DomainGuard failure
      fireEvent.click(screen.getByTestId("btn-create-invalid"));

      await waitFor(() => {
        const banner = screen.getByTestId("error-banner");
        expect(banner.getAttribute("data-error-code")).toBe("VALIDATION_FAILED");
        expect(screen.getByTestId("field-error-name").textContent).toContain(
          "Entity name must not be blank"
        );
      });

      // Dismiss error
      fireEvent.click(screen.getByTestId("dismiss-error"));
      expect(screen.queryByTestId("error-banner")).toBeNull();

      // Create valid item
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: "3", name: "Created Item", amount: 10 }),
      });
      fireEvent.click(screen.getByTestId("btn-create-valid"));
      await waitFor(() => {
        expect(screen.getByText("Created Item")).toBeDefined();
      });

      // Update item 1
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", name: "Updated Item" }),
      });
      fireEvent.click(screen.getByTestId("btn-update"));
      await waitFor(() => {
        expect(screen.getByText("Updated Item")).toBeDefined();
      });

      // Delete item 1
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });
      fireEvent.click(screen.getByTestId("btn-delete"));
      await waitFor(() => {
        expect(screen.queryByText("Updated Item")).toBeNull();
      });

      // Trigger backend ProblemDetail on update
      const problemResponse: ProblemDetail = {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "Entity 1 not found",
        errorCode: ErrorCode.ENTITY_NOT_FOUND,
        timestamp: new Date().toISOString(),
      };
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => problemResponse,
      });
      fireEvent.click(screen.getByTestId("btn-update"));
      await waitFor(() => {
        expect(
          screen.getByTestId("error-banner").getAttribute("data-error-code")
        ).toBe("ENTITY_NOT_FOUND");
      });

      // Trigger generic JS Error on delete & fetch
      vi.spyOn(service, "delete").mockRejectedValueOnce(
        new Error("Socket hang up")
      );
      fireEvent.click(screen.getByTestId("btn-delete"));
      await waitFor(() => {
        expect(screen.getByTestId("error-detail").textContent).toBe(
          "Socket hang up"
        );
      });

      vi.spyOn(service, "getAll").mockRejectedValueOnce("String error");
      fireEvent.click(screen.getByTestId("btn-fetch"));
      await waitFor(() => {
        expect(screen.getByTestId("error-detail").textContent).toBe(
          "Unexpected error"
        );
      });

      vi.spyOn(service, "getAll").mockRejectedValueOnce(problemResponse);
      fireEvent.click(screen.getByTestId("btn-fetch"));
      await waitFor(() => {
        expect(screen.getByTestId("error-detail").textContent).toBe(
          "Entity 1 not found"
        );
      });
    });

    it("supports autoFetch=false and renders PortalWorkspaceShell", () => {
      const service = new TestEntityApiService();
      const fetchMock = vi.fn();
      global.fetch = fetchMock;
      const onNavigate = vi.fn();
      const onLogout = vi.fn();
      const onDismissShellError = vi.fn();

      render(
        <PortalWorkspaceShell
          brandTitle="Clinic Portal"
          brandSubtitle="Sub"
          pageTitle="Behandleroversigt"
          userName="Dr. Bo Jensen"
          userEmail="bo@clinic.dk"
          avatarInitial="B"
          settingsHref="/da/dashboard/settings"
          settingsLabel="Indstillinger"
          logoutLabel="Log ud"
          accountSettingsHeader="Konto"
          profileSubtext="Aktiv profil"
          roleBadge="THERAPIST"
          roleLabel="Terapeut"
          portalOptions={[
            {
              area: "therapist",
              href: "/da/dashboard/therapist",
              label: "Behandlerportal",
              icon: "bi-heart-pulse",
              active: true,
            },
            {
              area: "client",
              href: "/da/dashboard/personal",
              label: "Klientportal",
              icon: "bi-person",
              active: false,
            },
          ]}
          navItems={[
            {
              href: "/da/dashboard/therapist",
              label: "Kalender",
              icon: "bi-calendar",
              active: true,
              badge: "Ny",
            },
            {
              href: "/da/dashboard/personal",
              label: "Klient",
              icon: "bi-person",
              active: false,
            },
          ]}
          upgradeAction={{
            label: "Bliv behandler",
            href: "/da/dashboard/clinic",
            description: "Opret klinik med CVR",
          }}
          defaultSidebarCollapsed={false}
          onNavigate={onNavigate}
          onLogout={onLogout}
          shellError={{
            type: "about:blank",
            title: "Netværksfejl",
            status: 503,
            detail: "Kunne ikke hente brugerprofil",
            errorCode: "SERVICE_UNAVAILABLE",
          }}
          onDismissShellError={onDismissShellError}
          headerNav={<span>CustomHeaderNav</span>}
          headerActions={<span>CustomHeaderActions</span>}
        >
          <CrudHarness service={service} autoFetch={false} />
        </PortalWorkspaceShell>
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("Clinic Portal")).toBeDefined();
      expect(screen.getByText("Terapeut")).toBeDefined();
      expect(screen.getByTestId("shell-page-title").textContent).toBe(
        "Behandleroversigt"
      );

      // Collapse and expand sidebar
      fireEvent.click(screen.getByTestId("sidebar-collapse-toggle"));
      expect(
        screen
          .getByTestId("portal-workspace-shell")
          .getAttribute("data-sidebar-collapsed")
      ).toBe("true");
      fireEvent.click(screen.getByTestId("sidebar-collapse-toggle"));
      expect(
        screen
          .getByTestId("portal-workspace-shell")
          .getAttribute("data-sidebar-collapsed")
      ).toBe("false");

      // Portal switcher & nav navigation
      fireEvent.click(screen.getByTestId("portal-switch-client"));
      expect(onNavigate).toHaveBeenCalledWith("/da/dashboard/personal");

      // Modifier click passes through without onNavigate
      onNavigate.mockClear();
      fireEvent.click(screen.getByTestId("sidebar-nav-1"), { ctrlKey: true });
      expect(onNavigate).not.toHaveBeenCalled();

      // Normal click invokes onNavigate
      fireEvent.click(screen.getByTestId("upgrade-therapist-cta"));
      expect(onNavigate).toHaveBeenCalledWith("/da/dashboard/clinic");

      // Mobile drawer toggle & close
      fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
      expect(screen.getByTestId("mobile-sidebar-drawer")).toBeDefined();
      fireEvent.click(screen.getByTestId("mobile-sidebar-nav-0"));
      expect(screen.queryByTestId("mobile-sidebar-drawer")).toBeNull();
      fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
      fireEvent.click(screen.getByTestId("mobile-portal-switch-client"));
      expect(screen.queryByTestId("mobile-sidebar-drawer")).toBeNull();
      fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
      fireEvent.click(screen.getByTestId("mobile-upgrade-therapist-cta"));
      expect(screen.queryByTestId("mobile-sidebar-drawer")).toBeNull();
      fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
      expect(screen.getByTestId("mobile-sidebar-drawer")).toBeDefined();
      fireEvent.click(screen.getByTestId("mobile-sidebar-drawer").firstElementChild as HTMLElement);
      expect(screen.queryByTestId("mobile-sidebar-drawer")).toBeNull();
      fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
      fireEvent.click(screen.getByTestId("mobile-menu-close"));
      expect(screen.queryByTestId("mobile-sidebar-drawer")).toBeNull();

      // User dropdown menu: settings & logout
      fireEvent.click(screen.getByTestId("user-menu-trigger"));
      expect(screen.getByTestId("user-menu-dropdown")).toBeDefined();
      fireEvent.click(screen.getByTestId("user-menu-settings"));
      expect(onNavigate).toHaveBeenCalledWith("/da/dashboard/settings");
      fireEvent.click(screen.getByTestId("user-menu-trigger"));
      fireEvent.click(screen.getByTestId("user-menu-logout"));
      expect(onLogout).toHaveBeenCalledTimes(1);

      // Dismiss shell error banner
      fireEvent.click(screen.getByTestId("dismiss-error"));
      expect(onDismissShellError).toHaveBeenCalledTimes(1);

      // Minimal shell without userName or onNavigate
      render(
        <PortalWorkspaceShell
          navItems={[{ href: "/noop", label: "NoOp", icon: "bi-dot", active: false }]}
        >
          <span>DefaultShellChild</span>
        </PortalWorkspaceShell>
      );
      expect(screen.getAllByTestId("portal-workspace-shell")).toHaveLength(2);
      const navBtns = screen.getAllByTestId("sidebar-nav-0");
      fireEvent.click(navBtns[navBtns.length - 1]);
    });
  });

  describe("RBAC (expandRoleAliases, matchesAnyRole, AuthProvider, RoleGuard) & AuthGateway", () => {
    it("expands role aliases (PROVIDER <-> THERAPIST, MANAGEMENT <-> ADMIN) and attaches Bearer token from sessionStorage", async () => {
      expect(expandRoleAliases("PROVIDER")).toEqual(["PROVIDER", "THERAPIST"]);
      expect(expandRoleAliases("THERAPIST")).toEqual(["PROVIDER", "THERAPIST"]);
      expect(expandRoleAliases("MANAGEMENT")).toEqual(["MANAGEMENT", "ADMIN"]);
      expect(expandRoleAliases("ADMIN")).toEqual(["MANAGEMENT", "ADMIN"]);
      expect(expandRoleAliases("CLIENT")).toEqual(["CLIENT"]);

      expect(matchesAnyRole(["THERAPIST"], ["PROVIDER"])).toBe(true);
      expect(matchesAnyRole(["ADMIN"], ["MANAGEMENT"])).toBe(true);
      expect(matchesAnyRole(["CLIENT"], ["PROVIDER", "MANAGEMENT"])).toBe(false);

      sessionStorage.setItem("access_token", "jwt-secret-123");
      const service = new TestEntityApiService();
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      });
      global.fetch = fetchMock;

      await service.getAll();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/test-entities",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer jwt-secret-123",
          }),
        })
      );
      sessionStorage.removeItem("access_token");
    });

    it("enforces AuthProvider, useAuth(), and RoleGuard allowed vs. forbidden views", () => {
      const OutsideAuthConsumer: React.FC = () => {
        useAuth();
        return <div>Never</div>;
      };
      expect(() => render(<OutsideAuthConsumer />)).toThrow(
        "useAuth skal bruges inden i en AuthProvider"
      );

      const InsideAuthConsumer: React.FC = () => {
        const { user, hasRole } = useAuth();
        return (
          <div data-testid="inside-auth-user">
            {user.name} ({String(hasRole("PROVIDER"))})
          </div>
        );
      };

      render(
        <>
          <RoleGuard allowed={["MANAGEMENT"]}>
            <div data-testid="standalone-guard-child">Standalone Visible</div>
          </RoleGuard>
          <AuthProvider user={null}>
            <RoleGuard
              allowed={["MANAGEMENT"]}
              fallback={<div data-testid="pending-fallback">Denied</div>}
            >
              <div data-testid="pending-secret">Pending Secret</div>
            </RoleGuard>
          </AuthProvider>
          <AuthProvider
            user={{
              id: "u-1",
              name: "Dr. Bo Jensen",
              email: "bo@clinic.dk",
              roles: ["THERAPIST"],
            }}
          >
            <InsideAuthConsumer />
            <RoleGuard allowed={["PROVIDER"]}>
              <div data-testid="allowed-provider-block">Provider Visible</div>
            </RoleGuard>
            <RoleGuard allowed={["MANAGEMENT"]}>
              <div data-testid="forbidden-mgmt-block">Mgmt Hidden</div>
            </RoleGuard>
            <RoleGuard
              allowed={["MANAGEMENT"]}
              fallback={<div data-testid="custom-fallback">Custom Denied</div>}
            >
              <div>Never Shown</div>
            </RoleGuard>
          </AuthProvider>
        </>
      );

      expect(screen.getByTestId("standalone-guard-child")).toBeDefined();
      expect(screen.queryByTestId("pending-secret")).toBeNull();
      expect(screen.queryByTestId("pending-fallback")).toBeNull();
      expect(screen.getByTestId("inside-auth-user").textContent).toBe(
        "Dr. Bo Jensen (true)"
      );
      expect(screen.getByTestId("allowed-provider-block")).toBeDefined();
      expect(screen.queryByTestId("forbidden-mgmt-block")).toBeNull();
      expect(screen.getByTestId("custom-fallback")).toBeDefined();
    });

    it("supports useOptionalAuth() safely both outside and inside AuthProvider", () => {
      const OptionalConsumer: React.FC<{ id: string }> = ({ id }) => {
        const optional = useOptionalAuth();
        return (
          <div data-testid={id}>
            {optional ? `${optional.user.name}:${String(optional.hasRole("CLIENT"))}` : "null"}
          </div>
        );
      };

      render(
        <>
          <OptionalConsumer id="optional-outside" />
          <AuthProvider
            user={{
              id: "u-2",
              name: "Anders Sand",
              email: "anders@sand.dk",
              roles: ["CLIENT"],
            }}
          >
            <OptionalConsumer id="optional-inside" />
          </AuthProvider>
        </>
      );

      expect(screen.getByTestId("optional-outside").textContent).toBe("null");
      expect(screen.getByTestId("optional-inside").textContent).toBe(
        "Anders Sand:true"
      );
    });

    it("builds login URLs and initiates redirect via AuthGateway", () => {
      const urlNoHint = AuthGateway.buildLoginUrl();
      expect(urlNoHint).toBe("http://localhost:5174/");
      expect(urlNoHint).not.toContain("roleHint");

      const urlWithHint = AuthGateway.buildLoginUrl("PROVIDER");
      expect(urlWithHint).toBe("http://localhost:5174/?roleHint=PROVIDER");

      const assignSpy = vi.fn();
      AuthGateway.initiateLogin("CLIENT", assignSpy);
      expect(assignSpy).toHaveBeenCalledWith(
        "http://localhost:5174/?roleHint=CLIENT"
      );

      const originalLocation = window.location;
      const windowAssignMock = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...originalLocation, assign: windowAssignMock },
      });
      AuthGateway.initiateLogin("MANAGEMENT");
      expect(windowAssignMock).toHaveBeenCalledWith(
        "http://localhost:5174/?roleHint=MANAGEMENT"
      );
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    });

    it("renders ConfirmActionDialog cleanly in closed, danger, and warning modes", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { rerender } = render(
        <ConfirmActionDialog
          open={false}
          title="Slet"
          description="Er du sikker?"
          confirmLabel="Ja, slet"
          cancelLabel="Annuller"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();

      rerender(
        <ConfirmActionDialog
          open={true}
          title="Bekræft sletning"
          description="Handlingen kan ikke fortrydes."
          confirmLabel="Slet permanent"
          cancelLabel="Behold"
          tone="danger"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
      fireEvent.click(screen.getByTestId("confirm-action-cancel"));
      expect(onCancel).toHaveBeenCalledTimes(1);

      rerender(
        <ConfirmActionDialog
          open={true}
          title="Bekræft refundering"
          description="Beløbet returneres til kunden."
          confirmLabel="Refunder"
          cancelLabel="Annuller"
          tone="warning"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
      fireEvent.click(screen.getByTestId("confirm-action-accept"));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
