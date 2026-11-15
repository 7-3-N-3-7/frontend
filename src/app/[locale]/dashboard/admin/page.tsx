"use client";

/**
 * @file admin/page.tsx
 * @description Next.js App Router rute til Sprog- og Systemadministration (`/dashboard/admin`).
 * Delegerer al tilstandsstyring, validering og CRUD-kommunikation til Vertical Slice
 * komponenterne `I18nFeatureView`, `UserFeatureView` og `ManagementFeatureView`.
 */

import React, { Suspense } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { I18nFeatureView, useI18nCache } from "@/features/i18n/I18nFeature";
import { ManagementFeatureView } from "@/features/management/ManagementFeature";
import { UserFeatureView } from "@/features/user/UserFeature";

type AdminTab = "overview" | "users" | "management";
type AdminLocale = "da" | "en" | "fr" | "es" | "de";

interface AdminPageCopy {
  badge: string;
  tabs: Record<AdminTab, string>;
  titles: Record<AdminTab, string>;
  descriptions: Record<AdminTab, string>;
}

const ADMIN_COPY_BY_LOCALE: Record<AdminLocale, AdminPageCopy> = {
  da: {
    badge: "Systemadministration",
    tabs: {
      overview: "Sprog & i18n",
      users: "Brugere & Roller",
      management: "KPI & Audit",
    },
    titles: {
      overview: "Sprog- & Oversættelsesadministration (MongoDB i18n)",
      users: "Bruger- & Rolleadministration (Users & RBAC)",
      management: "KPI, Ledelse & Audit (Management)",
    },
    descriptions: {
      overview:
        "Administrer flersprogede nøgler og ISO 639-1 ordbøger med 1:1 symmetri mod I18nFeature.java.",
      users:
        "Opret, inspicer og administrer platformens brugere og roller med 1:1 symmetri mod UserFeature.java.",
      management:
        "Ledelsesoverblik og nøgletal med 1:1 symmetri mod ManagementFeature.java.",
    },
  },
  en: {
    badge: "System Administration",
    tabs: {
      overview: "Languages & i18n",
      users: "Users & Roles",
      management: "KPI & Audit",
    },
    titles: {
      overview: "Language & Translation Administration (MongoDB i18n)",
      users: "User & Role Administration (Users & RBAC)",
      management: "KPI, Management & Audit",
    },
    descriptions: {
      overview:
        "Manage multilingual translation keys and ISO 639-1 dictionaries with 1:1 symmetry to I18nFeature.java.",
      users:
        "Create, inspect, and manage platform users and roles with 1:1 symmetry to UserFeature.java.",
      management:
        "Executive metrics and governance overview with 1:1 symmetry to ManagementFeature.java.",
    },
  },
  fr: {
    badge: "Administration Système",
    tabs: {
      overview: "Langues & i18n",
      users: "Utilisateurs & Rôles",
      management: "KPI & Audit",
    },
    titles: {
      overview: "Administration des Langues & Traductions (MongoDB i18n)",
      users: "Administration Utilisateurs & Rôles (Users & RBAC)",
      management: "KPI, Direction & Audit",
    },
    descriptions: {
      overview:
        "Gérez les clés multilingues et dictionnaires ISO 639-1 en symétrie 1:1 avec I18nFeature.java.",
      users:
        "Créez, inspectez et gérez les utilisateurs et rôles en symétrie 1:1 avec UserFeature.java.",
      management:
        "Indicateurs de pilotage et audit en symétrie 1:1 avec ManagementFeature.java.",
    },
  },
  es: {
    badge: "Administración del Sistema",
    tabs: {
      overview: "Idiomas & i18n",
      users: "Usuarios & Roles",
      management: "KPI & Auditoría",
    },
    titles: {
      overview: "Administración de Idiomas y Traducciones (MongoDB i18n)",
      users: "Administración de Usuarios y Roles (Users & RBAC)",
      management: "KPI, Dirección y Auditoría",
    },
    descriptions: {
      overview:
        "Administra claves multilingües y diccionarios ISO 639-1 en simetría 1:1 con I18nFeature.java.",
      users:
        "Crea, inspecciona y gestiona usuarios y roles en simetría 1:1 con UserFeature.java.",
      management:
        "Indicadores clave y auditoría en simetría 1:1 con ManagementFeature.java.",
    },
  },
  de: {
    badge: "Systemadministration",
    tabs: {
      overview: "Sprachen & i18n",
      users: "Benutzer & Rollen",
      management: "KPI & Audit",
    },
    titles: {
      overview: "Sprach- & Übersetzungsverwaltung (MongoDB i18n)",
      users: "Benutzer- & Rollenverwaltung (Users & RBAC)",
      management: "KPI, Leitung & Audit",
    },
    descriptions: {
      overview:
        "Verwalten Sie mehrsprachige Schlüssel und ISO 639-1-Wörterbücher in 1:1-Symmetrie zu I18nFeature.java.",
      users:
        "Erstellen, prüfen und verwalten Sie Benutzer und Rollen in 1:1-Symmetrie zu UserFeature.java.",
      management:
        "Kennzahlen und Audit-Übersicht in 1:1-Symmetrie zu ManagementFeature.java.",
    },
  },
};

const ADMIN_TAB_ORDER: ReadonlyArray<AdminTab> = [
  "overview",
  "users",
  "management",
];

const AdminContent: React.FC = () => {
  const params = useParams();
  const i18nCache = useI18nCache();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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

  const handleSelectTab = (tab: AdminTab) => {
    const base = pathname || `/${activeLocale}/dashboard/admin`;
    router.replace(tab === "overview" ? base : `${base}?tab=${tab}`);
  };

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
        <div className="flex flex-wrap gap-2" role="tablist">
          {ADMIN_TAB_ORDER.map((tabId) => {
            const isActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`admin-tab-${tabId}`}
                onClick={() => handleSelectTab(tabId)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "bg-teal-700 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {copy.tabs[tabId]}
              </button>
            );
          })}
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
