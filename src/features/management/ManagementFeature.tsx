"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: ManagementFeature.tsx (Role-Guarded Vertical Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/clinic/ClinicPlatformFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Demonstrerer hvordan følsomme ledelsesværktøjer isoleres både med en
 * modul-privat [Service: ManagementApiService] (`no export`) og en deklarativ
 * [Component: <RoleGuard allowed={["MANAGEMENT"]} />].
 * Almindelige klienter (`CLIENT`) og behandlere (`PROVIDER`) afvises i UI-laget
 * med `data-testid="forbidden-notice"`.
 *
 * ARKITEKTONISK OVERBLIK (4 TRIN):
 *   1. [Record/DTO: ManagementKpiDto]
 *   2. [Service: ManagementApiService] (Modul-Privat — Information Hiding)
 *   3. [Hook: useBaseCrud<ManagementKpiDto, string>(managementService)]
 *   4. [Component: <ManagementFeatureView />] (Beskyttet af [Component: <RoleGuard />])
 * ============================================================================
 */

import React, { useState } from "react";
import {
  BaseApiService,
  DomainGuard,
  HasId,
} from "../../core/baseDomainCore";
import {
  ConfirmActionDialog,
  ProblemAlert,
  RoleGuard,
  useBaseCrud,
} from "../../core/baseUiCore";
import { SupportedUiLocale, useUiLocale } from "../i18n/I18nFeature";

// ============================================================================
// 1. DTO CONTRACTS (Management / Clinic KPI & Audit Overview)
// ============================================================================

export interface ManagementKpiDto extends HasId<string> {
  readonly id?: string;
  readonly metricName: string;
  readonly metricValue: number;
  readonly unit: string;
  readonly department: string;
}

// ============================================================================
// 2. MODULE-PRIVATE API SERVICE (Strictly encapsulated — NO 'export' keyword!)
// ============================================================================

class ManagementApiService extends BaseApiService<ManagementKpiDto, string> {
  constructor() {
    super("/api/backend/management/kpis");
  }

  protected override validateBeforeCreate(
    dto: Partial<ManagementKpiDto>
  ): void {
    DomainGuard.requireNotBlank(
      dto.metricName,
      "KPI Metric name",
      "metricName"
    );
    DomainGuard.requirePositive(
      dto.metricValue,
      "KPI Metric value",
      "metricValue"
    );
    DomainGuard.requireNotBlank(dto.department, "Department", "department");
  }
}

const managementService = new ManagementApiService();

// ============================================================================
// 3. EXPORTED FEATURE VIEW (Restricted strictly to MANAGEMENT / ADMIN via RoleGuard)
// ============================================================================

interface ManagementCopy {
  badge: string;
  heading: string;
  kpiNamePlaceholder: string;
  valuePlaceholder: string;
  unitLabel: string;
  unitPlaceholder: string;
  departmentPlaceholder: string;
  defaultDepartment: string;
  createKpiBtn: string;
  loadingText: string;
  deleteBtn: string;
  confirmDeleteTitle: string;
  confirmDeleteDesc: string;
  confirmDeleteBtn: string;
  cancelBtn: string;
  forbiddenNotice: string;
}

const MANAGEMENT_COPY: Record<SupportedUiLocale, ManagementCopy> = {
  da: {
    badge: "Ledelse & KPI",
    heading: "Virksomhedsledelse — KPI, Klinikstyring & Audit",
    kpiNamePlaceholder: "KPI Navn",
    valuePlaceholder: "Værdi",
    unitLabel: "Enhed",
    unitPlaceholder: "Enhed (DKK, %, sessioner)",
    departmentPlaceholder: "Afdeling",
    defaultDepartment: "Psykotraumatologi",
    createKpiBtn: "Opret KPI-mål",
    loadingText: "Indlæser...",
    deleteBtn: "Slet",
    confirmDeleteTitle: "Slet KPI-mål?",
    confirmDeleteDesc: "Er du sikker på, at du vil fjerne dette nøgletal?",
    confirmDeleteBtn: "Ja, slet",
    cancelBtn: "Annuller",
    forbiddenNotice:
      "Kun virksomhedsledelse (MANAGEMENT / ADMIN) har adgang til ledelsesoverblik og KPI-styring.",
  },
  en: {
    badge: "Management & KPI",
    heading: "Executive Management — KPI, Clinic Operations & Audit",
    kpiNamePlaceholder: "KPI Name",
    valuePlaceholder: "Value",
    unitLabel: "Unit",
    unitPlaceholder: "Unit (DKK, %, sessions)",
    departmentPlaceholder: "Department",
    defaultDepartment: "Psychotraumatology",
    createKpiBtn: "Create KPI Target",
    loadingText: "Loading...",
    deleteBtn: "Delete",
    confirmDeleteTitle: "Delete KPI target?",
    confirmDeleteDesc: "Are you sure you want to remove this KPI metric?",
    confirmDeleteBtn: "Yes, delete",
    cancelBtn: "Cancel",
    forbiddenNotice:
      "Only executive management (MANAGEMENT / ADMIN) has access to management overview and KPI control.",
  },
  fr: {
    badge: "Direction & KPI",
    heading: "Direction — KPI, Pilotage Clinique & Audit",
    kpiNamePlaceholder: "Nom du KPI",
    valuePlaceholder: "Valeur",
    unitLabel: "Unité",
    unitPlaceholder: "Unité (DKK, %, séances)",
    departmentPlaceholder: "Département",
    defaultDepartment: "Psychotraumatologie",
    createKpiBtn: "Créer un Objectif KPI",
    loadingText: "Chargement...",
    deleteBtn: "Supprimer",
    confirmDeleteTitle: "Supprimer l'objectif KPI ?",
    confirmDeleteDesc: "Voulez-vous vraiment supprimer cet indicateur KPI ?",
    confirmDeleteBtn: "Oui, supprimer",
    cancelBtn: "Annuler",
    forbiddenNotice:
      "Seule la direction (MANAGEMENT / ADMIN) a accès au tableau de bord exécutif et au suivi des KPI.",
  },
  es: {
    badge: "Dirección y KPI",
    heading: "Dirección Clínica — KPI, Gestión y Auditoría",
    kpiNamePlaceholder: "Nombre del KPI",
    valuePlaceholder: "Valor",
    unitLabel: "Unidad",
    unitPlaceholder: "Unidad (DKK, %, sesiones)",
    departmentPlaceholder: "Departamento",
    defaultDepartment: "Psicotraumatología",
    createKpiBtn: "Crear Objetivo KPI",
    loadingText: "Cargando...",
    deleteBtn: "Eliminar",
    confirmDeleteTitle: "¿Eliminar objetivo KPI?",
    confirmDeleteDesc: "¿Seguro que deseas eliminar este indicador KPI?",
    confirmDeleteBtn: "Sí, eliminar",
    cancelBtn: "Cancelar",
    forbiddenNotice:
      "Solo la dirección ejecutiva (MANAGEMENT / ADMIN) tiene acceso al resumen directivo y control de KPI.",
  },
  de: {
    badge: "Leitung & KPI",
    heading: "Klinikleitung — KPI, Betriebsführung & Audit",
    kpiNamePlaceholder: "KPI-Name",
    valuePlaceholder: "Wert",
    unitLabel: "Einheit",
    unitPlaceholder: "Einheit (DKK, %, Sitzungen)",
    departmentPlaceholder: "Abteilung",
    defaultDepartment: "Psychotraumatologie",
    createKpiBtn: "KPI-Ziel erstellen",
    loadingText: "Wird geladen...",
    deleteBtn: "Löschen",
    confirmDeleteTitle: "KPI-Ziel löschen?",
    confirmDeleteDesc: "Möchten Sie diese Kennzahl wirklich entfernen?",
    confirmDeleteBtn: "Ja, löschen",
    cancelBtn: "Abbrechen",
    forbiddenNotice:
      "Nur die Klinikleitung (MANAGEMENT / ADMIN) hat Zugriff auf die Managementübersicht und KPI-Steuerung.",
  },
};

