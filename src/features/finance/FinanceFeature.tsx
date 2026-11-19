"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: FinanceFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/finance/FinanceFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: FinanceFeature]. Håndterer
 * fakturaudstedelse (Kill Bill), dobbelt bogholderi (Apache Fineract) og
 * kryptografisk bilagsrevision (Eclipse JGit).
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: InvoiceDto], [Record/DTO: PaymentDto], [Record/DTO: RefundDto],
 *      [Record/DTO: FinancialVoucherDto] & [Record/DTO: LedgerSummaryDto]
 *   2. [Service: FinanceApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<InvoiceDto, string>] og validerer
 *      `clientUuid`, positivt `amount` og ISO 4217 `currency` i #validateBeforeCreate(dto)
 *      via [Class: DomainGuard].
 *   3. [Hook: useBaseCrud<InvoiceDto, string>(financeService)]
 *      Binder `financeService` til reaktiv React-tilstand.
 *   4. [Component: <FinanceFeatureView />]
 *      React UI-komponent med RFC 7807 fejlvisning via [Component: <ProblemAlert />].
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
  ProblemDetail,
} from '../../core/baseDomainCore';
import {
  ConfirmActionDialog,
  ProblemAlert,
  useBaseCrud,
  useOptionalAuth,
} from '../../core/baseUiCore';
import { SupportedUiLocale, useUiLocale } from '../i18n/I18nFeature';

// ============================================================================
// 1. DTO CONTRACTS (1:1 mirror of FinanceFeature.java Records)
// ============================================================================

export interface InvoiceDto extends HasId<string> {
  readonly id?: string;
  readonly clientUuid: string;
  readonly therapistUuid?: string;
  readonly appointmentId?: string;
  readonly invoiceNumber?: string;
  readonly description?: string;
  readonly amount?: number;
  readonly amountNetDkk?: number;
  readonly vatRatePercent?: number;
  readonly amountVatDkk?: number;
  readonly amountGrossDkk?: number;
  readonly currency: string;
  readonly status?: string;
  readonly gitCommitHash?: string;
  readonly createdAt?: string;
}

export interface PaymentDto extends HasId<string> {
  readonly id?: string;
  readonly invoiceId: string;
  readonly clientUuid: string;
  readonly amountDkk: number;
  readonly paymentMethod: string;
  readonly status: string;
  readonly gitCommitHash?: string;
  readonly paidAt?: string;
}

export interface RefundDto extends HasId<string> {
  readonly id?: string;
  readonly invoiceId: string;
  readonly clientUuid: string;
  readonly refundAmountDkk: number;
  readonly reason: string;
  readonly status: string;
  readonly gitCommitHash?: string;
  readonly refundedAt?: string;
}

export interface FinancialVoucherDto extends HasId<string> {
  readonly id?: string;
  readonly clientUuid: string;
  readonly voucherType: string;
  readonly summaryLine: string;
  readonly markdownBlock: string;
  readonly authorName: string;
  readonly commitHash?: string;
  readonly referenceHash?: string;
}

export interface LedgerSummaryDto extends HasId<string> {
  readonly id?: string;
  readonly clientUuid: string;
  readonly totalInvoicedGrossDkk: number;
  readonly totalPaidDkk: number;
  readonly totalRefundedDkk: number;
  readonly outstandingReceivablesDkk: number;
  readonly invoiceCount: number;
  readonly voucherCommitCount: number;
}

export interface VippsTierConfig {
  readonly productType: string;
  readonly planName: string;
  readonly amountDkk: number;
  readonly payoutIban: string;
  readonly vippsMsn: string;
  readonly glAccount: string;
  readonly grantedRole: string;
}

export interface VippsConfigDto {
  readonly bundleSymbolicName: string;
  readonly bundleVersion: string;
  readonly pluginName: string;
  readonly apiBaseUrl?: string;
  readonly merchantName?: string;
  readonly merchantCvr?: string;
  readonly clinicPayoutIban: string;
  readonly clinicVippsMsn: string;
  readonly tiers: {
    readonly THERAPIST_ACCESS: VippsTierConfig;
    readonly MANAGEMENT_ACCESS: VippsTierConfig;
  };
  readonly grantedRoles?: string[];
}

export interface VippsAgreementItem {
  readonly agreementId: string;
  readonly productType: string;
  readonly planName: string;
  readonly amountDkk: number;
  readonly currency: string;
  readonly paymentMethod: string;
  readonly maskedInstrument: string;
  readonly payoutIban: string;
  readonly vippsMsn: string;
  readonly grantedRole?: string | null;
  readonly status: string;
  readonly chargeCount?: number;
  readonly gitCommitHash?: string;
}

export interface VippsCheckoutReceipt {
  readonly status: string;
  readonly productType: string;
  readonly planName: string;
  readonly amountDkk: number;
  readonly currency: string;
  readonly maskedInstrument: string;
  readonly payoutIban: string;
  readonly vippsMsn: string;
  readonly grantedRole?: string | null;
  readonly agreementId?: string | null;
  readonly vippsReferenceId: string;
  readonly redirectUrl?: string | null;
  readonly merchantName?: string;
  readonly merchantCvr?: string;
  readonly apiBaseUrl?: string;
  readonly gitCommitHash: string;
}

export interface ClientFinanceOverviewDto {
  readonly clientUuid: string;
  readonly invoices: InvoiceDto[];
  readonly prepaidSavings: {
    readonly savingsAccountId: string;
    readonly balance: number;
    readonly remainingClips: number;
    readonly currency: string;
  };
  readonly subscriptions: Array<{
    readonly subscriptionId: string;
    readonly planName: string;
    readonly monthlyAmount: number;
    readonly currency: string;
    readonly status: string;
  }>;
  readonly installmentPlans: Array<{
    readonly loanId: string;
    readonly description: string;
    readonly principalAmount: number;
    readonly remainingPrincipal: number;
    readonly installmentsCount: number;
    readonly paidInstallments: number;
    readonly currency: string;
    readonly status: string;
  }>;
  readonly vippsAgreements?: VippsAgreementItem[];
  readonly vippsConfig?: VippsConfigDto;
  readonly gitHistory: Array<{
    readonly commitHash: string;
    readonly shortHash?: string;
    readonly message: string;
    readonly authorName: string;
  }>;
}

export interface GeneralLedgerSummaryDto {
  readonly chartOfAccounts: Array<{
    readonly code?: string;
    readonly glCode?: string;
    readonly name: string;
    readonly type: string;
    readonly balance: number;
  }>;
  readonly vippsAgreements?: VippsAgreementItem[];
  readonly vippsConfig?: VippsConfigDto;
  readonly gitHistory: Array<{
    readonly commitHash: string;
    readonly shortHash?: string;
    readonly message: string;
    readonly authorName: string;
  }>;
}

// ============================================================================
// 2. FEATURE API SERVICE (Module-Private — DO NOT EXPORT! Mirrors package-private in Java)
// ============================================================================

class FinanceApiService extends BaseApiService<InvoiceDto, string> {
  constructor() {
    super('/api/backend/finance');
  }

  protected override validateBeforeCreate(dto: Omit<InvoiceDto, 'id'> | InvoiceDto): void {
    DomainGuard.require(
      Boolean(dto.clientUuid && dto.clientUuid.trim().length > 0),
      'BAD_REQUEST',
      'Missing required UUID field: clientUuid'
    );
    const effectiveAmount = dto.amount ?? dto.amountGrossDkk ?? 0;
    DomainGuard.require(
      effectiveAmount > 0,
      'BAD_REQUEST',
      'Amount must be positive: amount'
    );
    DomainGuard.require(
      Boolean(dto.currency && /^[A-Z]{3}$/.test(dto.currency.trim())),
      'BAD_REQUEST',
      'Invalid ISO 4217 currency code'
    );
  }
}

// Singleton instance scoped strictly to this vertical slice
const financeService = new FinanceApiService();

async function requestFinanceJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json, application/problem+json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const problem = (await res.json()) as ProblemDetail;
    throw problem;
  }
  return (await res.json()) as T;
}

// ============================================================================
// 3. FEATURE VIEW (Role-Aware React Entrypoint for Client vs. Therapist/Admin)
// ============================================================================

const FINANCE_STATUS_LABELS: Record<SupportedUiLocale, Record<string, string>> = {
  da: {
    PAID: 'Betalt',
    ACTIVE: 'Aktiv',
    STOPPED: 'Opsagt',
    CANCELLED: 'Annulleret',
    REFUNDED: 'Refunderet',
    PENDING: 'Afventer',
    CAPTURED: 'Gennemført',
    DRAFT: 'Kladde',
  },
  en: {
    PAID: 'Paid',
    ACTIVE: 'Active',
    STOPPED: 'Cancelled',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
    PENDING: 'Pending',
    CAPTURED: 'Captured',
    DRAFT: 'Draft',
  },
  fr: {
    PAID: 'Payée',
    ACTIVE: 'Actif',
    STOPPED: 'Résilié',
    CANCELLED: 'Annulée',
    REFUNDED: 'Remboursée',
    PENDING: 'En attente',
    CAPTURED: 'Validé',
    DRAFT: 'Brouillon',
  },
  es: {
    PAID: 'Pagada',
    ACTIVE: 'Activo',
    STOPPED: 'Cancelado',
    CANCELLED: 'Cancelada',
    REFUNDED: 'Reembolsada',
    PENDING: 'Pendiente',
    CAPTURED: 'Completado',
    DRAFT: 'Borrador',
  },
  de: {
    PAID: 'Bezahlt',
    ACTIVE: 'Aktiv',
    STOPPED: 'Gekündigt',
    CANCELLED: 'Storniert',
    REFUNDED: 'Erstattet',
    PENDING: 'Ausstehend',
    CAPTURED: 'Abgeschlossen',
    DRAFT: 'Entwurf',
  },
};

