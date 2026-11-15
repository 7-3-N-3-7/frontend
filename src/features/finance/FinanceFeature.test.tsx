import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FinanceFeatureView } from "./FinanceFeature";
import { AuthProvider } from "../../core/baseUiCore";
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

  it("renders role-aware ClientFinanceOverview for CLIENT users with clip cards, subscriptions, and loan repayment", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/prepaid/topup") || url.includes("/prepaid/consume") || url.includes("/subscriptions")) {
        return { ok: true, status: 201, json: async () => ({ status: "OK" }) };
      }
      if (url.includes("/installment-plans/LOAN-1/repay")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail: "Afdrag kan ikke behandles",
            errorCode: ErrorCode.BAD_REQUEST,
            timestamp: new Date().toISOString(),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          clientUuid: "c-1",
          invoices: [
            {
              id: "KB-1",
              clientUuid: "c-1",
              description: "Traumesession",
              amount: 1200,
              currency: "DKK",
              status: "PAID",
            },
          ],
          prepaidSavings: {
            savingsAccountId: "SAV-1",
            balance: 5000,
            remainingClips: 5,
            currency: "DKK",
          },
          subscriptions: [
            {
              subscriptionId: "SUB-1",
              planName: "monthly-therapy-care",
              monthlyAmount: 499,
              currency: "DKK",
              status: "ACTIVE",
            },
          ],
          installmentPlans: [
            {
              loanId: "LOAN-1",
              description: "Forløb",
              principalAmount: 3000,
              remainingPrincipal: 2000,
              installmentsCount: 3,
              paidInstallments: 1,
              currency: "DKK",
              status: "ACTIVE",
            },
          ],
          gitHistory: [
            {
              commitHash: "abc123def456",
              shortHash: "abc123d",
              message: "Faktura betalt",
              authorName: "Anders Sand",
            },
          ],
        }),
      };
    });
    global.fetch = fetchMock;

    render(
      <AuthProvider
        user={{
          id: "c-1",
          name: "Anders Sand",
          email: "anders@sand.dk",
          roles: ["CLIENT"],
        }}
      >
        <FinanceFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("client-clips-balance").textContent).toContain("5 klip");
      expect(screen.getByTestId("client-invoice-item-KB-1")).toBeDefined();
      expect(screen.getByTestId("client-finance-git-history")).toBeDefined();
    });

    expect(screen.queryByTestId("finance-form")).toBeNull();

    fireEvent.click(screen.getByTestId("btn-buy-clipcard"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/finance/prepaid/topup",
        expect.objectContaining({ method: "POST" })
      );
      expect(
        (screen.getByTestId("btn-buy-clipcard") as HTMLButtonElement).disabled
      ).toBe(false);
    });

    fireEvent.click(screen.getByTestId("btn-consume-clip"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/finance/prepaid/consume",
        expect.objectContaining({ method: "POST" })
      );
      expect(
        (screen.getByTestId("btn-consume-clip") as HTMLButtonElement).disabled
      ).toBe(false);
    });

    fireEvent.click(screen.getByTestId("btn-create-subscription"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/finance/subscriptions",
        expect.objectContaining({ method: "POST" })
      );
      expect(
        (screen.getByTestId("btn-create-subscription") as HTMLButtonElement).disabled
      ).toBe(false);
    });

    fireEvent.click(screen.getByTestId("btn-repay-loan-LOAN-1"));

    await waitFor(() => {
      expect(screen.getByTestId("error-banner").getAttribute("data-error-code")).toBe(
        "BAD_REQUEST"
      );
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));
  });

  it("renders Fineract General Ledger, refunds, and installment loan creation for THERAPIST users", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/ledger/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chartOfAccounts: [
              { code: "1100", name: "Bank", type: "ASSET", balance: 1200 },
            ],
            gitHistory: [],
          }),
        };
      }
      if (url.includes("/refund") || url.includes("/installment-plans")) {
        return { ok: true, status: 201, json: async () => ({ status: "REFUNDED" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "inv-t1",
            clientUuid: "c-1",
            description: "Session #1",
            amount: 1200,
            currency: "DKK",
            status: "PAID",
          },
        ],
      };
    });
    global.fetch = fetchMock;

    render(
      <AuthProvider
        user={{
          id: "t-1",
          name: "Dr. Maja",
          email: "maja@klinik.dk",
          roles: ["THERAPIST"],
        }}
      >
        <FinanceFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("ledger-accounts-grid")).toBeDefined();
      expect(screen.getByTestId("refund-invoice-inv-t1")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("refund-invoice-inv-t1"));
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "c-1" },
    });
    fireEvent.click(screen.getByTestId("btn-create-loan"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/backend/finance/installment-plans",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});


describe("FinanceFeature Vipps MobilePay OSGi Hub & Checkout", () => {
  it("supports Client view Vipps MobilePay access purchase, role upgrade callback, and agreement charge/cancel", async () => {
    const { render, screen, fireEvent, waitFor, cleanup } = await import(
      "@testing-library/react"
    );
    const { AuthProvider } = await import("../../core/baseUiCore");
    cleanup();

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const onRoleUpgraded = vi.fn();
    let agrStatus = "ACTIVE";
    let agreementsList: any[] = [
      {
        agreementId: "agr-existing",
        productType: "SUBSCRIPTION",
        planName: "Klinik Abonnement",
        amountDkk: 499,
        currency: "DKK",
        paymentMethod: "MOBILEPAY",
        maskedInstrument: "MobilePay +4520123456",
        payoutIban: "DK5000400440116243",
        vippsMsn: "700000",
        status: "ACTIVE",
      },
    ];

    fetchMock.mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/vipps/checkout") && method === "POST") {
        agreementsList = [
          {
            agreementId: "agr-therapist-1",
            productType: "THERAPIST_ACCESS",
            planName: "Therapist-adgang",
            amountDkk: 799,
            currency: "DKK",
            paymentMethod: "MOBILEPAY",
            maskedInstrument: "MobilePay +4520998877",
            payoutIban: "DK8130000012345678",
            vippsMsn: "700101",
            grantedRole: "THERAPIST",
            status: agrStatus,
          },
        ];
        return {
          ok: true,
          status: 201,
          json: async () => ({
            status: "ACTIVE",
            productType: "THERAPIST_ACCESS",
            planName: "Therapist-adgang",
            amountDkk: 799,
            currency: "DKK",
            maskedInstrument: "MobilePay +4520998877",
            payoutIban: "DK8130000012345678",
            vippsMsn: "700101",
            grantedRole: "THERAPIST",
            agreementId: "agr-therapist-1",
            vippsReferenceId: "vref-therapist-1",
            gitCommitHash: "deadbeef",
          }),
        };
      }
      if (url.includes("/vipps/agreements/agr-therapist-1/charge")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ agreementId: "agr-therapist-1", status: "ACTIVE", chargeCount: 2 }),
        };
      }
      if (url.includes("/vipps/agreements/agr-therapist-1/cancel")) {
        agrStatus = "STOPPED";
        agreementsList = [{ ...agreementsList[0], status: "STOPPED" }];
        return {
          ok: true,
          status: 200,
          json: async () => ({ agreementId: "agr-therapist-1", status: "STOPPED" }),
        };
      }
      if (url.includes("/overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            clientUuid: "client-vipps-1",
            invoices: [],
            prepaidSavings: {
              savingsAccountId: "sav-vipps-1",
              balance: 0,
              remainingClips: 0,
              currency: "DKK",
            },
            subscriptions: [],
            installmentPlans: [],
            vippsAgreements: agreementsList,
            gitHistory: [],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <AuthProvider
        user={{
          id: "client-vipps-1",
          name: "Anders Sand",
          email: "anders@example.dk",
          roles: ["CLIENT"],
        }}
      >
        <FinanceFeatureView onRoleUpgraded={onRoleUpgraded} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("vipps-payment-hub")).toBeDefined();
      expect(screen.getByTestId("btn-checkout-therapist-access")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("btn-checkout-therapist-access"));
    await waitFor(() => {
      expect(screen.getByTestId("vipps-checkout-modal")).toBeDefined();
      expect(screen.getByTestId("checkout-payout-routing").textContent).toContain("DK8130000012345678");
      expect(screen.getByTestId("checkout-payout-routing").textContent).toContain("700101");
    });

    fireEvent.change(screen.getByTestId("input-vipps-phone"), {
      target: { value: "+4520998877" },
    });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));

    await waitFor(() => {
      expect(screen.getByTestId("vipps-checkout-receipt").textContent).toContain("THERAPIST");
      expect(screen.getByTestId("vipps-checkout-receipt").textContent).toContain("deadbeef");
      expect(onRoleUpgraded).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("btn-charge-agreement-agr-therapist-1"));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/agreements/agr-therapist-1/charge"))
      ).toBe(true);
    });

    fireEvent.click(screen.getByTestId("btn-cancel-agreement-agr-therapist-1"));
    await waitFor(() => {
      expect(screen.getByTestId("vipps-agreement-item-agr-therapist-1").textContent).toContain(
        "STOPPED"
      );
      expect(screen.queryByTestId("btn-charge-agreement-agr-therapist-1")).toBeNull();
    });
    cleanup();
  });

  it("supports Provider view English locale, tokenized credit card checkout without leaking PAN, modal close, and error branches", async () => {
    const { render, screen, fireEvent, waitFor, cleanup } = await import(
      "@testing-library/react"
    );
    const { AuthProvider } = await import("../../core/baseUiCore");
    const { CachedI18nProvider } = await import("../i18n/I18nFeature");
    cleanup();

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    let checkoutBodyRaw = "";
    let failAgreementCharge = false;

    fetchMock.mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/ledger/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chartOfAccounts: [
              { code: "1100", name: "Bank", type: "ASSET", balance: 5000 },
              { glCode: "4300", type: "INCOME", balance: 799 },
            ],
            vippsAgreements: [
              {
                agreementId: "agr-prov-1",
                productType: "SUBSCRIPTION",
                planName: "Clinic Subscription",
                amountDkk: 499,
                currency: "DKK",
                paymentMethod: "CREDIT_CARD",
                maskedInstrument: "MASTERCARD •••• 3456",
                payoutIban: "DK5000400440116243",
                vippsMsn: "700000",
                status: "ACTIVE",
              },
            ],
          }),
        };
      }
      if (url.includes("/vipps/checkout") && method === "POST") {
        checkoutBodyRaw = String(init?.body || "");
        return {
          ok: true,
          status: 201,
          json: async () => ({
            status: "CAPTURED",
            productType: "CLIP_CARD",
            planName: "5-Session Clip Card",
            amountDkk: 5000,
            currency: "DKK",
            maskedInstrument: "MASTERCARD •••• 3456",
            payoutIban: "DK5000400440116243",
            vippsMsn: "700000",
            grantedRole: null,
            agreementId: null,
            vippsReferenceId: "vref-clip-1",
            gitCommitHash: "cafebabe",
          }),
        };
      }
      if (url.includes("/agreements/agr-prov-1/charge")) {
        if (failAgreementCharge) {
          return {
            ok: false,
            status: 502,
            json: async () => ({
              status: 502,
              errorCode: "INTERNAL_ERROR",
              title: "Vipps Gateway Error",
              detail: "Vipps Recurring charge rejected",
            }),
          };
        }
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    render(
      <CachedI18nProvider initialLocale="en" initialMessages={{}}>
        <AuthProvider
          user={{
            id: "prov-1",
            name: "Bo Jensen",
            email: "bo@klinik.dk",
            roles: ["PROVIDER"],
          }}
        >
          <FinanceFeatureView />
        </AuthProvider>
      </CachedI18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("vipps-payment-hub")).toBeDefined();
      expect(screen.getByTestId("ledger-accounts-grid").textContent).toContain("Account 4300");
    });

    fireEvent.click(screen.getByTestId("btn-checkout-clipcard"));
    await waitFor(() => expect(screen.getByTestId("vipps-checkout-modal")).toBeDefined());
    fireEvent.click(screen.getByTestId("btn-close-vipps-checkout"));
    await waitFor(() => expect(screen.queryByTestId("vipps-checkout-modal")).toBeNull());

    fireEvent.click(screen.getByTestId("btn-checkout-clipcard"));
    fireEvent.click(screen.getByTestId("select-method-card"));
    fireEvent.click(screen.getByTestId("select-method-mobilepay"));
    fireEvent.click(screen.getByTestId("select-method-card"));

    fireEvent.change(screen.getByTestId("input-card-holder"), { target: { value: "   " } });
    fireEvent.change(screen.getByTestId("input-card-number"), { target: { value: "123" } });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));
    await waitFor(() => {
      expect(screen.getByText(/Valid 12-19 digit card number is required/)).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("input-card-number"), {
      target: { value: "5412 7512 3412 3456" },
    });
    fireEvent.change(screen.getByTestId("input-card-expiry"), { target: { value: "11/29" } });
    fireEvent.change(screen.getByTestId("input-card-cvc"), { target: { value: "999" } });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));

    await waitFor(() => {
      expect(screen.getByTestId("vipps-checkout-receipt").textContent).toContain("cafebabe");
    });
    expect(checkoutBodyRaw).not.toContain("5412751234123456");
    expect(checkoutBodyRaw).not.toContain("5412 7512 3412 3456");
    const parsedBody = JSON.parse(checkoutBodyRaw);
    expect(parsedBody.cardToken).toBe("tok_mastercard_card_3456");
    expect(parsedBody.cardLast4).toBe("3456");
    expect(parsedBody.cardBrand).toBe("MASTERCARD");

    failAgreementCharge = true;
    fireEvent.click(screen.getByTestId("btn-charge-agreement-agr-prov-1"));
    await waitFor(() => {
      expect(screen.getByTestId("error-detail").textContent).toContain(
        "Vipps Recurring charge rejected"
      );
    });
    cleanup();
  });
});
