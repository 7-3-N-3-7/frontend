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

import React, { useState } from 'react';
import { BaseApiService, DomainGuard, HasId } from '../../core/baseDomainCore';
import { ProblemAlert, useBaseCrud } from '../../core/baseUiCore';

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

// ============================================================================
// 3. FEATURE VIEW (Exported React Entrypoint for this Vertical Slice)
// ============================================================================

export const FinanceFeatureView: React.FC = () => {
  const { items: invoices, loading, error, createItem, deleteItem, clearError } =
    useBaseCrud(financeService);

  const [clientUuid, setClientUuid] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('850');
  const [currency, setCurrency] = useState('DKK');

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
    }
  };

  return (
    <section
      data-testid="finance-feature-view"
      className="p-4 card border-0 shadow-xs rounded-4 bg-white"
    >
      <h2 className="h5 fw-bold mb-3">Klinik Økonomi, Kill Bill &amp; Fineract Hovedbog</h2>

      <ProblemAlert problem={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        data-testid="finance-form"
        className="mb-4 d-flex flex-wrap gap-2"
      >
        <input
          data-testid="input-clientUuid"
          placeholder="Klient UUID"
          value={clientUuid}
          onChange={(e) => setClientUuid(e.target.value)}
          className="form-control w-auto"
        />
        <input
          data-testid="input-description"
          placeholder="Fakturabeskrivelse"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="form-control w-auto"
        />
        <input
          data-testid="input-amount"
          type="number"
          placeholder="Beløb"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="form-control w-auto"
        />
        <input
          data-testid="input-currency"
          placeholder="Valuta (f.eks. DKK)"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="form-control w-auto"
        />
        <button
          type="submit"
          data-testid="submit-invoice"
          className="btn btn-primary px-4"
        >
          Opret Faktura
        </button>
      </form>

      {loading ? (
        <p data-testid="loading-indicator">Indlæser...</p>
      ) : (
        <ul data-testid="invoice-list" className="list-group">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              data-testid={`invoice-item-${inv.id}`}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>
                <strong>{inv.description || inv.invoiceNumber || inv.id}</strong> —{' '}
                {inv.amount ?? inv.amountGrossDkk} {inv.currency} ({inv.status || 'PAID'})
              </span>
              {inv.id && (
                <button
                  type="button"
                  data-testid={`delete-invoice-${inv.id}`}
                  onClick={() => void deleteItem(inv.id!)}
                  className="btn btn-sm btn-outline-danger"
                >
                  Slet
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