export function localizeFinanceStatus(
  status: string | undefined,
  locale: SupportedUiLocale
): string {
  const key = (status || 'PAID').toUpperCase();
  return FINANCE_STATUS_LABELS[locale][key] ?? status ?? 'PAID';
}

const GL_ACCOUNT_NAMES: Record<SupportedUiLocale, Record<string, string>> = {
  da: {
    '1100': 'Bank & likviditet',
    '1200': 'Tilgodehavender (klienter)',
    '2100': 'Forudbetalte klippekort',
    '2200': 'Udskudte indtægter',
    '4100': 'Konsultationsindtægter',
    '4200': 'Abonnementsindtægter',
    '4300': 'Licens- & platformindtægter',
    '5100': 'Kreditnotaer & refunderinger',
  },
  en: {
    '1100': 'Bank & Cash',
    '1200': 'Client Receivables',
    '2100': 'Prepaid Session Passes',
    '2200': 'Deferred Revenue',
    '4100': 'Session Fee Revenue',
    '4200': 'Subscription Revenue',
    '4300': 'Platform & License Revenue',
    '5100': 'Refunds & Credit Notes',
  },
  fr: {
    '1100': 'Banque & Trésorerie',
    '1200': 'Créances Clients',
    '2100': 'Forfaits Séances Prépayés',
    '2200': 'Produits Constatés d’Avance',
    '4100': 'Revenus Consultations',
    '4200': 'Revenus Abonnements',
    '4300': 'Revenus Licences & Plateforme',
    '5100': 'Avoirs & Remboursements',
  },
  es: {
    '1100': 'Banco y Tesorería',
    '1200': 'Cuentas por Cobrar',
    '2100': 'Bonos de Sesiones Prepago',
    '2200': 'Ingresos Diferidos',
    '4100': 'Ingresos por Sesiones',
    '4200': 'Ingresos por Suscripción',
    '4300': 'Licencias y Plataforma',
    '5100': 'Notas de Abono y Reembolsos',
  },
  de: {
    '1100': 'Bank & Liquidität',
    '1200': 'Forderungen (Klienten)',
    '2100': 'Vorausbezahlte Pakete',
    '2200': 'Passive Rechnungsabgrenzung',
    '4100': 'Sitzungserlöse',
    '4200': 'Abonnementerlöse',
    '4300': 'Plattform- & Lizenzerlöse',
    '5100': 'Gutschriften & Erstattungen',
  },
};

export function localizeGlAccountName(
  accountCode: string | undefined,
  fallbackName: string | undefined,
  locale: SupportedUiLocale
): string {
  if (accountCode && GL_ACCOUNT_NAMES[locale][accountCode]) {
    return GL_ACCOUNT_NAMES[locale][accountCode];
  }
  return fallbackName || '';
}

const FINANCE_INVOICES_PER_PAGE = 10;

interface FinanceCopy {
  clientBadge: string;
  clientHeading: string;
  clipCardBalanceLabel: string;
  clipsUnit: string;
  balancePrefix: string;
  activeSubscriptionsLabel: string;
  monthlyCareLabel: string;
  myInvoicesLabel: string;
  invoicesSubLabel: string;
  buyClipcardBtn: string;
  consumeClipBtn: string;
  activateSubscriptionBtn: string;
  loadingText: string;
  installmentPlansHeading: string;
  remainingDebtLabel: string;
  installmentsUnit: string;
  payNextInstallmentBtn: string;
  invoiceOverviewHeading: string;
  emptyInvoicesText: string;
  gitHistoryHeading: string;
  providerBadge: string;
  providerHeading: string;
  clientPickerLabel: string;
  selectClientPlaceholder: string;
  manualClientOption: string;
  backToClientListBtn: string;
  clientUuidLabel: string;
  clientUuidPlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  amountLabel: string;
  amountPlaceholder: string;
  currencyLabel: string;
  currencyPlaceholder: string;
  createInvoiceBtn: string;
  createLoanBtn: string;
  defaultLoanDescription: string;
  refundReasonText: string;
  accountPrefix: string;
  refundBtn: string;
  refundConfirmTitle: string;
  refundConfirmDesc: string;
  deleteBtn: string;
  deleteConfirmTitle: string;
  deleteConfirmDesc: string;
  vippsHubHeading: string;
  vippsHubClientHeading: string;
  vippsHubBadge: string;
  technicalAuditSummary: string;
  professionalLicensesSummary: string;
  therapistAccessTitle: string;
  therapistAccessDesc: string;
  managementAccessTitle: string;
  managementAccessDesc: string;
  singleSessionTitle: string;
  singleSessionDesc: string;
  subscriptionTitle: string;
  subscriptionDesc: string;
  clipcardTitle: string;
  clipcardDesc: string;
  openCheckoutBtn: string;
  openVippsRedirectBtn: string;
  payoutLabel: string;
  msnLabel: string;
  checkoutModalTitle: string;
  paymentMethodLabel: string;
  methodMobilePayLabel: string;
  methodCardLabel: string;
  mobilePayPhoneLabel: string;
  cardHolderLabel: string;
  cardNumberLabel: string;
  cardExpiryLabel: string;
  cardCvcLabel: string;
  pciNotice: string;
  confirmPaymentBtn: string;
  cancelModalBtn: string;
  agreementsHeading: string;
  chargeNextBtn: string;
  cancelAgreementBtn: string;
  cancelAgreementConfirmTitle: string;
  cancelAgreementConfirmDesc: string;
  receiptTitle: string;
  receiptClientTitle: string;
  roleUpgradedPrefix: string;
  perMonthUnit: string;
  pageLabel: string;
  prevPageBtn: string;
  nextPageBtn: string;
  sandboxBadge: string;
}

