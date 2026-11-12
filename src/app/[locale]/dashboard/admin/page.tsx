"use client";

/**
 * @file admin/page.tsx
 * @description Next.js App Router rute til Sprog- og Systemadministration (`/dashboard/admin`).
 * Delegerer al tilstandsstyring, validering og CRUD-kommunikation til Vertical Slice
 * komponenten `I18nFeatureView` i `@/features/i18n/I18nFeature`.
 */

import React from "react";
import { I18nFeatureView } from "@/features/i18n/I18nFeature";

export default function I18nAdminDashboardPage() {
  return (
    <div className="container py-4" data-testid="admin-i18n-page">
      <header className="mb-4 border-bottom pb-3">
        <h1 className="h3 fw-bold mb-1">
          Sprog- & Oversættelsesadministration (MongoDB i18n)
        </h1>
        <p className="text-muted mb-0">
          Administrer flersprogede nøgler og ISO 639-1 ordbøger med 1:1 symmetri
          mod <code>I18nFeature.java</code>.
        </p>
      </header>
      <I18nFeatureView />
    </div>
  );
}
