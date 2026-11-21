"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: I18nFeature.tsx (Vertical Feature Slice — Polyglot i18n)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/i18n/I18nFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: I18nFeature]. Håndterer redigering
 * af MongoDB-sprogordbøger (`i18n_dictionaries`), ISO 639-1 sprogkodevalidering,
 * rekursiv fallback-fletning mod dansk referencesprog samt reaktiv sprogskifter.
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: I18nDictionaryDto], [Record/DTO: TranslationUpdateRequest] &
 *      [Record/DTO: LocaleSummary]
 *   2. Klient-side Domænevalidering (#isSupportedLocaleCode(locale)) &
 *      Rekursiv Fallback (#mergeWithFallbackClient(targetDictionary, fallbackDictionary, ...))
 *   3. [Service: I18nApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<I18nDictionaryDto, string>] og
 *      validerer `locale`, `translationKey` og `translationValue` i #validateBeforeCreate(dto).
 *   4. [Hook: useBaseCrud<I18nDictionaryDto, string>(i18nApi)] & [Hook: useI18nCache()]
 *   5. [Component: <I18nFeatureView />], [Component: <CachedI18nProvider />] &
 *      [Component: <LanguageSwitcher />]
 * ============================================================================
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
} from "../../core/baseDomainCore";
import { ConfirmActionDialog, ProblemAlert, useBaseCrud } from "../../core/baseUiCore";

// ==========================================
// 1. DTOs & DOMAIN MODELS (1:1 with I18nFeature.java)
// ==========================================

export interface I18nDictionaryDto extends HasId<string> {
  id?: string;
  locale: string;
  namespace?: string;
  translationKey: string;
  translationValue: string;
  updatedAt?: string;
}

export interface TranslationUpdateRequest {
  locale: string;
  translationKey: string;
  translationValue: string;
}

export interface LocaleSummary {
  locale: string;
  name?: string;
  displayName?: string;
  nativeName?: string;
  flag: string;
  enabled?: boolean;
  published?: boolean;
  completionPct?: number;
  completionPercentage?: number;
  translatedKeys?: number;
  totalKeys?: number;
}

export const SUPPORTED_LOCALES = [
  "da",
  "en",
  "de",
  "sv",
  "no",
  "fr",
  "es",
  "it",
] as const;

export const I18N_PAGE_SIZE = 25;

export type SupportedUiLocale = "da" | "en" | "fr" | "es" | "de";

const UI_LOCALE_LOOKUP: Record<string, SupportedUiLocale> = {
  da: "da",
  en: "en",
  fr: "fr",
  es: "es",
  de: "de",
};

/**
 * Normaliserer en valgfri sprogstreng (fx "es-ES" eller undefined) til én af de 5 UI-lokaliteter.
 * Returnerer "da" som standard ved manglende kontekst (matcher SSR og standalone unit-tests).
 */
export function resolveUiLocale(raw?: string | null): SupportedUiLocale {
  if (!raw) return "da";
  const prefix = raw.trim().split(/[-_]/)[0].toLowerCase();
  return UI_LOCALE_LOOKUP[prefix] ?? "en";
}

/**
 * Reaktiv hook til at aflæse den aktive UI-lokalitet nul-branch-sikkert i alle Vertical Slice views.
 */
export function useUiLocale(override?: string | null): SupportedUiLocale {
  const cache = useI18nCache();
  return resolveUiLocale(override ?? cache?.locale);
}

/**
 * Validerer at en sprogkode overholder ISO 639-1 (f.eks. "da", "en" eller "en-GB").
 */
export function isSupportedLocaleCode(locale: string): boolean {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test((locale || "").trim());
}

// ==========================================
// 2. INFRASTRUCTURE / API SERVICE (Module-Private)
// Notice: NO 'export' keyword! Strictly encapsulated.
// ==========================================

class I18nApiService extends BaseApiService<I18nDictionaryDto, string> {
  constructor() {
    super("/api/backend/i18n");
  }

  /**
   * Pre-condition hook (Template Method):
   * Sikrer at sprogkode, nøgle og oversættelsesværdi er udfyldt og gyldige før POST.
   */
  protected override validateBeforeCreate(
    dto: Partial<I18nDictionaryDto>
  ): void {
    DomainGuard.requireNotBlank(dto.locale, "Locale code", "locale");
    DomainGuard.check(
      isSupportedLocaleCode(dto.locale!),
      "Locale code must be a valid ISO 639-1 code (e.g. 'da', 'en')",
      ErrorCode.VALIDATION_FAILED,
      "locale"
    );
    DomainGuard.requireNotBlank(
      dto.translationKey,
      "Translation key",
      "translationKey"
    );
    DomainGuard.requireNotBlank(
      dto.translationValue,
      "Translation value",
      "translationValue"
    );
  }
}

const i18nApi = new I18nApiService();

// ==========================================
// 3. PRESENTATION / UI COMPONENT (Exported)
// ==========================================

interface I18nViewCopy {
  badge: string;
  heading: string;
  localePlaceholder: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  saveBtn: string;
  loadingText: string;
  deleteBtn: string;
  switcherAriaLabel: string;
  searchPlaceholder: string;
  allLocalesBtn: string;
  showingCountLabel: string;
  emptyFilterText: string;
  pageLabel: string;
  prevPageBtn: string;
  nextPageBtn: string;
  deleteConfirmTitle: string;
  deleteConfirmDesc: string;
  cancelBtn: string;
}

const I18N_VIEW_COPY: Record<SupportedUiLocale, I18nViewCopy> = {
  da: {
    badge: "Lokalisering",
    heading: "Sprogordbog & Oversættelser (i18n)",
    localePlaceholder: "Sprogkode (f.eks. da, en)",
    keyPlaceholder: "Nøgle (f.eks. Common.save)",
    valuePlaceholder: "Oversættelsestekst",
    saveBtn: "Gem oversættelse",
    loadingText: "Indlæser...",
    deleteBtn: "Slet",
    switcherAriaLabel: "Vælg sprog",
    searchPlaceholder: "Søg nøgle eller tekst...",
    allLocalesBtn: "Alle sprog",
    showingCountLabel: "nøgler",
    emptyFilterText: "Ingen oversættelser matcher dit søgefilter.",
    pageLabel: "Side",
    prevPageBtn: "Forrige",
    nextPageBtn: "Næste",
    deleteConfirmTitle: "Slet oversættelse?",
    deleteConfirmDesc: "Nøglen fjernes permanent fra sprogordbogen.",
    cancelBtn: "Annuller",
  },
  en: {
    badge: "Localization",
    heading: "I18n Dictionary Management",
    localePlaceholder: "Locale (e.g. da, en)",
    keyPlaceholder: "Key (e.g. Common.save)",
    valuePlaceholder: "Translation Value",
    saveBtn: "Save Translation",
    loadingText: "Loading...",
    deleteBtn: "Delete",
    switcherAriaLabel: "Select language",
    searchPlaceholder: "Search key or text...",
    allLocalesBtn: "All locales",
    showingCountLabel: "keys",
    emptyFilterText: "No translations match your filter.",
    pageLabel: "Page",
    prevPageBtn: "Previous",
    nextPageBtn: "Next",
    deleteConfirmTitle: "Delete translation?",
    deleteConfirmDesc: "This translation key will be permanently removed from the dictionary.",
    cancelBtn: "Cancel",
  },
  fr: {
    badge: "Localisation",
    heading: "Gestion du Dictionnaire i18n",
    localePlaceholder: "Code langue (ex. fr, en)",
    keyPlaceholder: "Clé (ex. Common.save)",
    valuePlaceholder: "Valeur traduite",
    saveBtn: "Enregistrer",
    loadingText: "Chargement...",
    deleteBtn: "Supprimer",
    switcherAriaLabel: "Choisir la langue",
    searchPlaceholder: "Rechercher une clé ou un texte...",
    allLocalesBtn: "Toutes les langues",
    showingCountLabel: "clés",
    emptyFilterText: "Aucune traduction ne correspond à votre filtre.",
    pageLabel: "Page",
    prevPageBtn: "Précédent",
    nextPageBtn: "Suivant",
    deleteConfirmTitle: "Supprimer la traduction ?",
    deleteConfirmDesc: "Cette clé sera supprimée définitivement du dictionnaire.",
    cancelBtn: "Annuler",
  },
  es: {
    badge: "Localización",
    heading: "Gestión del Diccionario i18n",
    localePlaceholder: "Idioma (ej. es, en)",
    keyPlaceholder: "Clave (ej. Common.save)",
    valuePlaceholder: "Texto traducido",
    saveBtn: "Guardar traducción",
    loadingText: "Cargando...",
    deleteBtn: "Eliminar",
    switcherAriaLabel: "Seleccionar idioma",
    searchPlaceholder: "Buscar clave o texto...",
    allLocalesBtn: "Todos los idiomas",
    showingCountLabel: "claves",
    emptyFilterText: "Ninguna traducción coincide con su filtro.",
    pageLabel: "Página",
    prevPageBtn: "Anterior",
    nextPageBtn: "Siguiente",
    deleteConfirmTitle: "¿Eliminar traducción?",
    deleteConfirmDesc: "Esta clave se eliminará permanentemente del diccionario.",
    cancelBtn: "Cancelar",
  },
  de: {
    badge: "Lokalisierung",
    heading: "i18n-Wörterbuchverwaltung",
    localePlaceholder: "Sprachcode (z. B. de, en)",
    keyPlaceholder: "Schlüssel (z. B. Common.save)",
    valuePlaceholder: "Übersetzungstext",
    saveBtn: "Übersetzung speichern",
    loadingText: "Wird geladen...",
    deleteBtn: "Löschen",
    switcherAriaLabel: "Sprache wählen",
    searchPlaceholder: "Schlüssel oder Text suchen...",
    allLocalesBtn: "Alle Sprachen",
    showingCountLabel: "Schlüssel",
    emptyFilterText: "Keine Übersetzungen entsprechen Ihrem Filter.",
    pageLabel: "Seite",
    prevPageBtn: "Zurück",
    nextPageBtn: "Weiter",
    deleteConfirmTitle: "Übersetzung löschen?",
    deleteConfirmDesc: "Dieser Übersetzungsschlüssel wird dauerhaft aus dem Wörterbuch entfernt.",
    cancelBtn: "Abbrechen",
  },
};

export const I18nFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(i18nApi);
  const i18nCache = useI18nCache();
  const uiLocale = useUiLocale();
  const copy = I18N_VIEW_COPY[uiLocale];
  const [locale, setLocale] = useState("da");
  const [translationKey, setTranslationKey] = useState("");
  const [translationValue, setTranslationValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [pendingDelete, setPendingDelete] = useState<I18nDictionaryDto | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (localeFilter !== "all" && item.locale.toLowerCase() !== localeFilter) {
      return false;
    }
    if (!normalizedQuery) return true;
    return (
      item.translationKey.toLowerCase().includes(normalizedQuery) ||
      item.translationValue.toLowerCase().includes(normalizedQuery)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / I18N_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice(
    (currentPage - 1) * I18N_PAGE_SIZE,
    currentPage * I18N_PAGE_SIZE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      locale,
      translationKey,
      translationValue,
      namespace: translationKey.split(".")[0] || "Common",
    });
    if (created) {
      i18nCache?.invalidateI18nCache(locale);
      setTranslationKey("");
      setTranslationValue("");
    }
  };

  return (
    <div
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      data-testid="i18n-feature-view"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
          <i className="bi bi-translate" aria-hidden="true" />
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
          placeholder={copy.localePlaceholder}
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className="min-h-11 w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-i18n-locale"
        />
        <input
          type="text"
          placeholder={copy.keyPlaceholder}
          value={translationKey}
          onChange={(e) => setTranslationKey(e.target.value)}
          className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-i18n-key"
        />
        <input
          type="text"
          placeholder={copy.valuePlaceholder}
          value={translationValue}
          onChange={(e) => setTranslationValue(e.target.value)}
          className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-i18n-value"
        />
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          data-testid="submit-i18n"
        >
          {copy.saveBtn}
        </button>
      </form>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <input
            type="search"
            aria-label={copy.searchPlaceholder}
            placeholder={copy.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            data-testid="input-i18n-search"
          />
          <span
            data-testid="i18n-filtered-count"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
          >
            {filteredItems.length} / {items.length} {copy.showingCountLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setLocaleFilter("all");
              setPage(1);
            }}
            data-testid="filter-i18n-locale-all"
            className={`min-h-11 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              localeFilter === "all"
                ? "bg-teal-700 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {copy.allLocalesBtn}
          </button>
          {SUPPORTED_LOCALES.map((loc) => {
            const localeCount = items.filter(
              (item) => item.locale.toLowerCase() === loc
            ).length;
            const isCoreLocale =
              loc === "da" || loc === "en" || loc === "de" || loc === "fr" || loc === "es";
            if (!isCoreLocale && localeCount === 0 && localeFilter !== loc) {
              return null;
            }
            const chipClass =
              localeFilter === loc
                ? "bg-teal-700 text-white"
                : localeCount === 0
                  ? "border border-dashed border-slate-200 bg-white/70 text-slate-400 hover:bg-slate-100"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100";
            return (
              <button
                key={loc}
                type="button"
                onClick={() => {
                  setLocaleFilter(loc);
                  setPage(1);
                }}
                data-testid={`filter-i18n-locale-${loc}`}
                className={`min-h-11 min-w-11 rounded-lg px-3 py-2 text-xs font-semibold uppercase transition-colors ${chipClass}`}
              >
                {loc}
              </button>
            );
          })}
        </div>
      </div>

      {loading && (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      )}

      {!loading && filteredItems.length === 0 ? (
        <p
          data-testid="i18n-empty-filter"
          className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-600"
        >
          {copy.emptyFilterText}
        </p>
      ) : (
        <ul className="list-none space-y-2 pl-0" style={{ paddingLeft: 0 }} data-testid="i18n-list">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
            >
              <div>
                <span className="mr-2 rounded-md bg-slate-200/80 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                  {item.locale}
                </span>
                <strong className="text-slate-900">{item.translationKey}</strong>:{" "}
                <span className="text-slate-700">{item.translationValue}</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                data-testid={`delete-i18n-${item.id}`}
              >
                {copy.deleteBtn}
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"
          data-testid="i18n-pagination"
        >
          <span className="text-xs font-medium text-slate-600">
            {copy.pageLabel} {currentPage} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              data-testid="i18n-prev-page"
            >
              {copy.prevPageBtn}
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              data-testid="i18n-next-page"
            >
              {copy.nextPageBtn}
            </button>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(pendingDelete)}
        title={copy.deleteConfirmTitle}
        description={
          pendingDelete
            ? `${copy.deleteConfirmDesc} (${pendingDelete.locale}: ${pendingDelete.translationKey})`
            : copy.deleteConfirmDesc
        }
        confirmLabel={copy.deleteBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target?.id && (await remove(target.id))) {
            i18nCache?.invalidateI18nCache(target.locale);
          }
        }}
      />
    </div>
  );
};

// ==========================================
// 4. COOKIE HELPERS, FALLBACK MERGE & CONTEXT PROVIDER
// ==========================================

const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/**
 * Læser en navngiven cookie fra `document.cookie`.
 */
export function getCookieValue(name: string): string | null {
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Gemmer det valgte sprog i `NEXT_LOCALE` cookien (1 års levetid).
 */
export function setLocaleCookie(locale: string): void {
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(
    locale
  )}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

/**
 * Rekursiv sammenfletning af et målsprog (`target`) med dansk referencesprog (`fallback`).
 * Hvis en nøgle mangler på målsproget, indsættes fallback-værdien (eller en tydelig ⚠️ markør i preview-mode).
 */
export function mergeWithFallbackClient(
  targetDictionary: Record<string, any>,
  fallbackDictionary: Record<string, any>,
  locale: string,
  previewHighlight: boolean,
  keyPrefix = ""
): Record<string, any> {
  const mergedDictionary: Record<string, any> = { ...(targetDictionary || {}) };
  if (!fallbackDictionary || typeof fallbackDictionary !== "object") {
    return mergedDictionary;
  }

  for (const [keySegment, defaultDanishValue] of Object.entries(fallbackDictionary)) {
    const dotSeparatedKey = keyPrefix ? `${keyPrefix}.${keySegment}` : keySegment;
    const translatedValue = mergedDictionary[keySegment];

    if (
      defaultDanishValue &&
      typeof defaultDanishValue === "object" &&
      !Array.isArray(defaultDanishValue)
    ) {
      mergedDictionary[keySegment] = mergeWithFallbackClient(
        translatedValue && typeof translatedValue === "object" ? translatedValue : {},
        defaultDanishValue,
        locale,
        previewHighlight,
        dotSeparatedKey
      );
    } else {
      const hasTranslation =
        translatedValue !== undefined &&
        translatedValue !== null &&
        String(translatedValue).trim() !== "";
      if (!hasTranslation) {
        mergedDictionary[keySegment] = previewHighlight
          ? `⚠️ [Mangler ${locale.toUpperCase()}: ${dotSeparatedKey}] ${String(
              defaultDanishValue ?? ""
            )}`
          : defaultDanishValue;
      }
    }
  }
  return mergedDictionary;
}

export interface I18nCacheContextValue {
  locale: string;
  messages: Record<string, any>;
  isSwitchingLocale: boolean;
  switchLocale: (nextLocale: string) => Promise<void>;
  invalidateI18nCache: (targetLocale?: string) => void;
}

const I18nCacheContext = createContext<I18nCacheContextValue | null>(null);

export function useI18nCache(): I18nCacheContextValue | null {
  return useContext(I18nCacheContext);
}

/**
 * Henter og fletter live-oversættelser for målsproget via BFF mod `/api/backend/i18n/{locale}`.
 */
async function fetchMergedLocaleMessages(
  targetLocale: string
): Promise<Record<string, any> | null> {
  try {
    const previewHighlight = getCookieValue("i18n_preview_mode") === "1";
    const res = await fetch(
      `/api/backend/i18n/${encodeURIComponent(targetLocale)}`,
      { cache: "no-store" }
    );
    if (!res?.ok || typeof res.json !== "function") return null;
    const targetDict = await res.json();
    if (targetLocale === "da" && !previewHighlight) {
      return targetDict;
    }
    const fallbackRes = await fetch("/api/backend/i18n/da", {
      cache: "no-store",
    });
    const fallbackDict =
      fallbackRes?.ok && typeof fallbackRes.json === "function"
        ? await fallbackRes.json()
        : {};
    return mergeWithFallbackClient(
      targetDict,
      fallbackDict,
      targetLocale,
      previewHighlight
    );
  } catch {
    return null;
  }
}

/**
 * Kontekst-provider der indkapsler `NextIntlClientProvider` og synkroniserer aktivt sprog med cookies og live backend-ordbog.
 */
export function CachedI18nProvider({
  initialLocale = "da",
  initialMessages,
  children,
}: {
  initialLocale?: string;
  initialMessages: Record<string, any>;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<string>(initialLocale);
  const [messages, setMessages] = useState<Record<string, any>>(initialMessages);
  const [isSwitchingLocale, setIsSwitchingLocale] = useState<boolean>(false);

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const refreshLocaleMessages = useCallback(async (targetLocale: string) => {
    setIsSwitchingLocale(true);
    const nextMessages = await fetchMergedLocaleMessages(targetLocale);
    if (nextMessages) {
      setMessages(nextMessages);
    }
    setIsSwitchingLocale(false);
  }, []);

  const switchLocale = useCallback(
    async (nextLocale: string) => {
      if (!isSupportedLocaleCode(nextLocale)) return;
      setLocaleCookie(nextLocale);
      setLocale(nextLocale);
      await refreshLocaleMessages(nextLocale);
    },
    [refreshLocaleMessages]
  );

  const invalidateI18nCache = useCallback(
    (targetLocale?: string) => {
      const effective = targetLocale || locale;
      setLocaleCookie(effective);
      void refreshLocaleMessages(effective);
    },
    [locale, refreshLocaleMessages]
  );

  const contextValue = useMemo<I18nCacheContextValue>(
    () => ({
      locale,
      messages,
      isSwitchingLocale,
      switchLocale,
      invalidateI18nCache,
    }),
    [locale, messages, isSwitchingLocale, switchLocale, invalidateI18nCache]
  );

  return (
    <I18nCacheContext.Provider value={contextValue}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="Europe/Copenhagen"
      >
        {children}
      </NextIntlClientProvider>
    </I18nCacheContext.Provider>
  );
}

const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "da", label: "🇩🇰 Dansk (DA)" },
  { code: "en", label: "🇬🇧 English (EN)" },
  { code: "fr", label: "🇫🇷 Français (FR)" },
  { code: "es", label: "🇪🇸 Español (ES)" },
  { code: "de", label: "🇩🇪 Deutsch (DE)" },
];

export interface LanguageSwitcherProps {
  currentLocale?: string;
  onLocaleNavigate?: (nextLocale: string) => void;
  className?: string;
}

/**
 * Letvægts-sprogvælger til topnavigationen i Landing og Dashboard.
 * Understøtter alle 5 aktive sprog (da, en, fr, es, de) og valgfri Next.js route-navigation.
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  currentLocale,
  onLocaleNavigate,
  className = "",
}) => {
  const cache = useI18nCache();
  const activeLocale = currentLocale || cache?.locale || "da";
  const uiLocale = resolveUiLocale(activeLocale);
  const copy = I18N_VIEW_COPY[uiLocale];
  const activeOption = LANGUAGE_OPTIONS.find((option) => option.code === uiLocale)!;

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setLocaleCookie(next);
    cache?.switchLocale(next);
    onLocaleNavigate?.(next);
  };

  return (
    <div
      className={`relative inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-xs transition-colors hover:border-slate-300 focus-within:border-teal-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700 ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none inline-flex items-center gap-1.5 text-xs font-medium leading-none text-slate-700"
      >
        <i className="bi bi-globe2 shrink-0 text-xs text-slate-500" />
        <span className="whitespace-nowrap">{activeOption.label}</span>
        <i className="bi bi-chevron-down shrink-0 text-[10px] text-slate-400" />
      </span>
      <select
        aria-label={copy.switcherAriaLabel}
        value={uiLocale}
        onChange={handleLocaleChange}
        className="absolute -inset-px h-11 min-h-11 w-[calc(100%+2px)] cursor-pointer appearance-none opacity-0 focus:outline-none"
        data-testid="language-switcher-select"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