const FINANCE_COPY: Record<SupportedUiLocale, FinanceCopy> = {
  da: {
    clientBadge: "Min Økonomi & Klippekort",
    clientHeading: "Fakturaer, Klippekort & Betalingsplaner",
    clipCardBalanceLabel: "Klippekort-saldo",
    clipsUnit: "klip",
    balancePrefix: "Saldo",
    activeSubscriptionsLabel: "Aktive Abonnementer",
    monthlyCareLabel: "Månedlig omsorgsaftale",
    myInvoicesLabel: "Mine Fakturaer",
    invoicesSubLabel: "Fakturaer og bilag",
    buyClipcardBtn: "Køb 5-klips klippekort (3 DKK)",
    consumeClipBtn: "Indløs 1 klip",
    activateSubscriptionBtn: "Aktivér månedsabonnement (3 DKK/md)",
    loadingText: "Indlæser...",
    installmentPlansHeading: "Afdragsordninger",
    remainingDebtLabel: "Restgæld",
    installmentsUnit: "rater",
    payNextInstallmentBtn: "Betal næste afdrag",
    invoiceOverviewHeading: "Fakturaoversigt",
    emptyInvoicesText: "Ingen registrerede fakturaer endnu.",
    gitHistoryHeading: "Teknisk bilagshistorik",
    providerBadge: "Behandler Hovedbog & Fakturering",
    providerHeading: "Klinikøkonomi, Fakturering & Hovedbog",
    clientPickerLabel: "Klient",
    selectClientPlaceholder: "-- Vælg klient --",
    manualClientOption: "Indtast klient-ID manuelt",
    backToClientListBtn: "Vælg fra liste",
    clientUuidLabel: "Klient-ID",
    clientUuidPlaceholder: "Klient UUID",
    descriptionLabel: "Beskrivelse",
    descriptionPlaceholder: "Fakturabeskrivelse",
    amountLabel: "Beløb",
    amountPlaceholder: "Beløb",
    currencyLabel: "Valuta",
    currencyPlaceholder: "Valuta (f.eks. DKK)",
    createInvoiceBtn: "Opret Faktura",
    createLoanBtn: "Afdragsordning (3 rater)",
    defaultLoanDescription: "Traumebehandlingsforløb",
    refundReasonText: "Kreditnota udstedt af behandler",
    accountPrefix: "Konto",
    refundBtn: "Refunder",
    refundConfirmTitle: "Udsted refundering?",
    refundConfirmDesc: "Der udstedes en kreditnota på denne faktura, og beløbet bogføres som refunderet.",
    deleteBtn: "Slet",
    deleteConfirmTitle: "Slet faktura?",
    deleteConfirmDesc: "Denne handling sletter fakturaen permanent fra oversigten.",
    vippsHubHeading: "Vipps MobilePay & Kreditkort Checkout",
    vippsHubClientHeading: "Betaling, Abonnement & Klippekort",
    vippsHubBadge: "OSGi Bundt · Docker Secrets Routing",
    technicalAuditSummary: "Teknisk revisionsdetalje",
    professionalLicensesSummary: "Er du behandler eller klinikejer? Se professionelle licenser",
    therapistAccessTitle: "Therapist-adgang",
    therapistAccessDesc: "Låser behandlerportal, kalender & klientoversigt op.",
    managementAccessTitle: "Management-adgang",
    managementAccessDesc: "Fuld administrationsadgang til klinik, økonomi & brugere.",
    singleSessionTitle: "Enkeltsession",
    singleSessionDesc: "Engangsbetaling for én terapisession via Vipps MobilePay eller kort.",
    subscriptionTitle: "Månedsabonnement",
    subscriptionDesc: "Automatisk månedligt omsorgsabonnement via Vipps MobilePay.",
    clipcardTitle: "5-turs Klippekort",
    clipcardDesc: "Forudbetalt klippekort til 5 terapisessioner.",
    openCheckoutBtn: "Betal via Checkout",
    openVippsRedirectBtn: "Åbn Vipps MobilePay betalingsside",
    payoutLabel: "Udbetalings-IBAN",
    msnLabel: "Vipps MSN",
    checkoutModalTitle: "Gennemfør betaling",
    paymentMethodLabel: "Vælg betalingsmiddel",
    methodMobilePayLabel: "Vipps MobilePay",
    methodCardLabel: "Kreditkort",
    mobilePayPhoneLabel: "Mobilnummer (+45)",
    cardHolderLabel: "Kortholder",
    cardNumberLabel: "Kortnummer (tokeniseres i browser)",
    cardExpiryLabel: "Udløbsdato (MM/ÅÅ)",
    cardCvcLabel: "Sikkerhedskode (CVC)",
    pciNotice: "PCI-beskyttet: Råt kortnummer sendes aldrig til backend — kun sikkert token & sidste 4 cifre.",
    confirmPaymentBtn: "Godkend betaling",
    cancelModalBtn: "Annuller",
    agreementsHeading: "Aktive betalingsaftaler",
    chargeNextBtn: "Træk næste rate",
    cancelAgreementBtn: "Opsig aftale",
    cancelAgreementConfirmTitle: "Opsig betalingsaftale?",
    cancelAgreementConfirmDesc: "Den faste betalingsaftale bliver stoppet øjeblikkeligt.",
    receiptTitle: "Betaling gennemført via Kill Bill OSGi & Vipps MobilePay",
    receiptClientTitle: "Betaling gennemført",
    roleUpgradedPrefix: "Ny platformrolle tildelt",
    perMonthUnit: "DKK/md",
    pageLabel: "Side",
    prevPageBtn: "Forrige",
    nextPageBtn: "Næste",
    sandboxBadge: "Sandbox / Testmiljø",
  },
  en: {
    clientBadge: "My Finance & Session Passes",
    clientHeading: "Invoices, Session Passes & Payment Plans",
    clipCardBalanceLabel: "Session pass balance",
    clipsUnit: "sessions",
    balancePrefix: "Balance",
    activeSubscriptionsLabel: "Active Subscriptions",
    monthlyCareLabel: "Monthly care plan",
    myInvoicesLabel: "My Invoices",
    invoicesSubLabel: "Invoices & receipts",
    buyClipcardBtn: "Buy 5-session pass (3 DKK)",
    consumeClipBtn: "Redeem 1 session",
    activateSubscriptionBtn: "Activate monthly plan (3 DKK/mo)",
    loadingText: "Loading...",
    installmentPlansHeading: "Installment Plans",
    remainingDebtLabel: "Remaining balance",
    installmentsUnit: "installments",
    payNextInstallmentBtn: "Pay next installment",
    invoiceOverviewHeading: "Invoice Overview",
    emptyInvoicesText: "No recorded invoices yet.",
    gitHistoryHeading: "Technical ledger history",
    providerBadge: "Provider General Ledger & Billing",
    providerHeading: "Clinic Finance, Billing & General Ledger",
    clientPickerLabel: "Client",
    selectClientPlaceholder: "-- Select client --",
    manualClientOption: "Enter client ID manually",
    backToClientListBtn: "Pick from list",
    clientUuidLabel: "Client ID",
    clientUuidPlaceholder: "Client UUID",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Invoice description",
    amountLabel: "Amount",
    amountPlaceholder: "Amount",
    currencyLabel: "Currency",
    currencyPlaceholder: "Currency (e.g. DKK)",
    createInvoiceBtn: "Create Invoice",
    createLoanBtn: "Installment plan (3 installments)",
    defaultLoanDescription: "Trauma care program",
    refundReasonText: "Credit note issued by provider",
    accountPrefix: "Account",
    refundBtn: "Refund",
    refundConfirmTitle: "Issue refund?",
    refundConfirmDesc: "This creates a credit note and marks the invoice as refunded.",
    deleteBtn: "Delete",
    deleteConfirmTitle: "Delete invoice?",
    deleteConfirmDesc: "This permanently removes the invoice from the overview.",
    vippsHubHeading: "Vipps MobilePay & Credit Card Checkout",
    vippsHubClientHeading: "Payments, Subscriptions & Session Passes",
    vippsHubBadge: "OSGi Bundle · Docker Secrets Routing",
    technicalAuditSummary: "Technical audit details",
    professionalLicensesSummary: "Are you a therapist or clinic owner? View professional licenses",
    therapistAccessTitle: "Therapist Access",
    therapistAccessDesc: "Unlocks therapist workspace, schedule & client overview.",
    managementAccessTitle: "Management Access",
    managementAccessDesc: "Full management access across clinic operations & finance.",
    singleSessionTitle: "Single Session",
    singleSessionDesc: "One-time payment for a single therapy session via Vipps MobilePay or card.",
    subscriptionTitle: "Monthly Subscription",
    subscriptionDesc: "Automatic monthly care plan via Vipps MobilePay.",
    clipcardTitle: "5-Session Pass",
    clipcardDesc: "Prepaid session pass covering 5 therapy sessions.",
    openCheckoutBtn: "Pay via Checkout",
    openVippsRedirectBtn: "Open Vipps MobilePay payment page",
    payoutLabel: "Payout IBAN",
    msnLabel: "Vipps MSN",
    checkoutModalTitle: "Complete Payment",
    paymentMethodLabel: "Choose payment method",
    methodMobilePayLabel: "Vipps MobilePay",
    methodCardLabel: "Credit Card",
    mobilePayPhoneLabel: "Phone Number (+45)",
    cardHolderLabel: "Cardholder Name",
    cardNumberLabel: "Card Number (tokenized client-side)",
    cardExpiryLabel: "Expiry (MM/YY)",
    cardCvcLabel: "Security Code (CVC)",
    pciNotice: "PCI-safe: Raw card numbers never leave the browser — only a token and last 4 digits are transmitted.",
    confirmPaymentBtn: "Confirm Payment",
    cancelModalBtn: "Cancel",
    agreementsHeading: "Active Payment Agreements",
    chargeNextBtn: "Charge Next Period",
    cancelAgreementBtn: "Cancel Agreement",
    cancelAgreementConfirmTitle: "Cancel payment agreement?",
    cancelAgreementConfirmDesc: "The recurring payment agreement will be stopped immediately.",
    receiptTitle: "Payment processed via Kill Bill OSGi & Vipps MobilePay",
    receiptClientTitle: "Payment completed",
    roleUpgradedPrefix: "New platform role granted",
    perMonthUnit: "DKK/mo",
    pageLabel: "Page",
    prevPageBtn: "Previous",
    nextPageBtn: "Next",
    sandboxBadge: "Sandbox / Test mode",
  },
  fr: {
    clientBadge: "Mes Finances & Forfaits Séances",
    clientHeading: "Factures, Forfaits & Plans de Paiement",
    clipCardBalanceLabel: "Solde forfait séances",
    clipsUnit: "séances",
    balancePrefix: "Solde",
    activeSubscriptionsLabel: "Abonnements Actifs",
    monthlyCareLabel: "Suivi mensuel",
    myInvoicesLabel: "Mes Factures",
    invoicesSubLabel: "Factures et reçus",
    buyClipcardBtn: "Acheter forfait 5 séances (3 DKK)",
    consumeClipBtn: "Utiliser 1 séance",
    activateSubscriptionBtn: "Activer l'abonnement mensuel (3 DKK/mois)",
    loadingText: "Chargement...",
    installmentPlansHeading: "Plans de Paiement Échelonné",
    remainingDebtLabel: "Solde restant",
    installmentsUnit: "mensualités",
    payNextInstallmentBtn: "Payer la prochaine échéance",
    invoiceOverviewHeading: "Aperçu des Factures",
    emptyInvoicesText: "Aucune facture enregistrée pour le moment.",
    gitHistoryHeading: "Historique comptable technique",
    providerBadge: "Grand Livre & Facturation Praticien",
    providerHeading: "Finances Cliniques, Facturation & Grand Livre",
    clientPickerLabel: "Client",
    selectClientPlaceholder: "-- Choisir un client --",
    manualClientOption: "Saisir l’ID client manuellement",
    backToClientListBtn: "Choisir dans la liste",
    clientUuidLabel: "ID Client",
    clientUuidPlaceholder: "UUID Client",
    descriptionLabel: "Description",
    descriptionPlaceholder: "Libellé de facture",
    amountLabel: "Montant",
    amountPlaceholder: "Montant",
    currencyLabel: "Devise",
    currencyPlaceholder: "Devise (ex. DKK)",
    createInvoiceBtn: "Créer une Facture",
    createLoanBtn: "Plan en 3 fois",
    defaultLoanDescription: "Parcours de soins psychotrauma",
    refundReasonText: "Avoir émis par le praticien",
    accountPrefix: "Compte",
    refundBtn: "Rembourser",
    refundConfirmTitle: "Émettre un remboursement ?",
    refundConfirmDesc: "Un avoir sera émis et la facture marquée comme remboursée.",
    deleteBtn: "Supprimer",
    deleteConfirmTitle: "Supprimer la facture ?",
    deleteConfirmDesc: "Cette action supprime définitivement la facture.",
    vippsHubHeading: "Paiement Vipps MobilePay & Carte Bancaire",
    vippsHubClientHeading: "Paiement, Abonnements & Forfaits",
    vippsHubBadge: "Bundle OSGi · Routage Docker Secrets",
    technicalAuditSummary: "Détails techniques d’audit",
    professionalLicensesSummary: "Vous êtes praticien ou gestionnaire ? Voir les licences professionnelles",
    therapistAccessTitle: "Accès Thérapeute",
    therapistAccessDesc: "Débloque l'espace praticien, l'agenda et le suivi.",
    managementAccessTitle: "Accès Management",
    managementAccessDesc: "Accès complet administration clinique & finances.",
    singleSessionTitle: "Séance Unique",
    singleSessionDesc: "Paiement unique pour une séance de thérapie via Vipps MobilePay ou carte.",
    subscriptionTitle: "Abonnement Mensuel",
    subscriptionDesc: "Suivi mensuel automatique via Vipps MobilePay.",
    clipcardTitle: "Forfait 5 Séances",
    clipcardDesc: "Forfait prépayé pour 5 séances de thérapie.",
    openCheckoutBtn: "Payer par Checkout",
    openVippsRedirectBtn: "Ouvrir la page de paiement Vipps MobilePay",
    payoutLabel: "IBAN destinataire",
    msnLabel: "MSN Vipps",
    checkoutModalTitle: "Finaliser le paiement",
    paymentMethodLabel: "Moyen de paiement",
    methodMobilePayLabel: "Vipps MobilePay",
    methodCardLabel: "Carte bancaire",
    mobilePayPhoneLabel: "Numéro Mobile (+45)",
    cardHolderLabel: "Titulaire de la carte",
    cardNumberLabel: "Numéro de carte (tokénisé localement)",
    cardExpiryLabel: "Expiration (MM/AA)",
    cardCvcLabel: "Cryptogramme (CVC)",
    pciNotice: "Conforme PCI : le numéro complet n'est jamais envoyé au serveur — seuls un jeton et 4 chiffres sont transmis.",
    confirmPaymentBtn: "Confirmer le paiement",
    cancelModalBtn: "Annuler",
    agreementsHeading: "Accords de paiement actifs",
    chargeNextBtn: "Prélever l'échéance",
    cancelAgreementBtn: "Résilier le mandat",
    cancelAgreementConfirmTitle: "Résilier l’accord de paiement ?",
    cancelAgreementConfirmDesc: "Les prélèvements récurrents seront arrêtés immédiatement.",
    receiptTitle: "Paiement traité via Kill Bill OSGi & Vipps MobilePay",
    receiptClientTitle: "Paiement effectué",
    roleUpgradedPrefix: "Nouveau rôle attribué",
    perMonthUnit: "DKK/mois",
    pageLabel: "Page",
    prevPageBtn: "Précédent",
    nextPageBtn: "Suivant",
    sandboxBadge: "Environnement Sandbox / Test",
  },
  es: {
    clientBadge: "Mis Finanzas y Bonos de Sesiones",
    clientHeading: "Facturas, Bonos y Planes de Pago",
    clipCardBalanceLabel: "Saldo de bonos",
    clipsUnit: "sesiones",
    balancePrefix: "Saldo",
    activeSubscriptionsLabel: "Suscripciones Activas",
    monthlyCareLabel: "Acuerdo mensual de atención",
    myInvoicesLabel: "Mis Facturas",
    invoicesSubLabel: "Facturas y recibos",
    buyClipcardBtn: "Comprar bono de 5 sesiones (3 DKK)",
    consumeClipBtn: "Canjear 1 sesión",
    activateSubscriptionBtn: "Activar suscripción mensual (3 DKK/mes)",
    loadingText: "Cargando...",
    installmentPlansHeading: "Planes de Pago a Plazos",
    remainingDebtLabel: "Saldo pendiente",
    installmentsUnit: "cuotas",
    payNextInstallmentBtn: "Pagar siguiente cuota",
    invoiceOverviewHeading: "Resumen de Facturas",
    emptyInvoicesText: "Aún no hay facturas registradas.",
    gitHistoryHeading: "Historial contable técnico",
    providerBadge: "Libro Mayor y Facturación del Terapeuta",
    providerHeading: "Finanzas Clínicas, Facturación y Libro Mayor",
    clientPickerLabel: "Cliente",
    selectClientPlaceholder: "-- Seleccionar cliente --",
    manualClientOption: "Introducir ID manualmente",
    backToClientListBtn: "Elegir de la lista",
    clientUuidLabel: "ID del cliente",
    clientUuidPlaceholder: "UUID del cliente",
    descriptionLabel: "Descripción",
    descriptionPlaceholder: "Descripción de factura",
    amountLabel: "Importe",
    amountPlaceholder: "Importe",
    currencyLabel: "Moneda",
    currencyPlaceholder: "Moneda (ej. DKK)",
    createInvoiceBtn: "Crear Factura",
    createLoanBtn: "Pago a plazos (3 cuotas)",
    defaultLoanDescription: "Programa de atención al trauma",
    refundReasonText: "Nota de abono emitida por el terapeuta",
    accountPrefix: "Cuenta",
    refundBtn: "Reembolsar",
    refundConfirmTitle: "¿Emitir reembolso?",
    refundConfirmDesc: "Se generará un abono y la factura quedará reembolsada.",
    deleteBtn: "Eliminar",
    deleteConfirmTitle: "¿Eliminar factura?",
    deleteConfirmDesc: "Esta acción elimina la factura permanentemente.",
    vippsHubHeading: "Checkout Vipps MobilePay y Tarjeta",
    vippsHubClientHeading: "Pagos, Suscripciones y Bonos",
    vippsHubBadge: "Bundle OSGi · Enrutamiento Docker Secrets",
    technicalAuditSummary: "Detalles técnicos de auditoría",
    professionalLicensesSummary: "¿Eres terapeuta o director de clínica? Ver licencias profesionales",
    therapistAccessTitle: "Acceso Terapeuta",
    therapistAccessDesc: "Desbloquea el espacio clínico y la agenda.",
    managementAccessTitle: "Acceso Dirección",
    managementAccessDesc: "Acceso completo de gestión clínica y financiera.",
    singleSessionTitle: "Sesión Individual",
    singleSessionDesc: "Pago único por una sesión de terapia mediante Vipps MobilePay o tarjeta.",
    subscriptionTitle: "Suscripción Mensual",
    subscriptionDesc: "Suscripción mensual automática con Vipps MobilePay.",
    clipcardTitle: "Bono de 5 Sesiones",
    clipcardDesc: "Paquete prepago para 5 sesiones de terapia.",
    openCheckoutBtn: "Pagar en Checkout",
    openVippsRedirectBtn: "Abrir página de pago Vipps MobilePay",
    payoutLabel: "IBAN de destino",
    msnLabel: "MSN Vipps",
    checkoutModalTitle: "Completar pago",
    paymentMethodLabel: "Método de pago",
    methodMobilePayLabel: "Vipps MobilePay",
    methodCardLabel: "Tarjeta de crédito",
    mobilePayPhoneLabel: "Teléfono móvil (+45)",
    cardHolderLabel: "Titular de la tarjeta",
    cardNumberLabel: "Número de tarjeta (tokenizado localmente)",
    cardExpiryLabel: "Caducidad (MM/AA)",
    cardCvcLabel: "Código CVC",
    pciNotice: "Seguro PCI: la tarjeta completa nunca se envía al servidor; solo token y últimos 4 dígitos.",
    confirmPaymentBtn: "Confirmar pago",
    cancelModalBtn: "Cancelar",
    agreementsHeading: "Acuerdos de pago activos",
    chargeNextBtn: "Cobrar siguiente cuota",
    cancelAgreementBtn: "Cancelar acuerdo",
    cancelAgreementConfirmTitle: "¿Cancelar acuerdo de pago?",
    cancelAgreementConfirmDesc: "Los cobros recurrentes se detendrán de inmediato.",
    receiptTitle: "Pago procesado vía Kill Bill OSGi y Vipps MobilePay",
    receiptClientTitle: "Pago completado",
    roleUpgradedPrefix: "Nuevo rol concedido",
    perMonthUnit: "DKK/mes",
    pageLabel: "Página",
    prevPageBtn: "Anterior",
    nextPageBtn: "Siguiente",
    sandboxBadge: "Entorno Sandbox / Pruebas",
  },
  de: {
    clientBadge: "Meine Finanzen & Sitzungspakete",
    clientHeading: "Rechnungen, Sitzungspakete & Ratenzahlung",
    clipCardBalanceLabel: "Paket-Guthaben",
    clipsUnit: "Sitzungen",
    balancePrefix: "Saldo",
    activeSubscriptionsLabel: "Aktive Abonnements",
    monthlyCareLabel: "Monatliche Betreuungsvereinbarung",
    myInvoicesLabel: "Meine Rechnungen",
    invoicesSubLabel: "Rechnungen & Belege",
    buyClipcardBtn: "5er-Sitzungspaket kaufen (3 DKK)",
    consumeClipBtn: "1 Sitzung einlösen",
    activateSubscriptionBtn: "Monatsabo aktivieren (3 DKK/Monat)",
    loadingText: "Wird geladen...",
    installmentPlansHeading: "Ratenzahlungspläne",
    remainingDebtLabel: "Restbetrag",
    installmentsUnit: "Raten",
    payNextInstallmentBtn: "Nächste Rate zahlen",
    invoiceOverviewHeading: "Rechnungsübersicht",
    emptyInvoicesText: "Noch keine Rechnungen erfasst.",
    gitHistoryHeading: "Technischer Belegverlauf",
    providerBadge: "Therapeuten-Hauptbuch & Abrechnung",
    providerHeading: "Klinikfinanzen, Abrechnung & Hauptbuch",
    clientPickerLabel: "Klient",
    selectClientPlaceholder: "-- Klient auswählen --",
    manualClientOption: "Klient-ID manuell eingeben",
    backToClientListBtn: "Aus Liste wählen",
    clientUuidLabel: "Klient-ID",
    clientUuidPlaceholder: "Klient UUID",
    descriptionLabel: "Beschreibung",
    descriptionPlaceholder: "Rechnungsbeschreibung",
    amountLabel: "Betrag",
    amountPlaceholder: "Betrag",
    currencyLabel: "Währung",
    currencyPlaceholder: "Währung (z. B. DKK)",
    createInvoiceBtn: "Rechnung erstellen",
    createLoanBtn: "Ratenzahlung (3 Raten)",
    defaultLoanDescription: "Traumatherapie-Verlauf",
    refundReasonText: "Gutschrift durch Therapeut ausgestellt",
    accountPrefix: "Konto",
    refundBtn: "Erstatten",
    refundConfirmTitle: "Erstattung ausstellen?",
    refundConfirmDesc: "Es wird eine Gutschrift erstellt und die Rechnung als erstattet markiert.",
    deleteBtn: "Löschen",
    deleteConfirmTitle: "Rechnung löschen?",
    deleteConfirmDesc: "Dieser Vorgang entfernt die Rechnung dauerhaft.",
    vippsHubHeading: "Vipps MobilePay & Kreditkarten-Checkout",
    vippsHubClientHeading: "Zahlung, Abonnement & Sitzungspakete",
    vippsHubBadge: "OSGi-Bundle · Docker-Secrets-Routing",
    technicalAuditSummary: "Technische Prüfdetails",
    professionalLicensesSummary: "Sind Sie Therapeut oder Klinikleitung? Professionelle Lizenzen ansehen",
    therapistAccessTitle: "Therapeuten-Zugang",
    therapistAccessDesc: "Schaltet Therapeutenportal, Kalender & Übersicht frei.",
    managementAccessTitle: "Management-Zugang",
    managementAccessDesc: "Vollzugriff auf Klinikleitung, Finanzen & Benutzer.",
    singleSessionTitle: "Einzelsitzung",
    singleSessionDesc: "Einmalzahlung für eine Therapiesitzung per Vipps MobilePay oder Karte.",
    subscriptionTitle: "Monatsabonnement",
    subscriptionDesc: "Automatisches Monatsabo über Vipps MobilePay.",
    clipcardTitle: "5er-Sitzungspaket",
    clipcardDesc: "Vorausbezahltes Paket für 5 Therapiesitzungen.",
    openCheckoutBtn: "Über Checkout zahlen",
    openVippsRedirectBtn: "Vipps MobilePay-Zahlungsseite öffnen",
    payoutLabel: "Ziel-IBAN",
    msnLabel: "Vipps MSN",
    checkoutModalTitle: "Zahlung abschließen",
    paymentMethodLabel: "Zahlungsart wählen",
    methodMobilePayLabel: "Vipps MobilePay",
    methodCardLabel: "Kreditkarte",
    mobilePayPhoneLabel: "Mobilnummer (+45)",
    cardHolderLabel: "Karteninhaber",
    cardNumberLabel: "Kartennummer (im Browser tokenisiert)",
    cardExpiryLabel: "Gültig bis (MM/JJ)",
    cardCvcLabel: "Prüfziffer (CVC)",
    pciNotice: "PCI-sicher: Die vollständige Kartennummer verlässt nie den Browser — nur Token & letzte 4 Ziffern.",
    confirmPaymentBtn: "Zahlung bestätigen",
    cancelModalBtn: "Abbrechen",
    agreementsHeading: "Aktive Zahlungsvereinbarungen",
    chargeNextBtn: "Nächste Rate einziehen",
    cancelAgreementBtn: "Vereinbarung kündigen",
    cancelAgreementConfirmTitle: "Vereinbarung kündigen?",
    cancelAgreementConfirmDesc: "Die wiederkehrende Zahlung wird sofort beendet.",
    receiptTitle: "Zahlung über Kill Bill OSGi & Vipps MobilePay ausgeführt",
    receiptClientTitle: "Zahlung abgeschlossen",
    roleUpgradedPrefix: "Neue Plattformrolle zugewiesen",
    perMonthUnit: "DKK/Monat",
    pageLabel: "Seite",
    prevPageBtn: "Zurück",
    nextPageBtn: "Weiter",
    sandboxBadge: "Sandbox / Testumgebung",
  },
};

