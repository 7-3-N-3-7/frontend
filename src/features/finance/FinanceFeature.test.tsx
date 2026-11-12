import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FinanceFeatureView } from "./FinanceFeature";
import { ErrorCode, ProblemDetail } from "../../core/baseDomainCore";

describe("FinanceFeature Vertical Slice", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders invoices, issues a new invoice, and voids an invoice (Happy Path)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "inv-1",
          clientUuid: "client-1",
          description: "Klinisk session #1",
          amount: 950,
          currency: "DKK",
          status: "PAID",
        },
        {
          id: "inv-fallback",
          clientUuid: "client-1",
          amountGrossDkk: 500,
          currency: "DKK",
        },
      ],
    });

    render(<FinanceFeatureView />);

    await waitFor(() => {
      expect(screen.getByText("Klinisk session #1")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-2" },
    });
    fireEvent.change(screen.getByTestId("input-description"), {
      target: { value: "Traumeterapi #2" },
    });
    fireEvent.change(screen.getByTestId("input-amount"), {
      target: { value: "1200" },
    });
    fireEvent.change(screen.getByTestId("input-currency"), {
      target: { value: "EUR" },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: "inv-2",
        clientUuid: "client-2",
        description: "Traumeterapi #2",
        amount: 1200,
        currency: "DKK",
        status: "PAID",
      }),
    });

    fireEvent.click(screen.getByTestId("submit-invoice"));

    await waitFor(() => {
      expect(screen.getByText("Traumeterapi #2")).toBeDefined();
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });
    fireEvent.click(screen.getByTestId("delete-invoice-inv-2"));

    await waitFor(() => {
      expect(screen.queryByText("Traumeterapi #2")).toBeNull();
    });
  });

  it("enforces positive invoice amounts via DomainGuard and renders ProblemDetail", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<FinanceFeatureView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Amount = 0 triggers DomainGuard
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "client-1" },
    });
    fireEvent.change(screen.getByTestId("input-amount"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("submit-invoice"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("BAD_REQUEST");
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "Amount must be positive: amount"
      );
    });

    // Backend ProblemDetail
    const problem: ProblemDetail = {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Invoice already exists in ledger",
      errorCode: ErrorCode.CONFLICT,
      timestamp: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => problem,
    });

    fireEvent.change(screen.getByTestId("input-amount"), {
      target: { value: "800" },
    });
    fireEvent.click(screen.getByTestId("submit-invoice"));

    await waitFor(() => {
      expect(
        screen.getByTestId("error-banner").getAttribute("data-error-code")
      ).toBe("CONFLICT");
    });
  });
});
