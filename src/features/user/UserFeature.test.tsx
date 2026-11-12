import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserFeatureView } from "./UserFeature";
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
});