const DEFAULT_VIPPS_CONFIG: VippsConfigDto = {
  bundleSymbolicName: "com.platform.killbill.vipps-mobilepay-plugin",
  bundleVersion: "1.0.0",
  pluginName: "killbill-vipps-mobilepay",
  apiBaseUrl: "https://api.vipps.no",
  merchantName: "73N37",
  merchantCvr: "46688244",
  clinicPayoutIban: "DK5000400440116243",
  clinicVippsMsn: "700000",
  tiers: {
    THERAPIST_ACCESS: {
      productType: "THERAPIST_ACCESS",
      planName: "Therapist-adgang",
      amountDkk: 4,
      payoutIban: "DK8130000012345678",
      vippsMsn: "700101",
      glAccount: "4300",
      grantedRole: "THERAPIST",
    },
    MANAGEMENT_ACCESS: {
      productType: "MANAGEMENT_ACCESS",
      planName: "Management-adgang",
      amountDkk: 5,
      payoutIban: "DK9230000087654321",
      vippsMsn: "700202",
      glAccount: "4300",
      grantedRole: "ADMIN",
    },
  },
};

interface CheckoutPlanOption {
  readonly testId: string;
  readonly productType: "SESSION_INVOICE" | "THERAPIST_ACCESS" | "MANAGEMENT_ACCESS" | "SUBSCRIPTION" | "CLIP_CARD";
  readonly title: string;
  readonly description: string;
  readonly amountDkk: number;
  readonly priceLabel: string;
  readonly payoutIban: string;
  readonly vippsMsn: string;
  readonly glAccount: string;
  readonly clips?: number;
}

