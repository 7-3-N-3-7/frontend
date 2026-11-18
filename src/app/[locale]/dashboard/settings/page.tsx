"use client";

/**
 * @file settings/page.tsx
 * @description Next.js App Router rute til Profil- & Klinikindstillinger (`/dashboard/settings`).
 * Delegerer klient- og klinikadministration til Vertical Slice komponenten
 * `ProfileSettingsWorkspace` i `@/features/clinic/ClinicPlatformFeature`.
 */

import React from "react";
import { useParams } from "next/navigation";
import { ProfileSettingsWorkspace } from "@/features/clinic/ClinicPlatformFeature";
import { useI18nCache } from "@/features/i18n/I18nFeature";

type SettingsLocale = "da" | "en" | "fr" | "es" | "de";

const SETTINGS_COPY_BY_LOCALE: Record<
  SettingsLocale,
  { badge: string; title: string; subtitle: string }
> = {
  da: {
    badge: "Konto & Praksis",
    title: "Profil- & Klinikindstillinger",
    subtitle:
      "Administrer personoplysninger, samtykker med behandlere og eventuelle klinikoplysninger.",
  },
  en: {
    badge: "Account & Practice",
    title: "Profile & Clinic Settings",
    subtitle:
      "Manage personal details, active therapist consents, and practice settings.",
  },
  fr: {
    badge: "Compte & Cabinet",
    title: "Paramètres Profil & Clinique",
    subtitle:
      "Gérez vos informations personnelles, consentements actifs et paramètres de cabinet.",
  },
  es: {
    badge: "Cuenta & Práctica",
    title: "Configuración de Perfil y Clínica",
    subtitle:
      "Gestiona tus datos personales, consentimientos activos y ajustes de clínica.",
  },
  de: {
    badge: "Konto & Praxis",
    title: "Profil- & Klinikeinstellungen",
    subtitle:
      "Verwalten Sie persönliche Daten, aktive Einwilligungen und Praxiseinstellungen.",
  },
};

export default function ProfileAndClinicSettingsPage() {
  const params = useParams();
  const i18nCache = useI18nCache();
  const activeLocale = (
    (typeof params?.locale === "string" && params.locale) ||
    i18nCache?.locale ||
    "da"
  )
    .split("-")[0]
    .toLowerCase() as SettingsLocale;
  const copy =
    SETTINGS_COPY_BY_LOCALE[activeLocale] || SETTINGS_COPY_BY_LOCALE.en;

  return (
    <div className="space-y-6" data-testid="settings-clinic-page">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
          <i className="bi bi-gear" aria-hidden="true" />
          {copy.badge}
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          {copy.title}
        </h1>
        <p className="mt-1 mb-0 text-sm text-slate-600">{copy.subtitle}</p>
      </header>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <ProfileSettingsWorkspace />
      </section>
    </div>
  );
}
