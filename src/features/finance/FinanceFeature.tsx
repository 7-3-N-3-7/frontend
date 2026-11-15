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
import { ProblemAlert, useBaseCrud, useOptionalAuth } from '../../core/baseUiCore';
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
  clientUuidPlaceholder: string;
  descriptionPlaceholder: string;
  amountPlaceholder: string;
  currencyPlaceholder: string;
  createInvoiceBtn: string;
  createLoanBtn: string;
  defaultLoanDescription: string;
  refundReasonText: string;
  accountPrefix: string;
  refundBtn: string;
  deleteBtn: string;
  vippsHubHeading: string;
  vippsHubBadge: string;
  therapistAccessTitle: string;
  therapistAccessDesc: string;
  managementAccessTitle: string;
  managementAccessDesc: string;
  subscriptionTitle: string;
  subscriptionDesc: string;
  clipcardTitle: string;
  clipcardDesc: string;
  openCheckoutBtn: string;
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
  receiptTitle: string;
  roleUpgradedPrefix: string;
  perMonthUnit: string;
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
    invoicesSubLabel: "Kill Bill & Fineract bilag",
    buyClipcardBtn: "Køb 5-klips klippekort (5.000 DKK)",
    consumeClipBtn: "Indløs 1 klip",
    activateSubscriptionBtn: "Aktivér månedsabonnement (499 DKK/md)",
    loadingText: "Indlæser...",
    installmentPlansHeading: "Afdragsordninger",
    remainingDebtLabel: "Restgæld",
    installmentsUnit: "rater",
    payNextInstallmentBtn: "Betal næste afdrag",
    invoiceOverviewHeading: "Fakturaoversigt",
    emptyInvoicesText: "Ingen registrerede fakturaer endnu.",
    gitHistoryHeading: "JGit Bilagshistorik",
    providerBadge: "Behandler Hovedbog & Fakturering",
    providerHeading: "Klinik Økonomi, Kill Bill & Fineract Hovedbog",
    clientUuidPlaceholder: "Klient UUID",
    descriptionPlaceholder: "Fakturabeskrivelse",
    amountPlaceholder: "Beløb",
    currencyPlaceholder: "Valuta (f.eks. DKK)",
    createInvoiceBtn: "Opret Faktura",
    createLoanBtn: "Afdragsordning (3 rater)",
    defaultLoanDescription: "Traumebehandlingsforløb",
    refundReasonText: "Kreditnota udstedt af behandler",
    accountPrefix: "Konto",
    refundBtn: "Refunder",
    deleteBtn: "Slet",
    vippsHubHeading: "Vipps MobilePay & Kreditkort Checkout (Kill Bill OSGi Plugin)",
    vippsHubBadge: "OSGi Bundt · Docker Secrets Routing",
    therapistAccessTitle: "Therapist-adgang",
    therapistAccessDesc: "Låser behandlerportal, kalender & hovedbog op (GL 4300).",
    managementAccessTitle: "Management-adgang",
    managementAccessDesc: "Fuld administrationsadgang til klinik, økonomi & brugere (GL 4300).",
    subscriptionTitle: "Månedsabonnement",
    subscriptionDesc: "Automatisk Vipps MobilePay Recurring v3 aftale (GL 4200).",
    clipcardTitle: "5-turs Klippekort",
    clipcardDesc: "Forudbetalt klippekort via Vipps ePayment / Kort (GL 2100).",
    openCheckoutBtn: "Betal via Checkout",
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
    pciNotice: "PCI-beskyttet: Råt kortnummer sendes aldrig til backend eller JGit — kun token & sidste 4 cifre.",
    confirmPaymentBtn: "Godkend betaling",
    cancelModalBtn: "Annuller",
    agreementsHeading: "Aktive Vipps MobilePay Recurring-aftaler",
    chargeNextBtn: "Træk næste rate",
    cancelAgreementBtn: "Opsig aftale",
    receiptTitle: "Betaling gennemført via Kill Bill OSGi & Vipps MobilePay",
    roleUpgradedPrefix: "Ny platformrolle tildelt",
    perMonthUnit: "DKK/md",
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
    invoicesSubLabel: "Kill Bill & Fineract records",
    buyClipcardBtn: "Buy 5-session pass (5,000 DKK)",
    consumeClipBtn: "Redeem 1 session",
    activateSubscriptionBtn: "Activate monthly plan (499 DKK/mo)",
    loadingText: "Loading...",
    installmentPlansHeading: "Installment Plans",
    remainingDebtLabel: "Remaining balance",
    installmentsUnit: "installments",
    payNextInstallmentBtn: "Pay next installment",
    invoiceOverviewHeading: "Invoice Overview",
    emptyInvoicesText: "No recorded invoices yet.",
    gitHistoryHeading: "JGit Ledger History",
    providerBadge: "Provider General Ledger & Billing",
    providerHeading: "Clinic Finance, Kill Bill & Fineract Ledger",
    clientUuidPlaceholder: "Client UUID",
    descriptionPlaceholder: "Invoice description",
    amountPlaceholder: "Amount",
    currencyPlaceholder: "Currency (e.g. DKK)",
    createInvoiceBtn: "Create Invoice",
    createLoanBtn: "Installment plan (3 installments)",
    defaultLoanDescription: "Trauma care program",
    refundReasonText: "Credit note issued by provider",
    accountPrefix: "Account",
    refundBtn: "Refund",
    deleteBtn: "Delete",
    vippsHubHeading: "Vipps MobilePay & Credit Card Checkout (Kill Bill OSGi Plugin)",
    vippsHubBadge: "OSGi Bundle · Docker Secrets Routing",
    therapistAccessTitle: "Therapist Access",
    therapistAccessDesc: "Unlocks therapist workspace, schedule & general ledger (GL 4300).",
    managementAccessTitle: "Management Access",
    managementAccessDesc: "Full management access across clinic operations & finance (GL 4300).",
    subscriptionTitle: "Monthly Subscription",
    subscriptionDesc: "Recurring Vipps MobilePay v3 mandate (GL 4200).",
    clipcardTitle: "5-Session Clip Card",
    clipcardDesc: "Prepaid package via Vipps ePayment / Card (GL 2100).",
    openCheckoutBtn: "Pay via Checkout",
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
    agreementsHeading: "Active Vipps MobilePay Recurring Agreements",
    chargeNextBtn: "Charge Next Period",
    cancelAgreementBtn: "Cancel Agreement",
    receiptTitle: "Payment processed via Kill Bill OSGi & Vipps MobilePay",
    roleUpgradedPrefix: "New platform role granted",
    perMonthUnit: "DKK/mo",
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
    invoicesSubLabel: "Pièces Kill Bill & Fineract",
    buyClipcardBtn: "Acheter forfait 5 séances (5 000 DKK)",
    consumeClipBtn: "Utiliser 1 séance",
    activateSubscriptionBtn: "Activer l'abonnement mensuel (499 DKK/mois)",
    loadingText: "Chargement...",
    installmentPlansHeading: "Plans de Paiement Échelonné",
    remainingDebtLabel: "Solde restant",
    installmentsUnit: "mensualités",
    payNextInstallmentBtn: "Payer la prochaine échéance",
    invoiceOverviewHeading: "Aperçu des Factures",
    emptyInvoicesText: "Aucune facture enregistrée pour le moment.",
    gitHistoryHeading: "Historique Comptable JGit",
    providerBadge: "Grand Livre & Facturation Praticien",
    providerHeading: "Finances Cliniques, Kill Bill & Grand Livre Fineract",
    clientUuidPlaceholder: "UUID Client",
    descriptionPlaceholder: "Libellé de facture",
    amountPlaceholder: "Montant",
    currencyPlaceholder: "Devise (ex. DKK)",
    createInvoiceBtn: "Créer une Facture",
    createLoanBtn: "Plan en 3 fois",
    defaultLoanDescription: "Parcours de soins psychotrauma",
    refundReasonText: "Avoir émis par le praticien",
    accountPrefix: "Compte",
    refundBtn: "Rembourser",
    deleteBtn: "Supprimer",
    vippsHubHeading: "Paiement Vipps MobilePay & Carte Bancaire (Plugin OSGi Kill Bill)",
    vippsHubBadge: "Bundle OSGi · Routage Docker Secrets",
    therapistAccessTitle: "Accès Thérapeute",
    therapistAccessDesc: "Débloque l'espace praticien, l'agenda et le grand livre (GL 4300).",
    managementAccessTitle: "Accès Management",
    managementAccessDesc: "Accès complet administration clinique & finances (GL 4300).",
    subscriptionTitle: "Abonnement Mensuel",
    subscriptionDesc: "Mandat récurrent Vipps MobilePay v3 (GL 4200).",
    clipcardTitle: "Forfait 5 Séances",
    clipcardDesc: "Forfait prépayé via Vipps ePayment / Carte (GL 2100).",
    openCheckoutBtn: "Payer par Checkout",
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
    agreementsHeading: "Mandats récurrents Vipps MobilePay actifs",
    chargeNextBtn: "Prélever l'échéance",
    cancelAgreementBtn: "Résilier le mandat",
    receiptTitle: "Paiement traité via Kill Bill OSGi & Vipps MobilePay",
    roleUpgradedPrefix: "Nouveau rôle attribué",
    perMonthUnit: "DKK/mois",
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
    invoicesSubLabel: "Comprobantes Kill Bill & Fineract",
    buyClipcardBtn: "Comprar bono de 5 sesiones (5.000 DKK)",
    consumeClipBtn: "Canjear 1 sesión",
    activateSubscriptionBtn: "Activar suscripción mensual (499 DKK/mes)",
    loadingText: "Cargando...",
    installmentPlansHeading: "Planes de Pago a Plazos",
    remainingDebtLabel: "Saldo pendiente",
    installmentsUnit: "cuotas",
    payNextInstallmentBtn: "Pagar siguiente cuota",
    invoiceOverviewHeading: "Resumen de Facturas",
    emptyInvoicesText: "Aún no hay facturas registradas.",
    gitHistoryHeading: "Historial Contable JGit",
    providerBadge: "Libro Mayor y Facturación del Terapeuta",
    providerHeading: "Finanzas Clínicas, Kill Bill y Libro Mayor Fineract",
    clientUuidPlaceholder: "UUID del cliente",
    descriptionPlaceholder: "Descripción de factura",
    amountPlaceholder: "Importe",
    currencyPlaceholder: "Moneda (ej. DKK)",
    createInvoiceBtn: "Crear Factura",
    createLoanBtn: "Pago a plazos (3 cuotas)",
    defaultLoanDescription: "Programa de atención al trauma",
    refundReasonText: "Nota de abono emitida por el terapeuta",
    accountPrefix: "Cuenta",
    refundBtn: "Reembolsar",
    deleteBtn: "Eliminar",
    vippsHubHeading: "Checkout Vipps MobilePay y Tarjeta (Plugin OSGi Kill Bill)",
    vippsHubBadge: "Bundle OSGi · Enrutamiento Docker Secrets",
    therapistAccessTitle: "Acceso Terapeuta",
    therapistAccessDesc: "Desbloquea agenda clínica y libro mayor (GL 4300).",
    managementAccessTitle: "Acceso Dirección",
    managementAccessDesc: "Acceso completo de gestión clínica y financiera (GL 4300).",
    subscriptionTitle: "Suscripción Mensual",
    subscriptionDesc: "Mandato recurrente Vipps MobilePay v3 (GL 4200).",
    clipcardTitle: "Bono de 5 Sesiones",
    clipcardDesc: "Paquete prepago vía Vipps ePayment / Tarjeta (GL 2100).",
    openCheckoutBtn: "Pagar en Checkout",
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
    agreementsHeading: "Acuerdos recurrentes activos de Vipps MobilePay",
    chargeNextBtn: "Cobrar siguiente cuota",
    cancelAgreementBtn: "Cancelar acuerdo",
    receiptTitle: "Pago procesado vía Kill Bill OSGi y Vipps MobilePay",
    roleUpgradedPrefix: "Nuevo rol concedido",
    perMonthUnit: "DKK/mes",
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
    invoicesSubLabel: "Kill Bill & Fineract Belege",
    buyClipcardBtn: "5er-Sitzungspaket kaufen (5.000 DKK)",
    consumeClipBtn: "1 Sitzung einlösen",
    activateSubscriptionBtn: "Monatsabo aktivieren (499 DKK/Monat)",
    loadingText: "Wird geladen...",
    installmentPlansHeading: "Ratenzahlungspläne",
    remainingDebtLabel: "Restbetrag",
    installmentsUnit: "Raten",
    payNextInstallmentBtn: "Nächste Rate zahlen",
    invoiceOverviewHeading: "Rechnungsübersicht",
    emptyInvoicesText: "Noch keine Rechnungen erfasst.",
    gitHistoryHeading: "JGit Belegverlauf",
    providerBadge: "Therapeuten-Hauptbuch & Abrechnung",
    providerHeading: "Klinikfinanzen, Kill Bill & Fineract Hauptbuch",
    clientUuidPlaceholder: "Klient UUID",
    descriptionPlaceholder: "Rechnungsbeschreibung",
    amountPlaceholder: "Betrag",
    currencyPlaceholder: "Währung (z. B. DKK)",
    createInvoiceBtn: "Rechnung erstellen",
    createLoanBtn: "Ratenzahlung (3 Raten)",
    defaultLoanDescription: "Traumatherapie-Verlauf",
    refundReasonText: "Gutschrift durch Therapeut ausgestellt",
    accountPrefix: "Konto",
    refundBtn: "Erstatten",
    deleteBtn: "Löschen",
    vippsHubHeading: "Vipps MobilePay & Kreditkarten-Checkout (Kill Bill OSGi Plugin)",
    vippsHubBadge: "OSGi-Bundle · Docker-Secrets-Routing",
    therapistAccessTitle: "Therapeuten-Zugang",
    therapistAccessDesc: "Schaltet Therapeutenportal, Kalender & Hauptbuch frei (GL 4300).",
    managementAccessTitle: "Management-Zugang",
    managementAccessDesc: "Vollzugriff auf Klinikleitung, Finanzen & Benutzer (GL 4300).",
    subscriptionTitle: "Monatsabonnement",
    subscriptionDesc: "Wiederkehrendes Vipps MobilePay v3 Mandat (GL 4200).",
    clipcardTitle: "5er-Sitzungspaket",
    clipcardDesc: "Vorausbezahltes Paket via Vipps ePayment / Karte (GL 2100).",
    openCheckoutBtn: "Über Checkout zahlen",
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
    agreementsHeading: "Aktive Vipps MobilePay Recurring-Vereinbarungen",
    chargeNextBtn: "Nächste Rate einziehen",
    cancelAgreementBtn: "Vereinbarung kündigen",
    receiptTitle: "Zahlung über Kill Bill OSGi & Vipps MobilePay ausgeführt",
    roleUpgradedPrefix: "Neue Plattformrolle zugewiesen",
    perMonthUnit: "DKK/Monat",
  },
};