function tokenizeCardNumber(rawNumber: string, holder: string) {
  const digits = rawNumber.replace(/\D/g, "");
  DomainGuard.require(digits.length >= 12, ErrorCode.BAD_REQUEST, "Valid 12-19 digit card number is required");
  const last4 = digits.slice(-4);
  const brand = digits.startsWith("5") ? "MASTERCARD" : "VISA";
  const safeHolder = holder.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 12);
  return {
    cardToken: `tok_${brand.toLowerCase()}_${safeHolder || "card"}_${last4}`,
    cardLast4: last4,
    cardBrand: brand,
  };
}

interface VippsPaymentHubProps {
  readonly copy: FinanceCopy;
  readonly locale: SupportedUiLocale;
  readonly targetClientUuid: string;
  readonly defaultCardHolder?: string;
  readonly showTechnicalAudit: boolean;
  readonly separateProfessionalLicenses?: boolean;
  readonly vippsConfig?: VippsConfigDto;
  readonly agreements?: VippsAgreementItem[];
  readonly gitHistory?: GeneralLedgerSummaryDto['gitHistory'];
  readonly onRefresh: () => Promise<void>;
  readonly onError: (problem: ProblemDetail) => void;
  readonly onRoleUpgraded?: () => Promise<void> | void;
}

