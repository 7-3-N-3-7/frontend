import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingFeatureView } from "./LandingFeature";
import { AuthGateway } from "../../core/authGateway";

describe("LandingFeature Vertical Slice (Public Gateway SoC)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders public value proposition and initiates role-hinted login redirects via AuthGateway", () => {
    const initiateSpy = vi
      .spyOn(AuthGateway, "initiateLogin")
      .mockImplementation(() => "http://localhost:5174/");
    const navCb = vi.fn();

    render(<LandingFeatureView onNavigate={navCb} />);

    expect(screen.getByTestId("landing-feature-view")).toBeDefined();
    expect(
      screen.getByText(
        "Sikker journalføring, booking og klinikstyring samlet ét sted"
      )
    ).toBeDefined();

    fireEvent.click(screen.getByTestId("landing-login-btn"));
    expect(initiateSpy).toHaveBeenCalledWith(undefined, navCb);

    fireEvent.click(screen.getByTestId("landing-client-login-btn"));
    expect(initiateSpy).toHaveBeenCalledWith("CLIENT", navCb);

    fireEvent.click(screen.getByTestId("landing-provider-login-btn"));
    expect(initiateSpy).toHaveBeenCalledWith("PROVIDER", navCb);

    fireEvent.click(screen.getByTestId("landing-management-login-btn"));
    expect(initiateSpy).toHaveBeenCalledWith("MANAGEMENT", navCb);
  });
});
