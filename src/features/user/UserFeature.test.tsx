import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserFeatureView } from "./UserFeature";
import { AuthProvider } from "../../core/baseUiCore";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

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

    // Invalid role triggers DomainGuard
    fireEvent.change(screen.getByTestId("input-username"), {
      target: { value: "invalid_user" },
    });
    fireEvent.change(screen.getByTestId("select-role"), {
      target: { value: "INVALID_ROLE" },
    });
    fireEvent.click(screen.getByTestId("submit-user"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("BAD_REQUEST");
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "invalid role"
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
});
