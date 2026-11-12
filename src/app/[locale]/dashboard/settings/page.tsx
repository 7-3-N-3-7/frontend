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
    <div className="container py-4" data-testid="settings-clinic-page">
      <header className="mb-4 border-bottom pb-3">
        <h1 className="h3 fw-bold mb-1">
          Profil- & Klinikindstillinger (CVR & Samtykke)
        </h1>
        <p className="text-muted mb-0">
          Administrer klinikoplysninger, klientprofiler og handshakes med 1:1
          symmetri mod <code>ClinicPlatformFeature.java</code>.
        </p>
      </header>
      <ClinicPlatformFeatureView />
    </div>
  );
}
