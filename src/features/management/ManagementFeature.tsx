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
import { ProblemAlert, RoleGuard, useBaseCrud } from "../../core/baseUiCore";
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
  unitPlaceholder: string;
  departmentPlaceholder: string;
  defaultDepartment: string;
  createKpiBtn: string;
  loadingText: string;
  deleteBtn: string;
  forbiddenNotice: string;
}

const MANAGEMENT_COPY: Record<SupportedUiLocale, ManagementCopy> = {
  da: {
    badge: "Ledelse & KPI",
    heading: "Virksomhedsledelse — KPI, Klinikstyring & Audit",
    kpiNamePlaceholder: "KPI Navn",
    valuePlaceholder: "Værdi",
    unitPlaceholder: "Enhed (DKK, %, sessioner)",
    departmentPlaceholder: "Afdeling",
    defaultDepartment: "Psykotraumatologi",
    createKpiBtn: "Opret KPI-mål",
    loadingText: "Indlæser...",
    deleteBtn: "Slet",
    forbiddenNotice:
      "Kun virksomhedsledelse (MANAGEMENT / ADMIN) har adgang til ledelsesoverblik og KPI-styring.",
  },
  en: {
    badge: "Management & KPI",
    heading: "Executive Management — KPI, Clinic Operations & Audit",
    kpiNamePlaceholder: "KPI Name",
    valuePlaceholder: "Value",
    unitPlaceholder: "Unit (DKK, %, sessions)",
    departmentPlaceholder: "Department",
    defaultDepartment: "Psychotraumatology",
    createKpiBtn: "Create KPI Target",
    loadingText: "Loading...",
    deleteBtn: "Delete",
    forbiddenNotice:
      "Only executive management (MANAGEMENT / ADMIN) has access to management overview and KPI control.",
  },
  fr: {
    badge: "Direction & KPI",
    heading: "Direction — KPI, Pilotage Clinique & Audit",
    kpiNamePlaceholder: "Nom du KPI",
    valuePlaceholder: "Valeur",
    unitPlaceholder: "Unité (DKK, %, séances)",
    departmentPlaceholder: "Département",
    defaultDepartment: "Psychotraumatologie",
    createKpiBtn: "Créer un Objectif KPI",
    loadingText: "Chargement...",
    deleteBtn: "Supprimer",
    forbiddenNotice:
      "Seule la direction (MANAGEMENT / ADMIN) a accès au tableau de bord exécutif et au suivi des KPI.",
  },
  es: {
    badge: "Dirección y KPI",
    heading: "Dirección Clínica — KPI, Gestión y Auditoría",
    kpiNamePlaceholder: "Nombre del KPI",
    valuePlaceholder: "Valor",
    unitPlaceholder: "Unidad (DKK, %, sesiones)",
    departmentPlaceholder: "Departamento",
    defaultDepartment: "Psicotraumatología",
    createKpiBtn: "Crear Objetivo KPI",
    loadingText: "Cargando...",
    deleteBtn: "Eliminar",
    forbiddenNotice:
      "Solo la dirección ejecutiva (MANAGEMENT / ADMIN) tiene acceso al resumen directivo y control de KPI.",
  },
  de: {
    badge: "Leitung & KPI",
    heading: "Klinikleitung — KPI, Betriebsführung & Audit",
    kpiNamePlaceholder: "KPI-Name",
    valuePlaceholder: "Wert",
    unitPlaceholder: "Einheit (DKK, %, Sitzungen)",
    departmentPlaceholder: "Abteilung",
    defaultDepartment: "Psychotraumatologie",
    createKpiBtn: "KPI-Ziel erstellen",
    loadingText: "Wird geladen...",
    deleteBtn: "Löschen",
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

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder={copy.kpiNamePlaceholder}
          value={metricName}
          onChange={(e) => setMetricName(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-kpi-name"
        />
        <input
          type="number"
          placeholder={copy.valuePlaceholder}
          value={metricValue}
          onChange={(e) => setMetricValue(e.target.value)}
          className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-kpi-value"
        />
        <input
          type="text"
          placeholder={copy.unitPlaceholder}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-36 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-kpi-unit"
        />
        <input
          type="text"
          placeholder={copy.departmentPlaceholder}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-kpi-department"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
            <button
              type="button"
              onClick={() => kpi.id && remove(kpi.id)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              data-testid={`delete-kpi-${kpi.id}`}
            >
              {copy.deleteBtn}
            </button>
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
