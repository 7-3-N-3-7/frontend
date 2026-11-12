import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BookingFeatureView } from "./BookingFeature";
import { AuthProvider } from "../../core/baseUiCore";

describe("BookingFeature Vertical Slice (RoleGuard RBAC)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
  });

  it("renders BookingFeatureView for CLIENT and PROVIDER/THERAPIST roles", async () => {
    const { unmount } = render(
      <AuthProvider
        user={{
          id: "c-1",
          name: "Anders Sand",
          email: "anders@client.dk",
          roles: ["CLIENT"],
        }}
      >
        <BookingFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("booking-feature-view")).toBeDefined();
      expect(screen.getByText("Appointments & Bookings")).toBeDefined();
    });
    unmount();

    render(
      <AuthProvider
        user={{
          id: "p-1",
          name: "Dr. Bo Jensen",
          email: "bo@clinic.dk",
          roles: ["THERAPIST"],
        }}
      >
        <BookingFeatureView />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("booking-feature-view")).toBeDefined();
    });
  });

  it("blocks MANAGEMENT-only users with RoleGuard forbidden-notice", () => {
    render(
      <AuthProvider
        user={{
          id: "m-1",
          name: "Mette Direktør",
          email: "mette@clinic.dk",
          roles: ["MANAGEMENT"],
        }}
      >
        <BookingFeatureView />
      </AuthProvider>
    );

    expect(screen.queryByTestId("booking-feature-view")).toBeNull();
    expect(screen.getByTestId("forbidden-notice")).toBeDefined();
  });
});
