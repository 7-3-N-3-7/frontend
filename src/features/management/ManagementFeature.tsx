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

export const ManagementFeatureView: React.FC = () => {
  const { items: kpis, loading, error, create, remove, clearError } =
    useBaseCrud(managementService);
  const [metricName, setMetricName] = useState("");
  const [metricValue, setMetricValue] = useState("100");
  const [unit, setUnit] = useState("DKK");
  const [department, setDepartment] = useState("Psykotraumatologi");

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
    <RoleGuard
      allowed={["MANAGEMENT"]}
      fallback={
        <p data-testid="forbidden-notice">
          Kun virksomhedsledelse (MANAGEMENT / ADMIN) har adgang til ledelsesoverblik og KPI-styring.
        </p>
      }
    >
      <section
        data-testid="management-feature-view"
        className="p-4 max-w-4xl mx-auto"
      >
        <h2 className="text-xl font-bold mb-4">
          Virksomhedsledelse — KPI, Klinikstyring &amp; Audit
        </h2>

        <ProblemAlert error={error} onDismiss={clearError} />

        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="KPI Navn"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-kpi-name"
          />
          <input
            type="number"
            placeholder="Værdi"
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            className="border p-2 rounded w-28"
            data-testid="input-kpi-value"
          />
          <input
            type="text"
            placeholder="Enhed (DKK, %, sessioner)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="border p-2 rounded w-28"
            data-testid="input-kpi-unit"
          />
          <input
            type="text"
            placeholder="Afdeling"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-kpi-department"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-slate-900 text-white px-4 py-2 rounded"
            data-testid="submit-kpi"
          >
            Opret KPI-mål
          </button>
        </form>

        {loading && <p data-testid="loading-indicator">Loading...</p>}

        <ul className="space-y-2" data-testid="kpi-list">
          {kpis.map((kpi) => (
            <li
              key={kpi.id}
              className="border p-3 rounded flex justify-between items-center"
            >
              <div>
                <strong>{kpi.metricName}</strong> ({kpi.department}) —{" "}
                <span>
                  {kpi.metricValue} {kpi.unit}
                </span>
              </div>
              <button
                type="button"
                onClick={() => kpi.id && remove(kpi.id)}
                className="text-red-600 hover:underline"
                data-testid={`delete-kpi-${kpi.id}`}
              >
                Slet
              </button>
            </li>
          ))}
        </ul>
      </section>
    </RoleGuard>
  );
};

export default ManagementFeatureView;