const DEFAULT_VIPPS_CONFIG: VippsConfigDto = {
  bundleSymbolicName: "com.platform.killbill.vipps-mobilepay-plugin",
  bundleVersion: "1.0.0",
  pluginName: "killbill-vipps-mobilepay",
  clinicPayoutIban: "DK5000400440116243",
  clinicVippsMsn: "700000",
  tiers: {
    THERAPIST_ACCESS: {
      productType: "THERAPIST_ACCESS",
      planName: "Therapist-adgang",
      amountDkk: 799,
      payoutIban: "DK8130000012345678",
      vippsMsn: "700101",
      glAccount: "4300",
      grantedRole: "THERAPIST",
    },
    MANAGEMENT_ACCESS: {
      productType: "MANAGEMENT_ACCESS",
      planName: "Management-adgang",
      amountDkk: 1499,
      payoutIban: "DK9230000087654321",
      vippsMsn: "700202",
      glAccount: "4300",
      grantedRole: "ADMIN",
    },
  },
};

interface CheckoutPlanOption {
  readonly testId: string;
  readonly productType: "THERAPIST_ACCESS" | "MANAGEMENT_ACCESS" | "SUBSCRIPTION" | "CLIP_CARD";
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
  readonly targetClientUuid: string;
  readonly vippsConfig?: VippsConfigDto;
  readonly agreements?: VippsAgreementItem[];
  readonly onRefresh: () => Promise<void>;
  readonly onError: (problem: ProblemDetail) => void;
  readonly onRoleUpgraded?: () => Promise<void> | void;
}

