"use client";

/**
 * @file admin/page.tsx
 * @description Next.js App Router rute til Sprog- og Systemadministration (`/dashboard/admin`).
 * Delegerer al tilstandsstyring, validering og CRUD-kommunikation til Vertical Slice
 * komponenterne `I18nFeatureView` og `ManagementFeatureView`.
 */

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { I18nFeatureView } from "@/features/i18n/I18nFeature";
import { ManagementFeatureView } from "@/features/management/ManagementFeature";

const AdminContent: React.FC = () => {
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get("tab") === "management" ? "management" : "overview";

  return (
    <div className="space-y-6" data-testid="admin-i18n-page">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
          <i className="bi bi-sliders2" aria-hidden="true" />
          Systemadministration
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {activeTab === "management"
            ? "KPI, Ledelse & Audit (Management)"
            : "Sprog- & Oversættelsesadministration (MongoDB i18n)"}
        </h1>
        <p className="mt-1 mb-0 text-sm text-slate-600">
          {activeTab === "management"
            ? "Ledelsesoverblik og nøgletal med 1:1 symmetri mod ManagementFeature.java."
            : "Administrer flersprogede nøgler og ISO 639-1 ordbøger med 1:1 symmetri mod I18nFeature.java."}
        </p>
      </header>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        {activeTab === "management" ? (
          <ManagementFeatureView />
        ) : (
          <I18nFeatureView />
        )}
      </section>
    </div>
  );
};

export default function I18nAdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" data-testid="admin-i18n-page">
          <I18nFeatureView />
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
