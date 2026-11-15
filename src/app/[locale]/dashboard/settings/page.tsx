"use client";

/**
 * @file settings/page.tsx
 * @description Next.js App Router rute til Profil- & Klinikindstillinger (`/dashboard/settings`).
 * Delegerer klient- og klinikadministration til Vertical Slice komponenten
 * `ClinicPlatformFeatureView` i `@/features/clinic/ClinicPlatformFeature`.
 */

import React from "react";
import { ClinicPlatformFeatureView } from "@/features/clinic/ClinicPlatformFeature";

export default function ProfileAndClinicSettingsPage() {
  return (
    <div className="space-y-6" data-testid="settings-clinic-page">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
          <i className="bi bi-gear" aria-hidden="true" />
          Konto &amp; Praksis
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Profil- &amp; Klinikindstillinger (CVR &amp; Samtykke)
        </h1>
        <p className="mt-1 mb-0 text-sm text-slate-600">
          Administrer klinikoplysninger, klientprofiler og handshakes med 1:1
          symmetri mod <code>ClinicPlatformFeature.java</code>.
        </p>
      </header>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <ClinicPlatformFeatureView />
      </section>
    </div>
  );
}
