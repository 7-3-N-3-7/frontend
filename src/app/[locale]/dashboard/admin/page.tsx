"use client";

/**
 * @file admin/page.tsx
 * @description Next.js App Router rute til Sprog- og Systemadministration (`/dashboard/admin`).
 * Delegerer al tilstandsstyring, validering og CRUD-kommunikation til Vertical Slice
 * komponenterne `I18nFeatureView`, `UserFeatureView` og `ManagementFeatureView`.
 */

import React, { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { I18nFeatureView, useI18nCache } from "@/features/i18n/I18nFeature";
import { ManagementFeatureView } from "@/features/management/ManagementFeature";
import { UserFeatureView } from "@/features/user/UserFeature";

type AdminTab = "overview" | "users" | "management";
type AdminLocale = "da" | "en" | "fr" | "es" | "de";

interface AdminPageCopy {
  badge: string;
  titles: Record<AdminTab, string>;
  descriptions: Record<AdminTab, string>;
}

const ADMIN_COPY_BY_LOCALE: Record<AdminLocale, AdminPageCopy> = {
  da: {
    badge: "Systemadministration",
    titles: {
      overview: "Sprog- & Oversættelsesadministration",
      users: "Bruger- & Rolleadministration",
      management: "Nøgletal, Ledelse & Audit",
    },
    descriptions: {
      overview:
        "Administrer flersprogede nøgler og sprogordbøger på tværs af platformens understøttede sprog.",
      users:
        "Opret, gennemgå og administrer platformens brugere og adgangsroller.",
      management:
        "Ledelsesoverblik, driftsnøgletal og samlet klinisk aktivitet.",
    },
  },
  en: {
    badge: "System Administration",
    titles: {
      overview: "Language & Translation Administration",
      users: "User & Role Administration",
      management: "KPI, Management & Audit",
    },
    descriptions: {
      overview:
        "Manage multilingual translation keys and dictionaries across supported platform languages.",
      users:
        "Create, inspect, and manage platform users and access roles.",
      management:
        "Executive metrics, operational status, and governance overview.",
    },
  },
  fr: {
    badge: "Administration Système",
    titles: {
      overview: "Administration des Langues & Traductions",
      users: "Administration Utilisateurs & Rôles",
      management: "KPI, Direction & Audit",
    },
    descriptions: {
      overview:
        "Gérez les clés multilingues et les dictionnaires des langues prises en charge sur la plateforme.",
      users:
        "Créez, inspectez et gérez les utilisateurs et rôles d'accès de la plateforme.",
      management:
        "Indicateurs de pilotage et vue d'ensemble de la gouvernance clinique.",
    },
  },
  es: {
    badge: "Administración del Sistema",
    titles: {
      overview: "Administración de Idiomas y Traducciones",
      users: "Administración de Usuarios y Roles",
      management: "KPI, Dirección y Auditoría",
    },
    descriptions: {
      overview:
        "Administra claves multilingües y diccionarios para los idiomas compatibles de la plataforma.",
      users:
        "Crea, inspecciona y gestiona usuarios y roles de acceso de la plataforma.",
      management:
        "Indicadores clave, estado operativo y resumen de gobernanza.",
    },
  },
  de: {
    badge: "Systemadministration",
    titles: {
      overview: "Sprach- & Übersetzungsverwaltung",
      users: "Benutzer- & Rollenverwaltung",
      management: "KPI, Leitung & Audit",
    },
    descriptions: {
      overview:
        "Verwalten Sie mehrsprachige Schlüssel und Wörterbücher für alle unterstützten Plattformsprachen.",
      users:
        "Erstellen, prüfen und verwalten Sie Plattformbenutzer und Zugriffsrollen.",
      management:
        "Kennzahlen, Betriebsstatus und strukturierte Verwaltungsübersicht.",
    },
  },
};

const AdminContent: React.FC = () => {
  const params = useParams();
  const i18nCache = useI18nCache();
  const searchParams = useSearchParams();
  const activeLocale = (
    (typeof params?.locale === "string" && params.locale) ||
    i18nCache?.locale ||
    "da"
  )
    .split("-")[0]
    .toLowerCase() as AdminLocale;
  const copy = ADMIN_COPY_BY_LOCALE[activeLocale] || ADMIN_COPY_BY_LOCALE.en;
  const rawTab = searchParams?.get("tab");
  const activeTab: AdminTab =
    rawTab === "management"
      ? "management"
      : rawTab === "users"
        ? "users"
        : "overview";

  const title = copy.titles[activeTab];
  const description = copy.descriptions[activeTab];

  return (
    <div className="space-y-6" data-testid="admin-i18n-page">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
            <i className="bi bi-sliders2" aria-hidden="true" />
            {copy.badge}
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1 mb-0 text-sm text-slate-600">{description}</p>
        </div>
      </header>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        {activeTab === "management" ? (
          <ManagementFeatureView />
        ) : activeTab === "users" ? (
          <UserFeatureView />
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