const VippsPaymentHub: React.FC<VippsPaymentHubProps> = ({
  copy,
  locale,
  targetClientUuid,
  defaultCardHolder,
  showTechnicalAudit,
  separateProfessionalLicenses = false,
  vippsConfig,
  agreements,
  gitHistory,
  onRefresh,
  onError,
  onRoleUpgraded,
}) => {
  const cfg = vippsConfig ?? DEFAULT_VIPPS_CONFIG;
  const activeAgreements = agreements ?? [];
  const therapistTier = cfg.tiers.THERAPIST_ACCESS;
  const managementTier = cfg.tiers.MANAGEMENT_ACCESS;

  const clientPlanOptions: CheckoutPlanOption[] = [
    {
      testId: "btn-checkout-session",
      productType: "SESSION_INVOICE",
      title: copy.singleSessionTitle,
      description: copy.singleSessionDesc,
      amountDkk: 2,
      priceLabel: "2 DKK",
      payoutIban: cfg.clinicPayoutIban,
      vippsMsn: cfg.clinicVippsMsn,
      glAccount: "4100",
    },
    {
      testId: "btn-checkout-subscription",
      productType: "SUBSCRIPTION",
      title: copy.subscriptionTitle,
      description: copy.subscriptionDesc,
      amountDkk: 3,
      priceLabel: `3 ${copy.perMonthUnit}`,
      payoutIban: cfg.clinicPayoutIban,
      vippsMsn: cfg.clinicVippsMsn,
      glAccount: "4200",
    },
    {
      testId: "btn-checkout-clipcard",
      productType: "CLIP_CARD",
      title: copy.clipcardTitle,
      description: copy.clipcardDesc,
      amountDkk: 3,
      priceLabel: "3 DKK",
      payoutIban: cfg.clinicPayoutIban,
      vippsMsn: cfg.clinicVippsMsn,
      glAccount: "2100",
      clips: 5,
    },
  ];

  const professionalPlanOptions: CheckoutPlanOption[] = [
    {
      testId: "btn-checkout-therapist-access",
      productType: "THERAPIST_ACCESS",
      title: copy.therapistAccessTitle,
      description: copy.therapistAccessDesc,
      amountDkk: therapistTier.amountDkk,
      priceLabel: `${therapistTier.amountDkk} ${copy.perMonthUnit}`,
      payoutIban: therapistTier.payoutIban,
      vippsMsn: therapistTier.vippsMsn,
      glAccount: therapistTier.glAccount,
    },
    {
      testId: "btn-checkout-management-access",
      productType: "MANAGEMENT_ACCESS",
      title: copy.managementAccessTitle,
      description: copy.managementAccessDesc,
      amountDkk: managementTier.amountDkk,
      priceLabel: `${managementTier.amountDkk} ${copy.perMonthUnit}`,
      payoutIban: managementTier.payoutIban,
      vippsMsn: managementTier.vippsMsn,
      glAccount: managementTier.glAccount,
    },
  ];

  const allPlanOptions = [...clientPlanOptions, ...professionalPlanOptions];

  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlanOption | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"MOBILEPAY" | "CREDIT_CARD">("MOBILEPAY");
  const [phoneNumber, setPhoneNumber] = useState("+4520123456");
  const [cardHolder, setCardHolder] = useState(defaultCardHolder || "");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("321");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<VippsCheckoutReceipt | null>(null);
  const [pendingCancelAgreementId, setPendingCancelAgreementId] = useState<string | null>(null);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        clientUuid: targetClientUuid,
        productType: selectedPlan.productType,
        planName: selectedPlan.title,
        amount: selectedPlan.amountDkk,
        currency: "DKK",
        paymentMethod,
      };
      if (selectedPlan.clips) {
        payload.clips = selectedPlan.clips;
      }
      if (paymentMethod === "MOBILEPAY") {
        payload.phoneNumber = phoneNumber.trim();
      } else {
        Object.assign(payload, tokenizeCardNumber(cardNumber, cardHolder));
      }

      const result = await requestFinanceJson<VippsCheckoutReceipt>(
        "/api/backend/finance/vipps/checkout",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      setReceipt(result);
      setSelectedPlan(null);
      await onRefresh();
      if (result.grantedRole) {
        await onRoleUpgraded?.();
      }
    } catch (err) {
      const domainErr = err as { problem?: ProblemDetail };
      onError(domainErr.problem || (err as ProblemDetail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAgreementAction = async (agreementId: string, action: "charge" | "cancel") => {
    setSubmitting(true);
    try {
      await requestFinanceJson(
        `/api/backend/finance/vipps/agreements/${encodeURIComponent(agreementId)}/${action}`,
        { method: "POST", body: "{}" }
      );
      await onRefresh();
    } catch (err) {
      onError(err as ProblemDetail);
    } finally {
      setSubmitting(false);
    }
  };

  const renderPlanCard = (option: CheckoutPlanOption) => (
    <div
      key={option.productType}
      className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="min-w-0 text-sm font-bold text-slate-900">{option.title}</h4>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-900">
            {option.priceLabel}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600">{option.description}</p>
      </div>
      <button
        type="button"
        disabled={submitting}
        data-testid={option.testId}
        onClick={() => setSelectedPlan(option)}
        className="mt-3 min-h-11 w-full rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {copy.openCheckoutBtn}
      </button>
    </div>
  );

  return (
    <div
      data-testid="vipps-payment-hub"
      className="space-y-4 rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/40 via-white to-slate-50/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900">
            {showTechnicalAudit ? copy.vippsHubHeading : copy.vippsHubClientHeading}
          </h3>
          <span
            data-testid="vipps-sandbox-badge"
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
          >
            {copy.sandboxBadge}
          </span>
        </div>
      </div>

      {receipt && (
        <div
          data-testid="vipps-checkout-receipt"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950"
        >
          <div className="font-semibold">
            {showTechnicalAudit ? copy.receiptTitle : copy.receiptClientTitle}: {receipt.planName} ({receipt.amountDkk} {receipt.currency})
          </div>
          <div className="mt-1 text-emerald-800">{receipt.maskedInstrument}</div>
          {receipt.grantedRole && (
            <div className="mt-1 font-semibold text-teal-800">
              {copy.roleUpgradedPrefix}: {receipt.grantedRole}
            </div>
          )}
          {receipt.redirectUrl && (
            <div className="mt-2">
              <a
                data-testid="vipps-redirect-link"
                href={receipt.redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
              >
                {copy.openVippsRedirectBtn}
              </a>
            </div>
          )}
          {showTechnicalAudit && (
            <details className="mt-2 text-[11px] text-emerald-900">
              <summary className="cursor-pointer font-semibold">
                {copy.technicalAuditSummary}
              </summary>
              <div className="mt-1">
                {copy.payoutLabel}: {receipt.payoutIban} ({copy.msnLabel}: {receipt.vippsMsn}) · JGit #{receipt.gitCommitHash}
              </div>
            </details>
          )}
        </div>
      )}

      {separateProfessionalLicenses ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {clientPlanOptions.map(renderPlanCard)}
          </div>
          <details
            data-testid="professional-licenses-section"
            className="rounded-xl border border-slate-200 bg-white/80 p-3.5"
          >
            <summary
              data-testid="professional-licenses-toggle"
              className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-slate-700 hover:text-teal-800"
            >
              <span>{copy.professionalLicensesSummary}</span>
              <i className="bi bi-chevron-down" aria-hidden="true" />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {professionalPlanOptions.map(renderPlanCard)}
            </div>
          </details>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {allPlanOptions.map(renderPlanCard)}
        </div>
      )}

      {activeAgreements.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {copy.agreementsHeading}
          </h4>
          <ul data-testid="vipps-agreements-list" className="space-y-2">
            {activeAgreements.map((agr) => (
              <li
                key={agr.agreementId}
                data-testid={`vipps-agreement-item-${agr.agreementId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold text-slate-900">
                    {agr.planName} — {agr.amountDkk} {agr.currency} · {agr.maskedInstrument}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      {localizeFinanceStatus(agr.status, locale)}
                    </span>
                    {showTechnicalAudit && (
                      <span className="font-mono text-slate-500">
                        {agr.agreementId} · {copy.payoutLabel}: {agr.payoutIban} · {copy.msnLabel}: {agr.vippsMsn}
                      </span>
                    )}
                  </div>
                </div>
                {agr.status === "ACTIVE" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      data-testid={`btn-charge-agreement-${agr.agreementId}`}
                      onClick={() => void handleAgreementAction(agr.agreementId, "charge")}
                      className="min-h-11 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      {copy.chargeNextBtn}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      data-testid={`btn-cancel-agreement-${agr.agreementId}`}
                      onClick={() => setPendingCancelAgreementId(agr.agreementId)}
                      className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      {copy.cancelAgreementBtn}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showTechnicalAudit && (
        <details
          data-testid="technical-audit-details"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
        >
          <summary
            data-testid="technical-audit-summary"
            className="flex min-h-11 cursor-pointer items-center justify-between font-semibold text-slate-800"
          >
            <span>
              {copy.technicalAuditSummary} · {copy.vippsHubBadge} ({cfg.bundleSymbolicName})
            </span>
            <i className="bi bi-chevron-down" aria-hidden="true" />
          </summary>
          <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allPlanOptions.map((option) => (
                <div
                  key={option.productType}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-600"
                >
                  <div className="font-sans font-semibold text-slate-800">{option.title}</div>
                  <div>{copy.payoutLabel}: {option.payoutIban}</div>
                  <div>{copy.msnLabel}: {option.vippsMsn} · GL {option.glAccount}</div>
                </div>
              ))}
            </div>
            {Array.isArray(gitHistory) && gitHistory.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="font-semibold text-slate-800">{copy.gitHistoryHeading}</div>
                <ul className="space-y-1" data-testid="provider-finance-git-history">
                  {gitHistory.map((entry) => (
                    <li
                      key={entry.commitHash}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700"
                    >
                      <span className="font-mono text-teal-800">
                        {entry.shortHash || entry.commitHash}
                      </span>{' '}
                      — {entry.message} ({entry.authorName})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {selectedPlan && (
        <div
          data-testid="vipps-checkout-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <form
            onSubmit={handleCheckoutSubmit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="min-w-0 text-base font-bold text-slate-900">
                {copy.checkoutModalTitle}: {selectedPlan.title}
              </h4>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                {selectedPlan.priceLabel}
              </span>
            </div>

            {showTechnicalAudit && (
              <details
                data-testid="checkout-payout-routing"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
              >
                <summary className="cursor-pointer font-semibold text-slate-800">
                  {copy.technicalAuditSummary}
                </summary>
                <div className="mt-1.5 space-y-0.5">
                  <div>{copy.payoutLabel}: <strong className="font-mono">{selectedPlan.payoutIban}</strong></div>
                  <div>{copy.msnLabel}: <strong className="font-mono">{selectedPlan.vippsMsn}</strong> · Fineract GL {selectedPlan.glAccount}</div>
                </div>
              </details>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">{copy.paymentMethodLabel}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="select-method-mobilepay"
                  onClick={() => setPaymentMethod("MOBILEPAY")}
                  className={
                    paymentMethod === "MOBILEPAY"
                      ? "min-h-11 rounded-xl border-2 border-teal-700 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900"
                      : "min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  }
                >
                  {copy.methodMobilePayLabel}
                </button>
                <button
                  type="button"
                  data-testid="select-method-card"
                  onClick={() => setPaymentMethod("CREDIT_CARD")}
                  className={
                    paymentMethod === "CREDIT_CARD"
                      ? "min-h-11 rounded-xl border-2 border-teal-700 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900"
                      : "min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  }
                >
                  {copy.methodCardLabel}
                </button>
              </div>
            </div>

            {paymentMethod === "MOBILEPAY" ? (
              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-slate-700">{copy.mobilePayPhoneLabel}</span>
                <input
                  data-testid="input-vipps-phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>
            ) : (
              <div className="space-y-2.5 text-xs">
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">{copy.cardHolderLabel}</span>
                  <input
                    data-testid="input-card-holder"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">{copy.cardNumberLabel}</span>
                  <input
                    data-testid="input-card-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">{copy.cardExpiryLabel}</span>
                    <input
                      data-testid="input-card-expiry"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">{copy.cardCvcLabel}</span>
                    <input
                      data-testid="input-card-cvc"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                </div>
                <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                  {copy.pciNotice}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="btn-close-vipps-checkout"
                onClick={() => setSelectedPlan(null)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copy.cancelModalBtn}
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="btn-confirm-vipps-checkout"
                className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {copy.confirmPaymentBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmActionDialog
        open={pendingCancelAgreementId !== null}
        tone="danger"
        title={copy.cancelAgreementConfirmTitle}
        description={copy.cancelAgreementConfirmDesc}
        confirmLabel={copy.cancelAgreementBtn}
        cancelLabel={copy.cancelModalBtn}
        onConfirm={async () => {
          const targetId = pendingCancelAgreementId;
          setPendingCancelAgreementId(null);
          if (targetId) {
            await handleAgreementAction(targetId, "cancel");
          }
        }}
        onCancel={() => setPendingCancelAgreementId(null)}
      />
    </div>
  );
};

export interface ClientFinancePickerOption {
  readonly id: string;
  readonly userId?: string | null;
  readonly fullName: string;
  readonly email?: string | null;
}

/**
 * Filtrerer `/api/backend/clinic/clients` til økonomi-klientvælgeren:
 * udelader ugyldige rækker, brugeren selv, lækkede behandlere (`Dr. ...` / `*_terapeut`)
 * og dubletter på både bruger-ID og normaliseret navn.
 */
export function filterFinanceClientOptions(
  rows: unknown,
  excludeUserId?: string | null,
  excludeEmail?: string | null
): ClientFinancePickerOption[] {
  if (!Array.isArray(rows)) return [];
  const excludedId = excludeUserId?.trim() || "";
  const excludedMail = excludeEmail?.trim().toLowerCase() || "";
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: ClientFinancePickerOption[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as {
      id?: unknown;
      userId?: unknown;
      fullName?: unknown;
      email?: unknown;
    };
    if (typeof candidate.id !== "string" || typeof candidate.fullName !== "string") continue;
    const fullName = candidate.fullName.trim();
    if (!fullName) continue;
    if (/^dr\.\s/i.test(fullName) || /_terapeut/i.test(fullName)) continue;

    const rawUserId = typeof candidate.userId === "string" ? candidate.userId.trim() : "";
    const effectiveId = rawUserId || candidate.id.trim();
    if (!effectiveId) continue;
    if (excludedId && effectiveId === excludedId) continue;

    const email = typeof candidate.email === "string" ? candidate.email.trim() : "";
    if (excludedMail && email.toLowerCase() === excludedMail) continue;

    const normalizedName = fullName.toLowerCase();
    if (seenIds.has(effectiveId) || seenNames.has(normalizedName)) continue;

    seenIds.add(effectiveId);
    seenNames.add(normalizedName);
    result.push({
      id: candidate.id,
      userId: rawUserId || null,
      fullName,
      email: email || undefined,
    });
  }
  return result;
}

function renderPaginationControls(
  page: number,
  totalPages: number,
  onPageChange: (nextPage: number) => void,
  copy: FinanceCopy,
  testIdPrefix: string
) {
  if (totalPages <= 1) return null;
  return (
    <div
      data-testid={`${testIdPrefix}-pagination`}
      className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs"
    >
      <span className="text-slate-600">
        {copy.pageLabel} {page} / {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={`${testIdPrefix}-prev-page`}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {copy.prevPageBtn}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-next-page`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {copy.nextPageBtn}
        </button>
      </div>
    </div>
  );
}

const ClientFinanceOverviewView: React.FC<{
  userId: string;
  userName?: string;
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({ userId, userName, onRoleUpgraded }) => {
  const locale = useUiLocale();
  const copy = FINANCE_COPY[locale];
  const [overview, setOverview] = useState<ClientFinanceOverviewDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<ProblemDetail | null>(null);
  const [invoicePage, setInvoicePage] = useState<number>(1);

  const loadOverview = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await requestFinanceJson<ClientFinanceOverviewDto>(
        `/api/backend/finance/client/${encodeURIComponent(userId)}/overview`
      );
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err as ProblemDetail);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const runClientFinanceAction = async (url: string, payload: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await requestFinanceJson(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadOverview();
    } catch (err) {
      setError(err as ProblemDetail);
    } finally {
      setSubmitting(false);
    }
  };

  const remainingClips = overview?.prepaidSavings?.remainingClips ?? 0;
  const savingsBalance = overview?.prepaidSavings?.balance ?? 0;
  const savingsCurrency = overview?.prepaidSavings?.currency || 'DKK';
  const allClientInvoices = Array.isArray(overview?.invoices) ? overview.invoices : [];
  const totalInvoicePages = Math.max(
    1,
    Math.ceil(allClientInvoices.length / FINANCE_INVOICES_PER_PAGE)
  );
  const pagedClientInvoices = allClientInvoices.slice(
    (invoicePage - 1) * FINANCE_INVOICES_PER_PAGE,
    invoicePage * FINANCE_INVOICES_PER_PAGE
  );

  return (
    <section
      data-testid="finance-feature-view"
      data-finance-mode="client"
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="bi bi-wallet2" aria-hidden="true" />
            {copy.clientBadge}
          </span>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
            {copy.clientHeading}
          </h2>
        </div>
      </div>

      <ProblemAlert problem={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.clipCardBalanceLabel}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900" data-testid="client-clips-balance">
            {remainingClips} {copy.clipsUnit}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {copy.balancePrefix}: {savingsBalance} {savingsCurrency}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.activeSubscriptionsLabel}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900" data-testid="client-subscriptions-count">
            {overview?.subscriptions?.length ?? 0}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {copy.monthlyCareLabel}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.myInvoicesLabel}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900" data-testid="client-invoices-count">
            {allClientInvoices.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {copy.invoicesSubLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          disabled={submitting}
          data-testid="btn-buy-clipcard"
          onClick={() =>
            void runClientFinanceAction('/api/backend/finance/prepaid/topup', {
              clientUuid: userId,
              clips: 5,
              amount: 3,
              currency: 'DKK',
            })
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          <i className="bi bi-ticket-perforated" aria-hidden="true" />
          {copy.buyClipcardBtn}
        </button>

        <button
          type="button"
          disabled={submitting || remainingClips <= 0}
          data-testid="btn-consume-clip"
          onClick={() =>
            void runClientFinanceAction('/api/backend/finance/prepaid/consume', {
              clientUuid: userId,
              clips: 1,
            })
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
        >
          {copy.consumeClipBtn}
        </button>

        <button
          type="button"
          disabled={submitting}
          data-testid="btn-create-subscription"
          onClick={() =>
            void runClientFinanceAction('/api/backend/finance/subscriptions', {
              clientUuid: userId,
              planName: 'monthly-therapy-care',
              monthlyAmount: 3,
              currency: 'DKK',
            })
          }
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {copy.activateSubscriptionBtn}
        </button>
      </div>

      <VippsPaymentHub
        copy={copy}
        locale={locale}
        targetClientUuid={userId}
        defaultCardHolder={userName}
        showTechnicalAudit={false}
        separateProfessionalLicenses={true}
        vippsConfig={overview?.vippsConfig}
        agreements={overview?.vippsAgreements}
        onRefresh={loadOverview}
        onError={setError}
        onRoleUpgraded={onRoleUpgraded}
      />

      {loading && <p data-testid="loading-indicator" className="text-sm text-slate-500">{copy.loadingText}</p>}

      {Array.isArray(overview?.installmentPlans) && overview.installmentPlans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">{copy.installmentPlansHeading}</h3>
          <ul className="space-y-2" data-testid="client-loans-list">
            {overview.installmentPlans.map((loan) => (
              <li
                key={loan.loanId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <strong>{loan.description}</strong> — {copy.remainingDebtLabel}:{' '}
                  {loan.remainingPrincipal} {loan.currency} ({loan.paidInstallments}/
                  {loan.installmentsCount} {copy.installmentsUnit})
                </div>
                {loan.status === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={submitting}
                    data-testid={`btn-repay-loan-${loan.loanId}`}
                    onClick={() =>
                      void runClientFinanceAction(
                        `/api/backend/finance/installment-plans/${encodeURIComponent(loan.loanId)}/repay`,
                        {}
                      )
                    }
                    className="min-h-11 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {copy.payNextInstallmentBtn}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">{copy.invoiceOverviewHeading}</h3>
        {overview && allClientInvoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {copy.emptyInvoicesText}
          </p>
        ) : (
          <>
            <ul data-testid="client-invoice-list" className="space-y-2">
              {pagedClientInvoices.map((inv) => {
                const invoiceId = inv.id || inv.invoiceNumber;
                return (
                  <li
                    key={invoiceId}
                    data-testid={`client-invoice-item-${invoiceId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  >
                    <span>
                      <strong>{inv.description}</strong> — {inv.amount} {inv.currency}
                    </span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {localizeFinanceStatus(inv.status, locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {renderPaginationControls(
              invoicePage,
              totalInvoicePages,
              setInvoicePage,
              copy,
              'client-invoice'
            )}
          </>
        )}
      </div>
    </section>
  );
};

const ProviderFinanceLedgerView: React.FC<{
  isAuthenticated: boolean;
  providerUserId: string;
  providerName?: string;
  providerEmail?: string;
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({
  isAuthenticated,
  providerUserId,
  providerName,
  providerEmail,
  onRoleUpgraded,
}) => {
  const locale = useUiLocale();
  const copy = FINANCE_COPY[locale];
  const { items: invoices, loading, error, createItem, deleteItem, fetchAll, clearError, setError } =
    useBaseCrud(financeService);

  const [clientOptions, setClientOptions] = useState<ClientFinancePickerOption[]>([]);
  const [useManualClientId, setUseManualClientId] = useState(false);
  const [clientUuid, setClientUuid] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('2');
  const [currency, setCurrency] = useState('DKK');
  const [ledger, setLedger] = useState<GeneralLedgerSummaryDto | null>(null);
  const [invoicePage, setInvoicePage] = useState<number>(1);
  const [pendingAction, setPendingAction] = useState<{
    type: 'delete' | 'refund';
    invoiceId: string;
  } | null>(null);

  const loadLedger = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    try {
      const summary = await requestFinanceJson<GeneralLedgerSummaryDto>(
        '/api/backend/finance/ledger/summary'
      );
      setLedger(summary);
    } catch (err) {
      setError(err as ProblemDetail);
    }
  }, [isAuthenticated, setError]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    fetch('/api/backend/clinic/clients')
      .then((res) => (res?.ok ? res.json() : []))
      .then((rows) => {
        if (!active) return;
        setClientOptions(
          filterFinanceClientOptions(rows, providerUserId, providerEmail)
        );
      })
      .catch(() => {
        /* Fallback to manual client ID input when clinic clients endpoint is unavailable */
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, providerUserId, providerEmail]);

  const totalInvoicePages = Math.max(
    1,
    Math.ceil(invoices.length / FINANCE_INVOICES_PER_PAGE)
  );
  const pagedInvoices = invoices.slice(
    (invoicePage - 1) * FINANCE_INVOICES_PER_PAGE,
    invoicePage * FINANCE_INVOICES_PER_PAGE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    const created = await createItem({
      clientUuid,
      description,
      amount: numericAmount,
      amountGrossDkk: numericAmount,
      currency,
      status: 'PAID',
    });
    if (created) {
      setClientUuid('');
      setDescription('');
      setAmount('2');
      await loadLedger();
    }
  };

  const handleRefund = async (invoiceId: string) => {
    try {
      await requestFinanceJson(
        `/api/backend/finance/invoices/${encodeURIComponent(invoiceId)}/refund`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: copy.refundReasonText }),
        }
      );
      await fetchAll();
      await loadLedger();
    } catch (err) {
      setError(err as ProblemDetail);
    }
  };

  const handleCreateLoan = async () => {
    try {
      DomainGuard.require(
        clientUuid.trim().length > 0,
        ErrorCode.BAD_REQUEST,
        'Missing required UUID field: clientUuid'
      );
      await requestFinanceJson('/api/backend/finance/installment-plans', {
        method: 'POST',
        body: JSON.stringify({
          clientUuid,
          description: description || copy.defaultLoanDescription,
          principalAmount: Number(amount),
          installmentsCount: 3,
          currency,
        }),
      });
      await loadLedger();
    } catch (err) {
      const domainErr = err as { problem?: ProblemDetail };
      setError(domainErr.problem || (err as ProblemDetail));
    }
  };

  return (
    <section
      data-testid="finance-feature-view"
      data-finance-mode="provider"
      className="space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="bi bi-cash-stack" aria-hidden="true" />
            {copy.providerBadge}
          </span>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
            {copy.providerHeading}
          </h2>
        </div>
      </div>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        data-testid="finance-form"
        className="grid grid-cols-1 items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="space-y-1">
          {clientOptions.length > 0 && !useManualClientId ? (
            <>
              <label
                htmlFor="finance-client-select"
                className="block text-xs font-semibold text-slate-700"
              >
                {copy.clientPickerLabel}
              </label>
              <select
                id="finance-client-select"
                data-testid="select-finance-client"
                value={clientUuid}
                onChange={(e) => {
                  if (e.target.value === '__manual__') {
                    setUseManualClientId(true);
                    setClientUuid('');
                  } else {
                    setClientUuid(e.target.value);
                  }
                }}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">{copy.selectClientPlaceholder}</option>
                {clientOptions.map((c) => {
                  const val = c.userId || c.id;
                  const label = c.email ? `${c.fullName} (${c.email})` : c.fullName;
                  return (
                    <option key={c.id} value={val}>
                      {label}
                    </option>
                  );
                })}
                <option value="__manual__">{copy.manualClientOption}</option>
              </select>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="finance-client-uuid-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  {copy.clientUuidLabel}
                </label>
                {clientOptions.length > 0 && (
                  <button
                    type="button"
                    data-testid="btn-finance-back-to-clients"
                    onClick={() => setUseManualClientId(false)}
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    {copy.backToClientListBtn}
                  </button>
                )}
              </div>
              <input
                id="finance-client-uuid-input"
                data-testid="input-clientUuid"
                placeholder={copy.clientUuidPlaceholder}
                value={clientUuid}
                onChange={(e) => setClientUuid(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </>
          )}
        </div>

        <label className="block space-y-1">
          <span className="block text-xs font-semibold text-slate-700">{copy.descriptionLabel}</span>
          <input
            data-testid="input-description"
            placeholder={copy.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs font-semibold text-slate-700">{copy.amountLabel}</span>
          <input
            data-testid="input-amount"
            type="number"
            placeholder={copy.amountPlaceholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs font-semibold text-slate-700">{copy.currencyLabel}</span>
          <input
            data-testid="input-currency"
            placeholder={copy.currencyPlaceholder}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            data-testid="submit-invoice"
            className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.createInvoiceBtn}
          </button>
          {isAuthenticated && (
            <button
              type="button"
              data-testid="btn-create-loan"
              onClick={() => void handleCreateLoan()}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {copy.createLoanBtn}
            </button>
          )}
        </div>
      </form>

      {ledger && Array.isArray(ledger.chartOfAccounts) && (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="ledger-accounts-grid"
        >
          {ledger.chartOfAccounts.map((acc) => {
            const accountCode = acc.code || acc.glCode;
            const accountLabel = localizeGlAccountName(accountCode, acc.name, locale);
            return (
              <div
                key={accountCode}
                className="min-w-0 break-words rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs"
              >
                <div className="font-mono font-semibold text-teal-800">
                  {copy.accountPrefix} {accountCode}
                </div>
                {accountLabel && (
                  <div className="mt-0.5 text-slate-700">{accountLabel}</div>
                )}
                <div className="mt-1 text-base font-bold text-slate-900">
                  {acc.balance} DKK
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAuthenticated && (
        <VippsPaymentHub
          copy={copy}
          locale={locale}
          targetClientUuid={providerUserId}
          defaultCardHolder={providerName}
          showTechnicalAudit={true}
          separateProfessionalLicenses={false}
          vippsConfig={ledger?.vippsConfig}
          agreements={ledger?.vippsAgreements}
          gitHistory={ledger?.gitHistory}
          onRefresh={async () => {
            await fetchAll();
            await loadLedger();
          }}
          onError={setError}
          onRoleUpgraded={onRoleUpgraded}
        />
      )}

      {loading ? (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">{copy.loadingText}</p>
      ) : (
        <>
          <ul data-testid="invoice-list" className="space-y-2">
            {pagedInvoices.map((inv) => (
              <li
                key={inv.id}
                data-testid={`invoice-item-${inv.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    <strong>{inv.description || inv.invoiceNumber || inv.id}</strong> —{' '}
                    {inv.amount ?? inv.amountGrossDkk} {inv.currency}
                  </span>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {localizeFinanceStatus(inv.status, locale)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isAuthenticated && inv.id && inv.status !== 'REFUNDED' && (
                    <button
                      type="button"
                      data-testid={`refund-invoice-${inv.id}`}
                      onClick={() =>
                        setPendingAction({ type: 'refund', invoiceId: inv.id! })
                      }
                      className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {copy.refundBtn}
                    </button>
                  )}
                  {inv.id && (
                    <button
                      type="button"
                      data-testid={`delete-invoice-${inv.id}`}
                      onClick={() =>
                        setPendingAction({ type: 'delete', invoiceId: inv.id! })
                      }
                      className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      {copy.deleteBtn}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {renderPaginationControls(
            invoicePage,
            totalInvoicePages,
            setInvoicePage,
            copy,
            'provider-invoice'
          )}
        </>
      )}

      <ConfirmActionDialog
        open={pendingAction !== null}
        tone={pendingAction?.type === 'refund' ? 'warning' : 'danger'}
        title={
          pendingAction?.type === 'refund'
            ? copy.refundConfirmTitle
            : copy.deleteConfirmTitle
        }
        description={
          pendingAction?.type === 'refund'
            ? copy.refundConfirmDesc
            : copy.deleteConfirmDesc
        }
        confirmLabel={
          pendingAction?.type === 'refund' ? copy.refundBtn : copy.deleteBtn
        }
        cancelLabel={copy.cancelModalBtn}
        onConfirm={async () => {
          const action = pendingAction;
          setPendingAction(null);
          if (!action) return;
          if (action.type === 'refund') {
            await handleRefund(action.invoiceId);
          } else {
            await deleteItem(action.invoiceId);
          }
        }}
        onCancel={() => setPendingAction(null)}
      />
    </section>
  );
};

export const FinanceFeatureView: React.FC<{
  portalMode?: 'client' | 'provider';
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({ portalMode, onRoleUpgraded } = {}) => {
  const auth = useOptionalAuth();
  const userId = auth?.user.id || '';
  const userName = auth?.user.name || '';
  const userEmail = auth?.user.email || '';
  const isClient =
    portalMode === 'client' ||
    (portalMode !== 'provider' && Boolean(auth && !auth.hasRole('PROVIDER', 'MANAGEMENT')));
  if (isClient) {
    return (
      <ClientFinanceOverviewView
        userId={userId}
        userName={userName}
        onRoleUpgraded={onRoleUpgraded}
      />
    );
  }
  return (
    <ProviderFinanceLedgerView
      isAuthenticated={Boolean(auth)}
      providerUserId={userId}
      providerName={userName}
      providerEmail={userEmail}
      onRoleUpgraded={onRoleUpgraded}
    />
  );
};
