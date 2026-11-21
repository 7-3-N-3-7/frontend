import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  localizeUserRole,
  UserFeatureView,
  validateUserRole,
} from "./UserFeature";
import { AuthProvider } from "../../core/baseUiCore";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";
import { CachedI18nProvider } from "../i18n/I18nFeature";

describe("UserFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders users, creates a new user, and deletes a user (Happy Path)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "u-1",
          username: "anders_sand",
          role: "CLIENT",
        },
      ],
    });

    render(<UserFeatureView />);

    await waitFor(() => {
      expect(screen.getByText("anders_sand")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-username"), {
      target: { value: "bo_jensen" },
    });
    fireEvent.change(screen.getByTestId("input-password"), {
      target: { value: "Secret123!" },
    });
    fireEvent.change(screen.getByTestId("select-role"), {
      target: { value: "THERAPIST" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "u-2",
        username: "bo_jensen",
        role: "THERAPIST",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-user"));

    await waitFor(() => {
      expect(screen.getByText("bo_jensen")).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-user-u-2"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("delete-user-u-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

    await waitFor(() => {
      expect(screen.queryByText("bo_jensen")).toBeNull();
    });
  });

  it("enforces DomainGuard validation and renders backend ProblemDetail on conflict", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<UserFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // INVALID_ROLE option removed from UI; pure validator + role localization still enforced
    expect(screen.queryByRole("option", { name: "INVALID_ROLE" })).toBeNull();
    expect(() => validateUserRole("INVALID_ROLE")).toThrow(/invalid role/i);
    expect(localizeUserRole("PROVIDER", "da")).toBe("Behandler");
    expect(localizeUserRole("CUSTOM", "en")).toBe("CUSTOM");
    expect(localizeUserRole("", "xx" as any)).toBe("");

    // Blank username triggers DomainGuard
    fireEvent.change(screen.getByTestId("input-username"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("submit-user"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("BAD_REQUEST");
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "Username is required"
      );
    });

    // Backend 409 Conflict ProblemDetail
    const problem: ProblemDetail = {
      type: "https://api.platform.com/errors/conflict",
      title: "Conflict",
      status: 409,
      detail: "Username already exists",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-username"), {
      target: { value: "existing_user" },
    });
    fireEvent.change(screen.getByTestId("select-role"), {
      target: { value: "CLIENT" },
    });
    fireEvent.click(screen.getByTestId("submit-user"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("CONFLICT");
      expect(screen.getByTestId("error-detail").textContent).toBe(
        "Username already exists"
      );
    });
  });

  it("blocks non-ADMIN roles and pending AuthProvider while allowing ADMIN via RoleGuard", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ id: "u-admin", username: "admin_user", role: "ADMIN" }],
    });
    global.fetch = fetchMock;

    const { rerender } = render(
      <AuthProvider user={null}>
        <UserFeatureView />
      </AuthProvider>
    );

    expect(screen.queryByTestId("user-feature-view")).toBeNull();
    expect(screen.queryByTestId("forbidden-notice")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <AuthProvider
        user={{
          id: "c-1",
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <UserFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("user-feature-view")).toBeNull();
      expect(screen.getByTestId("forbidden-notice")).toBeDefined();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <AuthProvider
        user={{
          id: "a-1",
          name: "System Admin",
          email: "admin@platform.dk",
          roles: ["ADMIN"],
        }}
      >
        <UserFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user-feature-view")).toBeDefined();
      expect(screen.getByText("admin_user")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/users",
      expect.any(Object)
    );
  });

  it("renders empty state when no users exist and submits optional email into list items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: "u-mail-1",
          username: "mail_user",
          email: "mail@klinik.dk",
          role: "THERAPIST",
        }),
      });
    global.fetch = fetchMock;

    const firstRender = render(
      <AuthProvider user={{ id: "a-1", name: "Admin", email: "a@dk.dk", roles: ["ADMIN"] }}>
        <UserFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user-empty-state")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-username"), { target: { value: "mail_user" } });
    fireEvent.change(screen.getByTestId("input-email"), { target: { value: "mail@klinik.dk" } });
    fireEvent.change(screen.getByTestId("input-password"), { target: { value: "Secret123!" } });
    fireEvent.change(screen.getByTestId("select-role"), { target: { value: "THERAPIST" } });
    fireEvent.click(screen.getByTestId("submit-user"));

    await waitFor(() => {
      expect(screen.getByText("(mail@klinik.dk)")).toBeDefined();
    });
    firstRender.unmount();

    // Cover English empty state branch
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    const enRender = render(
      <CachedI18nProvider initialLocale="en" initialMessages={{}}>
        <AuthProvider user={{ id: "a-2", name: "Admin En", email: "en@dk.dk", roles: ["ADMIN"] }}>
          <UserFeatureView />
        </AuthProvider>
      </CachedI18nProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("No registered users yet.")).toBeDefined();
    });
    enRender.unmount();

    // Cover search input, role filter (including PROVIDER/MANAGEMENT aliases), and empty filter state
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { id: "u-f1", username: "mette_lind", email: "mette@lind.dk", role: "PROVIDER" },
        { id: "u-f1b", username: "therapist_2", role: "THERAPIST" },
        { id: "u-f2", username: "bijens", email: "bo@klinik.dk", role: "MANAGEMENT" },
        { id: "u-f2b", username: "admin_2", role: "ADMIN" },
        { id: "u-f3", username: "client", email: "klient@dk.dk", role: "CLIENT" },
        { id: "u-f4", username: undefined as unknown as string, role: "" },
      ],
    });
    render(
      <AuthProvider user={{ id: "a-flt", name: "Admin", email: "a@dk.dk", roles: ["ADMIN"] }}>
        <UserFeatureView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user-list")).toBeDefined());

    fireEvent.change(screen.getByTestId("user-role-filter"), { target: { value: "THERAPIST" } });
    expect(screen.getByText("mette_lind")).toBeDefined();
    expect(screen.getByText("therapist_2")).toBeDefined();
    expect(screen.queryByText("bijens")).toBeNull();

    fireEvent.change(screen.getByTestId("user-role-filter"), { target: { value: "ADMIN" } });
    expect(screen.getByText("bijens")).toBeDefined();
    expect(screen.getByText("admin_2")).toBeDefined();

    fireEvent.change(screen.getByTestId("user-role-filter"), { target: { value: "CLIENT" } });
    expect(screen.getByText("client")).toBeDefined();

    fireEvent.change(screen.getByTestId("user-role-filter"), { target: { value: "ALL" } });
    fireEvent.change(screen.getByTestId("user-search-input"), { target: { value: "klient@dk.dk" } });
    expect(screen.getByText("client")).toBeDefined();
    expect(screen.queryByText("mette_lind")).toBeNull();

    fireEvent.change(screen.getByTestId("user-search-input"), { target: { value: "nonexistent-user-xyz" } });
    expect(screen.getByTestId("user-filter-empty-state")).toBeDefined();
  });
});
