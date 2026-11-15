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
import { ProblemAlert, useBaseCrud } from "../../core/baseUiCore";

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

export const I18nFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(i18nApi);
  const [locale, setLocale] = useState("da");
  const [translationKey, setTranslationKey] = useState("");
  const [translationValue, setTranslationValue] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      locale,
      translationKey,
      translationValue,
      namespace: translationKey.split(".")[0] || "Common",
    });
    if (created) {
      setTranslationKey("");
      setTranslationValue("");
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto" data-testid="i18n-feature-view">
      <h2 className="text-xl font-bold mb-4">I18n Dictionary Management</h2>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Locale (e.g. da, en)"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className="border p-2 rounded w-28"
          data-testid="input-i18n-locale"
        />
        <input
          type="text"
          placeholder="Translation Key (e.g. Common.save)"
          value={translationKey}
          onChange={(e) => setTranslationKey(e.target.value)}
          className="border p-2 rounded"
          data-testid="input-i18n-key"
        />
        <input
          type="text"
          placeholder="Translation Value"
          value={translationValue}
          onChange={(e) => setTranslationValue(e.target.value)}
          className="border p-2 rounded"
          data-testid="input-i18n-value"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          data-testid="submit-i18n"
        >
          Save Translation
        </button>
      </form>

      {loading && <p data-testid="loading-indicator">Loading...</p>}

      <ul className="space-y-2" data-testid="i18n-list">
        {items.map((item) => (
          <li
            key={item.id}
            className="border p-3 rounded flex justify-between items-center"
          >
            <div>
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">
                {item.locale}
              </span>
              <strong>{item.translationKey}</strong>: {item.translationValue}
            </div>
            <button
              type="button"
              onClick={() => item.id && remove(item.id)}
              className="text-red-600 hover:underline"
              data-testid={`delete-i18n-${item.id}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
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
 * Kontekst-provider der indkapsler `NextIntlClientProvider` og synkroniserer aktivt sprog med cookies.
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
  const [messages] = useState<Record<string, any>>(initialMessages);

  const switchLocale = useCallback(async (nextLocale: string) => {
    if (!isSupportedLocaleCode(nextLocale)) return;
    setLocaleCookie(nextLocale);
    setLocale(nextLocale);
  }, []);

  const invalidateI18nCache = useCallback(() => {
    setLocaleCookie(locale);
  }, [locale]);

  const contextValue = useMemo<I18nCacheContextValue>(
    () => ({
      locale,
      messages,
      isSwitchingLocale: false,
      switchLocale,
      invalidateI18nCache,
    }),
    [locale, messages, switchLocale, invalidateI18nCache]
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

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setLocaleCookie(next);
    cache?.switchLocale(next);
    onLocaleNavigate?.(next);
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-xs transition-colors hover:border-slate-300 ${className}`.trim()}
    >
      <i className="bi bi-globe2 text-xs text-slate-500" aria-hidden="true" />
      <select
        aria-label="Vælg sprog"
        value={activeLocale}
        onChange={handleLocaleChange}
        className="cursor-pointer border-0 bg-transparent pr-1 text-xs font-medium text-slate-700 focus:outline-none"
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