const VippsPaymentHub: React.FC<VippsPaymentHubProps> = ({
  copy,
  targetClientUuid,
  vippsConfig,
  agreements,
  onRefresh,
  onError,
  onRoleUpgraded,
}) => {
  const cfg = vippsConfig ?? DEFAULT_VIPPS_CONFIG;
  const activeAgreements = agreements ?? [];
  const therapistTier = cfg.tiers.THERAPIST_ACCESS;
  const managementTier = cfg.tiers.MANAGEMENT_ACCESS;

  const planOptions: CheckoutPlanOption[] = [
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
    {
      testId: "btn-checkout-subscription",
      productType: "SUBSCRIPTION",
      title: copy.subscriptionTitle,
      description: copy.subscriptionDesc,
      amountDkk: 499,
      priceLabel: `499 ${copy.perMonthUnit}`,
      payoutIban: cfg.clinicPayoutIban,
      vippsMsn: cfg.clinicVippsMsn,
      glAccount: "4200",
    },
    {
      testId: "btn-checkout-clipcard",
      productType: "CLIP_CARD",
      title: copy.clipcardTitle,
      description: copy.clipcardDesc,
      amountDkk: 5000,
      priceLabel: "5000 DKK",
      payoutIban: cfg.clinicPayoutIban,
      vippsMsn: cfg.clinicVippsMsn,
      glAccount: "2100",
      clips: 5,
    },
  ];

  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlanOption | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"MOBILEPAY" | "CREDIT_CARD">("MOBILEPAY");
  const [phoneNumber, setPhoneNumber] = useState("+4520123456");
  const [cardHolder, setCardHolder] = useState("Anders Sand");
  const [cardNumber, setCardNumber] = useState("4532 0151 1283 0366");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("321");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<VippsCheckoutReceipt | null>(null);

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

  return (
    <div
      data-testid="vipps-payment-hub"
      className="space-y-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 via-white to-teal-50/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
            <i className="bi bi-plug" aria-hidden="true" />
            {copy.vippsHubBadge} · {cfg.bundleSymbolicName}
          </span>
          <h3 className="mt-1 text-base font-bold text-slate-900">{copy.vippsHubHeading}</h3>
        </div>
      </div>

      {receipt && (
        <div
          data-testid="vipps-checkout-receipt"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950"
        >
          <div className="font-semibold">
            {copy.receiptTitle}: {receipt.planName} ({receipt.amountDkk} {receipt.currency})
          </div>
          <div className="mt-1 text-emerald-800">
            {receipt.maskedInstrument} · {copy.payoutLabel}: {receipt.payoutIban} ({copy.msnLabel}: {receipt.vippsMsn}) · JGit #{receipt.gitCommitHash}
          </div>
          {receipt.grantedRole && (
            <div className="mt-1 font-semibold text-teal-800">
              {copy.roleUpgradedPrefix}: {receipt.grantedRole}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {planOptions.map((option) => (
          <div
            key={option.productType}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">{option.title}</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                  {option.priceLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{option.description}</p>
              <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                <div>{copy.payoutLabel}: <span className="font-mono">{option.payoutIban}</span></div>
                <div>{copy.msnLabel}: <span className="font-mono">{option.vippsMsn}</span> · GL {option.glAccount}</div>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              data-testid={option.testId}
              onClick={() => setSelectedPlan(option)}
              className="mt-3 w-full rounded-xl bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {copy.openCheckoutBtn}
            </button>
          </div>
        ))}
      </div>

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
                <div>
                  <span className="font-semibold text-slate-900">{agr.planName}</span> — {agr.amountDkk} {agr.currency} · {agr.maskedInstrument}
                  <div className="text-[11px] text-slate-500">
                    {agr.agreementId} · {copy.payoutLabel}: {agr.payoutIban} · {copy.msnLabel}: {agr.vippsMsn} · <span className="font-semibold">{agr.status}</span>
                  </div>
                </div>
                {agr.status === "ACTIVE" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      data-testid={`btn-charge-agreement-${agr.agreementId}`}
                      onClick={() => void handleAgreementAction(agr.agreementId, "charge")}
                      className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      {copy.chargeNextBtn}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      data-testid={`btn-cancel-agreement-${agr.agreementId}`}
                      onClick={() => void handleAgreementAction(agr.agreementId, "cancel")}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100"
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
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-slate-900">
                {copy.checkoutModalTitle}: {selectedPlan.title}
              </h4>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                {selectedPlan.priceLabel}
              </span>
            </div>

            <div
              data-testid="checkout-payout-routing"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
            >
              <div>{copy.payoutLabel}: <strong className="font-mono">{selectedPlan.payoutIban}</strong></div>
              <div>{copy.msnLabel}: <strong className="font-mono">{selectedPlan.vippsMsn}</strong> · Fineract GL {selectedPlan.glAccount}</div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">{copy.paymentMethodLabel}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="select-method-mobilepay"
                  onClick={() => setPaymentMethod("MOBILEPAY")}
                  className={
                    paymentMethod === "MOBILEPAY"
                      ? "rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900"
                      : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
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
                      ? "rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900"
                      : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
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
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700">{copy.cardNumberLabel}</span>
                  <input
                    data-testid="input-card-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">{copy.cardExpiryLabel}</span>
                    <input
                      data-testid="input-card-expiry"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-semibold text-slate-700">{copy.cardCvcLabel}</span>
                    <input
                      data-testid="input-card-cvc"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copy.cancelModalBtn}
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="btn-confirm-vipps-checkout"
                className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {copy.confirmPaymentBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ClientFinanceOverviewView: React.FC<{
  userId: string;
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({ userId, onRoleUpgraded }) => {
  const locale = useUiLocale();
  const copy = FINANCE_COPY[locale];
  const [overview, setOverview] = useState<ClientFinanceOverviewDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<ProblemDetail | null>(null);

  const loadOverview = useCallback(async () => {
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
            {overview?.invoices?.length ?? 0}
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
              amount: 5000,
              currency: 'DKK',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
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
          className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
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
              monthlyAmount: 499,
              currency: 'DKK',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {copy.activateSubscriptionBtn}
        </button>
      </div>

      <VippsPaymentHub
        copy={copy}
        targetClientUuid={userId}
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
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
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
        {overview && (!Array.isArray(overview.invoices) || overview.invoices.length === 0) ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {copy.emptyInvoicesText}
          </p>
        ) : (
          <ul data-testid="client-invoice-list" className="space-y-2">
            {(Array.isArray(overview?.invoices) ? overview.invoices : []).map((inv) => {
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
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {inv.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {Array.isArray(overview?.gitHistory) && overview.gitHistory.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">{copy.gitHistoryHeading}</h3>
          <ul className="space-y-1.5" data-testid="client-finance-git-history">
            {overview.gitHistory.map((entry) => (
              <li
                key={entry.commitHash}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-700"
              >
                <span className="font-mono text-teal-800">{entry.shortHash}</span> —{' '}
                {entry.message} ({entry.authorName})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

const ProviderFinanceLedgerView: React.FC<{
  isAuthenticated: boolean;
  providerUserId: string;
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({
  isAuthenticated,
  providerUserId,
  onRoleUpgraded,
}) => {
  const locale = useUiLocale();
  const copy = FINANCE_COPY[locale];
  const { items: invoices, loading, error, createItem, deleteItem, fetchAll, clearError, setError } =
    useBaseCrud(financeService);

  const [clientUuid, setClientUuid] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('850');
  const [currency, setCurrency] = useState('DKK');
  const [ledger, setLedger] = useState<GeneralLedgerSummaryDto | null>(null);

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
      setAmount('850');
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
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-5 items-end"
      >
        <input
          data-testid="input-clientUuid"
          placeholder={copy.clientUuidPlaceholder}
          value={clientUuid}
          onChange={(e) => setClientUuid(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-description"
          placeholder={copy.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-amount"
          type="number"
          placeholder={copy.amountPlaceholder}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-currency"
          placeholder={copy.currencyPlaceholder}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            data-testid="submit-invoice"
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.createInvoiceBtn}
          </button>
          {isAuthenticated && (
            <button
              type="button"
              data-testid="btn-create-loan"
              onClick={() => void handleCreateLoan()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {copy.createLoanBtn}
            </button>
          )}
        </div>
      </form>

      {ledger && Array.isArray(ledger.chartOfAccounts) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="ledger-accounts-grid">
          {ledger.chartOfAccounts.map((acc) => {
            const accountCode = acc.code || acc.glCode;
            return (
              <div
                key={accountCode}
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs"
              >
                <div className="font-mono font-semibold text-teal-800">{copy.accountPrefix} {accountCode}</div>
                {acc.name && <div className="mt-0.5 text-slate-600">{acc.name}</div>}
                <div className="mt-1 text-base font-bold text-slate-900">{acc.balance} DKK</div>
              </div>
            );
          })}
        </div>
      )}

      {isAuthenticated && (
        <VippsPaymentHub
          copy={copy}
          targetClientUuid={providerUserId}
          vippsConfig={ledger?.vippsConfig}
          agreements={ledger?.vippsAgreements}
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
        <ul data-testid="invoice-list" className="space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              data-testid={`invoice-item-${inv.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span>
                <strong>{inv.description || inv.invoiceNumber || inv.id}</strong> —{' '}
                {inv.amount ?? inv.amountGrossDkk} {inv.currency} ({inv.status || 'PAID'})
              </span>
              <div className="flex items-center gap-2">
                {isAuthenticated && inv.id && inv.status !== 'REFUNDED' && (
                  <button
                    type="button"
                    data-testid={`refund-invoice-${inv.id}`}
                    onClick={() => void handleRefund(inv.id!)}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    {copy.refundBtn}
                  </button>
                )}
                {inv.id && (
                  <button
                    type="button"
                    data-testid={`delete-invoice-${inv.id}`}
                    onClick={() => void deleteItem(inv.id!)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    {copy.deleteBtn}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const FinanceFeatureView: React.FC<{
  onRoleUpgraded?: () => Promise<void> | void;
}> = ({ onRoleUpgraded } = {}) => {
  const auth = useOptionalAuth();
  if (auth && !auth.hasRole('PROVIDER', 'MANAGEMENT')) {
    return <ClientFinanceOverviewView userId={auth.user.id} onRoleUpgraded={onRoleUpgraded} />;
  }
  return (
    <ProviderFinanceLedgerView
      isAuthenticated={Boolean(auth)}
      providerUserId={auth?.user.id || ''}
      onRoleUpgraded={onRoleUpgraded}
    />
  );
};