const ManagementFeatureAuthorizedContent: React.FC = () => {
  const locale = useUiLocale();
  const copy = MANAGEMENT_COPY[locale];
  const { items: kpis, loading, error, create, remove, clearError } =
    useBaseCrud(managementService);
  const [metricName, setMetricName] = useState("");
  const [metricValue, setMetricValue] = useState("100");
  const [unit, setUnit] = useState("DKK");
  const [department, setDepartment] = useState(copy.defaultDepartment);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      metricName,
      metricValue: Number(metricValue),
      unit,
      department,
    });
    if (created) {
      setMetricName("");
      setMetricValue("100");
    }
  };

  return (
    <section
      data-testid="management-feature-view"
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          <i className="bi bi-graph-up-arrow" aria-hidden="true" />
          {copy.badge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.heading}
        </h2>
      </div>

      <ProblemAlert error={error} onDismiss={clearError} />

      <ConfirmActionDialog
        open={pendingDeleteId !== null}
        title={copy.confirmDeleteTitle}
        description={copy.confirmDeleteDesc}
        confirmLabel={copy.confirmDeleteBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const targetId = pendingDeleteId;
          setPendingDeleteId(null);
          if (targetId) void remove(targetId);
        }}
      />

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="kpi-name-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.kpiNamePlaceholder}
          </label>
          <input
            id="kpi-name-input"
            type="text"
            placeholder={copy.kpiNamePlaceholder}
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            data-testid="input-kpi-name"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="kpi-value-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.valuePlaceholder}
          </label>
          <input
            id="kpi-value-input"
            type="number"
            placeholder={copy.valuePlaceholder}
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            data-testid="input-kpi-value"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="kpi-unit-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.unitLabel}
          </label>
          <input
            id="kpi-unit-input"
            type="text"
            placeholder={copy.unitPlaceholder}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            data-testid="input-kpi-unit"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="kpi-dept-input"
            className="text-xs font-semibold text-slate-600"
          >
            {copy.departmentPlaceholder}
          </label>
          <input
            id="kpi-dept-input"
            type="text"
            placeholder={copy.departmentPlaceholder}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            data-testid="input-kpi-department"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          data-testid="submit-kpi"
        >
          {copy.createKpiBtn}
        </button>
      </form>

      {loading && (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      )}

      <ul className="space-y-2" data-testid="kpi-list">
        {kpis.map((kpi) => (
          <li
            key={kpi.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
          >
            <div>
              <strong className="text-slate-900">{kpi.metricName}</strong>{" "}
              <span className="text-slate-500">({kpi.department})</span> —{" "}
              <span className="font-semibold text-teal-800">
                {kpi.metricValue} {kpi.unit}
              </span>
            </div>
            {kpi.id && (
              <button
                type="button"
                onClick={() => setPendingDeleteId(kpi.id!)}
                className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                data-testid={`delete-kpi-${kpi.id}`}
              >
                {copy.deleteBtn}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

const ManagementForbiddenNotice: React.FC = () => {
  const locale = useUiLocale();
  return (
    <p data-testid="forbidden-notice">
      {MANAGEMENT_COPY[locale].forbiddenNotice}
    </p>
  );
};

export const ManagementFeatureView: React.FC = () => (
  <RoleGuard
    allowed={["MANAGEMENT"]}
    fallback={<ManagementForbiddenNotice />}
  >
    <ManagementFeatureAuthorizedContent />
  </RoleGuard>
);

export default ManagementFeatureView;
