import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  FinanceFeatureView,
  filterFinanceClientOptions,
  localizeFinanceStatus,
  localizeGlAccountName,
} from "./FinanceFeature";
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
      target: { value: "2" },
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
        amount: 2,
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
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    expect(screen.getByText("Traumeterapi #2")).toBeDefined();

    fireEvent.click(screen.getByTestId("delete-invoice-inv-2"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

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
              amount: 2,
              currency: "DKK",
              status: "PAID",
            },
          ],
          prepaidSavings: {
            savingsAccountId: "SAV-1",
            balance: 3,
            remainingClips: 5,
            currency: "DKK",
          },
          subscriptions: [
            {
              subscriptionId: "SUB-1",
              planName: "monthly-therapy-care",
              monthlyAmount: 3,
              currency: "DKK",
              status: "ACTIVE",
            },
          ],
          installmentPlans: [
            {
              loanId: "LOAN-1",
              description: "Forløb",
              principalAmount: 6,
              remainingPrincipal: 4,
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
      expect(screen.getByTestId("client-invoice-item-KB-1").textContent).toContain("Betalt");
    });

    expect(screen.queryByTestId("client-finance-git-history")).toBeNull();
    expect(screen.queryByTestId("technical-audit-details")).toBeNull();
    expect(screen.getByTestId("finance-feature-view").textContent).not.toMatch(/OSGi|Docker Secrets|JGit/i);
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

  it("renders Fineract General Ledger, confirmed refunds, pagination, and installment loan creation for THERAPIST users", async () => {
    expect(localizeFinanceStatus("CUSTOM_STATE", "da")).toBe("CUSTOM_STATE");
    expect(localizeGlAccountName("9999", "Specialkonto", "en")).toBe("Specialkonto");
    expect(localizeGlAccountName("9999", undefined, "en")).toBe("");

    const elevenInvoices = Array.from({ length: 11 }, (_, idx) => ({
      id: idx === 0 ? "inv-t1" : `inv-t-${idx + 1}`,
      clientUuid: "c-1",
      description: `Session #${idx + 1}`,
      amount: 2,
      currency: "DKK",
      status: "PAID",
    }));

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/backend/clinic/clients")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "cp-self", userId: "t-1", fullName: "Dr. Maja", email: "maja@klinik.dk" },
            { id: "cp-dr", userId: "t-dr", fullName: "Dr. Bo", email: "bo@klinik.dk" },
            { id: "cp-ter", userId: "t-sofie", fullName: "sofie_terapeut", email: "sofie@klinik.dk" },
            { id: "cp-1", userId: "c-1", fullName: "Anders Sand", email: "anders@sand.dk" },
            { id: "cp-dup", userId: "c-dup", fullName: "anders sand ", email: "dup@sand.dk" },
            { id: "cp-2", fullName: "Maja Holm" },
          ],
        };
      }
      if (url.includes("/ledger/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chartOfAccounts: [
              { code: "1100", name: "Bank", type: "ASSET", balance: 2 },
            ],
            gitHistory: [
              {
                commitHash: "sha-prov-1",
                shortHash: "sha-pro",
                message: "Faktura bogført",
                authorName: "Bo Jensen",
              },
            ],
          }),
        };
      }
      if (url.includes("/refund") || url.includes("/installment-plans")) {
        return { ok: true, status: 201, json: async () => ({ status: "REFUNDED" }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => elevenInvoices,
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
        <FinanceFeatureView portalMode="provider" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("ledger-accounts-grid")).toBeDefined();
      expect(screen.getByTestId("refund-invoice-inv-t1")).toBeDefined();
      expect(screen.getByTestId("technical-audit-details")).toBeDefined();
      expect(screen.getByTestId("provider-finance-git-history").textContent).toContain("sha-pro");
      expect(screen.getByTestId("ledger-accounts-grid").textContent).toContain("Bank & likviditet");
      expect(screen.getByTestId("select-finance-client")).toBeDefined();
      expect(screen.getByTestId("vipps-sandbox-badge")).toBeDefined();
      expect(screen.getByTestId("provider-invoice-pagination")).toBeDefined();
    });
    const financePickerHtml = screen.getByTestId("select-finance-client").innerHTML;
    expect(financePickerHtml).toContain("Anders Sand (anders@sand.dk)");
    expect(financePickerHtml).toContain("Maja Holm");
    expect(financePickerHtml).not.toContain("Dr. Maja");
    expect(financePickerHtml).not.toContain("Dr. Bo");
    expect(financePickerHtml).not.toContain("sofie_terapeut");
    expect(financePickerHtml).not.toContain("dup@sand.dk");

    // Pagination Next / Prev
    fireEvent.click(screen.getByTestId("provider-invoice-next-page"));
    expect(screen.getByText("Session #11")).toBeDefined();
    fireEvent.click(screen.getByTestId("provider-invoice-prev-page"));
    expect(screen.getByText("Session #1")).toBeDefined();

    // Confirmed refund
    fireEvent.click(screen.getByTestId("refund-invoice-inv-t1"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("refund-invoice-inv-t1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));

    // Select human client or toggle manual ID
    fireEvent.change(screen.getByTestId("select-finance-client"), {
      target: { value: "c-1" },
    });
    fireEvent.change(screen.getByTestId("select-finance-client"), {
      target: { value: "__manual__" },
    });
    fireEvent.change(screen.getByTestId("input-clientUuid"), {
      target: { value: "c-1" },
    });
    fireEvent.click(screen.getByTestId("btn-finance-back-to-clients"));
    fireEvent.change(screen.getByTestId("select-finance-client"), {
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
        amountDkk: 3,
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
            amountDkk: 4,
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
            amountDkk: 4,
            currency: "DKK",
            maskedInstrument: "MobilePay +4520998877",
            payoutIban: "DK8130000012345678",
            vippsMsn: "700101",
            grantedRole: "THERAPIST",
            agreementId: "agr-therapist-1",
            vippsReferenceId: "vref-therapist-1",
            redirectUrl: "https://landing.vipps.no/therapist-1",
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
      expect(screen.getByTestId("professional-licenses-section")).toBeDefined();
      expect(screen.getByTestId("btn-checkout-session")).toBeDefined();
      expect(screen.getByTestId("btn-checkout-therapist-access")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("professional-licenses-toggle"));
    fireEvent.click(screen.getByTestId("btn-checkout-therapist-access"));
    await waitFor(() => {
      expect(screen.getByTestId("vipps-checkout-modal")).toBeDefined();
      expect(screen.queryByTestId("checkout-payout-routing")).toBeNull();
    });

    fireEvent.change(screen.getByTestId("input-vipps-phone"), {
      target: { value: "+4520998877" },
    });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));

    await waitFor(() => {
      const receiptText = screen.getByTestId("vipps-checkout-receipt").textContent || "";
      expect(receiptText).toContain("THERAPIST");
      expect(receiptText).not.toContain("deadbeef");
      expect(receiptText).not.toContain("DK8130000012345678");
      expect(screen.getByTestId("vipps-redirect-link").getAttribute("href")).toBe(
        "https://landing.vipps.no/therapist-1"
      );
      expect(onRoleUpgraded).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("btn-charge-agreement-agr-therapist-1"));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/agreements/agr-therapist-1/charge"))
      ).toBe(true);
    });

    fireEvent.click(screen.getByTestId("btn-cancel-agreement-agr-therapist-1"));
    expect(screen.getByTestId("confirm-action-dialog")).toBeDefined();
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("btn-cancel-agreement-agr-therapist-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("vipps-agreement-item-agr-therapist-1").textContent).toContain(
        "Opsagt"
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
              { code: "1100", name: "Bank", type: "ASSET", balance: 3 },
              { glCode: "4300", type: "INCOME", balance: 4 },
            ],
            vippsAgreements: [
              {
                agreementId: "agr-prov-1",
                productType: "SUBSCRIPTION",
                planName: "Clinic Subscription",
                amountDkk: 3,
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
            amountDkk: 3,
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
      expect(screen.getByTestId("technical-audit-details")).toBeDefined();
      expect(screen.getByTestId("technical-audit-details").textContent).toContain(
        "com.platform.killbill.vipps-mobilepay-plugin"
      );
      expect(screen.getByTestId("ledger-accounts-grid").textContent).toContain("Account 4300");
      expect(screen.getByTestId("ledger-accounts-grid").textContent).toContain(
        "Platform & License Revenue"
      );
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

  it("renders ClientFinanceOverview safely with portalMode='client' when unauthenticated and covers client pagination", async () => {
    const { render, screen, fireEvent, waitFor, cleanup } = await import(
      "@testing-library/react"
    );
    const { AuthProvider } = await import("../../core/baseUiCore");
    cleanup();

    render(<FinanceFeatureView portalMode="client" />);
    await waitFor(() => {
      expect(screen.getByTestId("finance-feature-view").getAttribute("data-finance-mode")).toBe(
        "client"
      );
    });
    cleanup();

    const elevenClientInvoices = Array.from({ length: 11 }, (_, idx) => ({
      id: `cinv-${idx + 1}`,
      clientUuid: "c-page",
      description: `Klientregning #${idx + 1}`,
      amount: 500,
      currency: "DKK",
      status: "PAID",
    }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        clientUuid: "c-page",
        invoices: elevenClientInvoices,
        prepaidSavings: { savingsAccountId: "s-1", balance: 0, remainingClips: 0, currency: "DKK" },
        subscriptions: [],
        installmentPlans: [],
        gitHistory: [],
      }),
    }) as unknown as typeof fetch;

    render(
      <AuthProvider
        user={{ id: "c-page", name: "Page Client", email: "p@c.dk", roles: ["CLIENT"] }}
      >
        <FinanceFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("client-invoice-pagination")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("client-invoice-next-page"));
    expect(screen.getByText("Klientregning #11")).toBeDefined();
    fireEvent.click(screen.getByTestId("client-invoice-prev-page"));
    expect(screen.getByText("Klientregning #1")).toBeDefined();
    cleanup();
  });

  it("covers client/provider fallback branches, VISA tokenization, invoice delete confirm/cancel, and loan/refund errors", async () => {
    expect(localizeFinanceStatus(undefined, "da")).toBe("Betalt");

    let failCheckout = false;
    let checkoutBodyRaw = "";
    const clientFetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/vipps/checkout")) {
        if (failCheckout) {
          return Promise.reject({
            title: "Rejected",
            status: 400,
            detail: "Rejected",
            errorCode: ErrorCode.BAD_REQUEST,
          });
        }
        checkoutBodyRaw = String(init?.body || "{}");
        return {
          ok: true,
          status: 201,
          json: async () => ({
            status: "ACTIVE",
            productType: "CLIP_CARD_5",
            planName: "Klippekort 5",
            amountDkk: 3900,
            currency: "DKK",
            maskedInstrument: "VISA •••• 1111",
            payoutIban: "DK5000400440116243",
            vippsMsn: "700000",
            agreementId: "agr-visa-1",
            vippsReferenceId: "vref-visa-1",
          }),
        };
      }
      if (url.includes("/overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            clientUuid: "c-branch-1",
            invoices: [
              {
                invoiceNumber: "KB-NO-ID-1",
                description: "Regning kun med fakturanr",
                amount: 350,
                currency: "DKK",
                status: "PAID",
              },
            ],
            prepaidSavings: { savingsAccountId: "s-1", balance: 0, remainingClips: 0, currency: "DKK" },
            subscriptions: [],
            installmentPlans: [],
            vippsAgreements: [],
            gitHistory: [],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    global.fetch = clientFetch;

    render(
      <AuthProvider
        user={{ id: "c-branch-1", name: "Klient VISA", email: "visa@test.dk", roles: ["CLIENT"] }}
      >
        <FinanceFeatureView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("client-invoice-item-KB-NO-ID-1")).toBeDefined();
    });

    // Single session checkout sends amount 2 DKK
    fireEvent.click(screen.getByTestId("btn-checkout-session"));
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));
    await waitFor(() => {
      expect(JSON.parse(checkoutBodyRaw).productType).toBe("SESSION_INVOICE");
      expect(JSON.parse(checkoutBodyRaw).amount).toBe(2);
    });

    // VISA checkout with named cardholder
    fireEvent.click(screen.getByTestId("btn-checkout-clipcard"));
    fireEvent.click(screen.getByTestId("select-method-card"));
    fireEvent.change(screen.getByTestId("input-card-holder"), { target: { value: "Anne Holm" } });
    fireEvent.change(screen.getByTestId("input-card-number"), {
      target: { value: "4111 1111 1111 1111" },
    });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));
    await waitFor(() => {
      expect(screen.getByTestId("vipps-checkout-receipt")).toBeDefined();
    });
    expect(JSON.parse(checkoutBodyRaw).cardBrand).toBe("VISA");

    // Non-Problem Error thrown during Vipps checkout
    failCheckout = true;
    fireEvent.click(screen.getByTestId("btn-checkout-subscription"));
    await waitFor(() => {
      expect((screen.getByTestId("btn-confirm-vipps-checkout") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("btn-confirm-vipps-checkout"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    cleanup();

    // Provider branches: /clinic/clients ok:false, shortHash fallback, delete confirm/cancel, refund/loan errors
    let clientsPayloadMode: "notOk" | "notArray" = "notOk";
    const providerFetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || "GET").toUpperCase();
      if (url.includes("/api/backend/clinic/clients")) {
        if (clientsPayloadMode === "notOk") {
          return { ok: false, status: 500, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => ({ invalid: true }) };
      }
      if (url.includes("/ledger/summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chartOfAccounts: [],
            gitHistory: [
              { commitHash: "fullsha9988", message: "Bogført uden shortHash", authorName: "Bo" },
            ],
          }),
        };
      }
      if (url.includes("/invoices/inv-del-1/refund") && method === "POST") {
        return Promise.reject({
          title: "Rejected",
          status: 400,
          detail: "Rejected",
          errorCode: ErrorCode.BAD_REQUEST,
        });
      }
      if (url.endsWith("/api/backend/finance/inv-del-1") && method === "DELETE") {
        return { ok: true, status: 204 };
      }
      if (url.includes("/installment-plans") && method === "POST") {
        return Promise.reject({
          title: "Rejected",
          status: 400,
          detail: "Rejected",
          errorCode: ErrorCode.BAD_REQUEST,
        });
      }
      if (url.endsWith("/api/backend/finance") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "inv-del-1",
              clientUuid: "c-1",
              description: "Sletbar faktura",
              amount: 900,
              currency: "DKK",
              status: "PAID",
            },
          ],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    global.fetch = providerFetch;

    render(
      <AuthProvider
        user={{ id: "t-branch-1", name: "Dr. Bo", email: "bo@klinik.dk", roles: ["PROVIDER"] }}
      >
        <FinanceFeatureView portalMode="provider" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("invoice-item-inv-del-1")).toBeDefined();
      expect(screen.getByText("fullsha9988")).toBeDefined();
    });

    // Empty clientUuid loan hits DomainGuard branch, non-empty hits raw Error catch branch
    fireEvent.click(screen.getByTestId("btn-create-loan"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    fireEvent.change(screen.getByTestId("input-clientUuid"), { target: { value: "c-manual-1" } });
    fireEvent.click(screen.getByTestId("btn-create-loan"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    // Refund rejection error branch
    fireEvent.click(screen.getByTestId("refund-invoice-inv-del-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("dismiss-error"));

    // Delete invoice cancel + accept
    fireEvent.click(screen.getByTestId("delete-invoice-inv-del-1"));
    fireEvent.click(screen.getByTestId("confirm-action-cancel"));
    expect(screen.queryByTestId("confirm-action-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("delete-invoice-inv-del-1"));
    fireEvent.click(screen.getByTestId("confirm-action-accept"));
    await waitFor(() => {
      expect(providerFetch).toHaveBeenCalledWith(
        "/api/backend/finance/inv-del-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    cleanup();

    // Non-array /clinic/clients payload branch
    clientsPayloadMode = "notArray";
    render(
      <AuthProvider
        user={{ id: "t-branch-2", name: "Dr. Bo 2", email: "bo2@klinik.dk", roles: ["PROVIDER"] }}
      >
        <FinanceFeatureView portalMode="provider" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("invoice-item-inv-del-1")).toBeDefined();
    });
    cleanup();
  });

  it("filters clinic finance clients safely, shows sandbox badge, and avoids hardcoded card defaults", async () => {
    expect(filterFinanceClientOptions(null)).toEqual([]);
    const filtered = filterFinanceClientOptions(
      [
        null,
        "invalid",
        { id: 123, fullName: "Bad Id" },
        { id: "no-name" },
        { id: "blank-name", fullName: "   " },
        { id: "   ", fullName: "Blank Id" },
        { id: "self-id", userId: "p-1", fullName: "Self ID", email: "other@klinik.dk" },
        { id: "self-mail", userId: "x", fullName: "Self Mail", email: " P@KLINIK.DK " },
        { id: "dr-row", userId: "t-1", fullName: "Dr. Maja" },
        { id: "ter-row", userId: "t-2", fullName: "bo_terapeut" },
        { id: "cp-1", userId: "c-1", fullName: "  Anders Sand ", email: "anders@sand.dk" },
        { id: "cp-dup-id", userId: "c-1", fullName: "Anders Rename", email: "rename@sand.dk" },
        { id: "cp-dup-name", userId: "c-2", fullName: "anders sand", email: "dup@sand.dk" },
        { id: "cp-2", userId: "   ", fullName: "Maria Hansen" },
      ],
      " p-1 ",
      "p@klinik.dk"
    );
    expect(filtered).toEqual([
      { id: "cp-1", userId: "c-1", fullName: "Anders Sand", email: "anders@sand.dk" },
      { id: "cp-2", userId: null, fullName: "Maria Hansen", email: undefined },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        clipCardBalance: 0,
        activeSubscriptionsCount: 0,
        installmentPlans: [],
        invoices: [],
        vippsAgreements: [],
      }),
    });

    // Unauthenticated client view -> empty cardHolder & empty cardNumber defaults
    render(<FinanceFeatureView portalMode="client" />);
    expect(screen.getByTestId("vipps-sandbox-badge")).toBeDefined();
    fireEvent.click(screen.getByTestId("btn-checkout-session"));
    fireEvent.click(screen.getByTestId("select-method-card"));
    expect((screen.getByTestId("input-card-holder") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("input-card-number") as HTMLInputElement).value).toBe("");
    cleanup();

    // Authenticated client view -> defaults cardHolder to signed-in user name, cardNumber stays empty
    render(
      <AuthProvider
        user={{ id: "c-vip", name: "Klara Holm", email: "klara@holm.dk", roles: ["CLIENT"] }}
      >
        <FinanceFeatureView portalMode="client" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId("vipps-sandbox-badge")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("btn-checkout-session"));
    fireEvent.click(screen.getByTestId("select-method-card"));
    expect((screen.getByTestId("input-card-holder") as HTMLInputElement).value).toBe("Klara Holm");
    expect((screen.getByTestId("input-card-number") as HTMLInputElement).value).toBe("");
    cleanup();

    // Cover localizeFinanceStatus fallbacks, default FinanceFeatureView props, & overview/ledger fetch errors
    expect(localizeFinanceStatus(undefined, "da")).toBe("Betalt");
    expect(localizeFinanceStatus("CUSTOM_UNKNOWN", "da")).toBe("CUSTOM_UNKNOWN");

    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/overview") || u.includes("/ledger/summary")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            type: "about:blank",
            title: "Server Error",
            status: 500,
            detail: "Finance backend unavailable",
            errorCode: ErrorCode.INTERNAL_ERROR,
            timestamp: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    render(
      <AuthProvider user={{ id: "c-err", name: "Err Client", email: "c@err.dk", roles: ["CLIENT"] }}>
        <FinanceFeatureView portalMode="client" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("error-detail")).toBeDefined());
    cleanup();

    render(
      <AuthProvider user={{ id: "p-err", name: "Err Prov", email: "p@err.dk", roles: ["PROVIDER"] }}>
        <FinanceFeatureView />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("error-detail")).toBeDefined());
    cleanup();

    // Cover default empty destructuring on FinanceFeatureView and status/client filter fallbacks
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    render(<FinanceFeatureView />);
    await waitFor(() => expect(screen.getByTestId("finance-feature-view")).toBeDefined());
    cleanup();

    expect(localizeFinanceStatus(undefined, "da")).toBe("Betalt");
    expect(localizeFinanceStatus("CUSTOM_RAW", "da")).toBe("CUSTOM_RAW");
    expect(filterFinanceClientOptions("not-array")).toEqual([]);
    expect(filterFinanceClientOptions([{ id: "1", fullName: "Anna" }])).toHaveLength(1);
    expect(localizeGlAccountName("9999", "Fallback", "da")).toBe("Fallback");
  });
});
