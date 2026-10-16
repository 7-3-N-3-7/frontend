"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { NextIntlClientProvider } from "next-intl";

const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const PREVIEW_COOKIE_NAME = "i18n_preview_mode";
const MESSAGE_CACHE_PREFIX = "edujournal_i18n_messages_v2_";
const LOCALES_LIST_CACHE_KEY = "edujournal_i18n_locales_list_v2";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes client cache TTL

// In-memory cache across SPA route transitions so navigating never re-downloads
const memoryMessagesCache = new Map<string, Record<string, any>>();
let memoryLocalesListCache: any[] | null = null;
let memoryMeCache: { data: any; timestamp: number } | null = null;

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function setLocaleCookie(locale: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(
    locale
  )}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function mergeWithFallbackClient(
  target: Record<string, any>,
  fallback: Record<string, any>,
  locale: string,
  previewHighlight: boolean,
  prefix = ""
): Record<string, any> {
  const result: Record<string, any> = { ...(target || {}) };
  if (!fallback || typeof fallback !== "object") return result;

  for (const [k, fallbackVal] of Object.entries(fallback)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    const targetVal = result[k];

    if (fallbackVal && typeof fallbackVal === "object" && !Array.isArray(fallbackVal)) {
      result[k] = mergeWithFallbackClient(
        targetVal && typeof targetVal === "object" ? targetVal : {},
        fallbackVal,
        locale,
        previewHighlight,
        fullKey
      );
    } else {
      const hasTranslation =
        targetVal !== undefined &&
        targetVal !== null &&
        String(targetVal).trim() !== "";
      if (!hasTranslation) {
        result[k] = previewHighlight
          ? `⚠️ [Mangler ${locale.toUpperCase()}: ${fullKey}] ${String(fallbackVal ?? "")}`
          : fallbackVal;
      }
    }
  }
  return result;
}

interface I18nCacheContextValue {
  locale: string;
  messages: Record<string, any>;
  isSwitchingLocale: boolean;
  switchLocale: (nextLocale: string) => Promise<void>;
  invalidateI18nCache: (targetLocale?: string) => void;
  getCachedLocalesList: () => Promise<any[]>;
  getCachedMe: (forceRefresh?: boolean) => Promise<any>;
}

const I18nCacheContext = createContext<I18nCacheContextValue | null>(null);

export function useI18nCache() {
  return useContext(I18nCacheContext);
}

export function CachedI18nProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: string;
  initialMessages: Record<string, any>;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<string>(initialLocale);
  const [messages, setMessages] = useState<Record<string, any>>(initialMessages);
  const [isSwitchingLocale, setIsSwitchingLocale] = useState(false);

  // Seed memory & localStorage cache with the initial SSR-rendered locale + messages
  useEffect(() => {
    const previewMode = getCookieValue(PREVIEW_COOKIE_NAME) === "1";
    const cacheKey = `${initialLocale}_${previewMode ? "preview" : "std"}`;
    memoryMessagesCache.set(cacheKey, initialMessages);
    try {
      localStorage.setItem(
        `${MESSAGE_CACHE_PREFIX}${cacheKey}`,
        JSON.stringify({
          timestamp: Date.now(),
          messages: initialMessages,
        })
      );
    } catch {
      // Ignore storage quota errors
    }

    // Ensure NEXT_LOCALE cookie is set so future full-page requests serve the cached locale directly
    const existingCookie = getCookieValue(LOCALE_COOKIE_NAME);
    if (!existingCookie) {
      setLocaleCookie(initialLocale);
    }
  }, [initialLocale, initialMessages]);

  // Keep state synced if URL-driven initialLocale changes from outside
  useEffect(() => {
    if (initialLocale && initialLocale !== locale) {
      const previewMode = getCookieValue(PREVIEW_COOKIE_NAME) === "1";
      const cacheKey = `${initialLocale}_${previewMode ? "preview" : "std"}`;
      const cached = memoryMessagesCache.get(cacheKey) || initialMessages;
      setLocale(initialLocale);
      setMessages(cached);
    }
  }, [initialLocale]);

  const fetchLocaleMessages = useCallback(
    async (targetLocale: string, forceRefresh = false): Promise<Record<string, any>> => {
      const previewMode = getCookieValue(PREVIEW_COOKIE_NAME) === "1";
      const cacheKey = `${targetLocale}_${previewMode ? "preview" : "std"}`;

      if (!forceRefresh) {
        const memHit = memoryMessagesCache.get(cacheKey);
        if (memHit) return memHit;

        try {
          const raw = localStorage.getItem(`${MESSAGE_CACHE_PREFIX}${cacheKey}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed?.messages &&
              typeof parsed.timestamp === "number" &&
              Date.now() - parsed.timestamp < CACHE_TTL_MS
            ) {
              memoryMessagesCache.set(cacheKey, parsed.messages);
              return parsed.messages;
            }
          }
        } catch {
          // Ignore storage read error
        }
      }

      // Download ONLY the language dictionary JSON from the backend (not the whole HTML page!)
      const [res, fallbackRes] = await Promise.all([
        fetch(`/api/backend/i18n/${encodeURIComponent(targetLocale)}`, {
          cache: forceRefresh ? "no-store" : "default",
        }),
        targetLocale !== "da"
          ? fetch("/api/backend/i18n/da", {
              cache: forceRefresh ? "no-store" : "default",
            })
          : Promise.resolve(null),
      ]);

      if (!res.ok) {
        throw new Error(`Kunne ikke hente sprogpakke for ${targetLocale}`);
      }

      const isFallbackResponse = res.headers.get("X-Locale-Fallback") != null;
      const rawMessages = isFallbackResponse ? {} : await res.json();
      let fallbackMessages: Record<string, any> = {};
      if (fallbackRes && fallbackRes.ok) {
        fallbackMessages = await fallbackRes.json();
      } else if (isFallbackResponse) {
        fallbackMessages = rawMessages;
      }

      const merged =
        targetLocale === "da" && !previewMode
          ? rawMessages
          : mergeWithFallbackClient(rawMessages, fallbackMessages, targetLocale, previewMode);

      memoryMessagesCache.set(cacheKey, merged);
      try {
        localStorage.setItem(
          `${MESSAGE_CACHE_PREFIX}${cacheKey}`,
          JSON.stringify({
            timestamp: Date.now(),
            messages: merged,
          })
        );
      } catch {
        // Ignore storage write error
      }

      return merged;
    },
    []
  );

  const switchLocale = useCallback(
    async (nextLocale: string) => {
      if (!nextLocale || nextLocale === locale) return;
      setIsSwitchingLocale(true);
      try {
        // 1. Persist choice in NEXT_LOCALE cookie so subsequent SSR/cached page loads include this language
        setLocaleCookie(nextLocale);

        // 2. Download ONLY the language JSON (or read from client cache) without re-downloading the HTML page
        const nextMsgs = await fetchLocaleMessages(nextLocale, false);
        setLocale(nextLocale);
        setMessages(nextMsgs);

        // 3. Update the browser URL & <html lang="..."> in-place so the underlying DOM stays cached
        if (typeof window !== "undefined") {
          document.documentElement.lang = nextLocale;
          const currentPath = window.location.pathname;
          const localeRegex = /^\/(en|da|fr|es|de|sv|no|nl|it|pl|fi|pt|is)(?=\/|$)/;
          const nextPath = localeRegex.test(currentPath)
            ? currentPath.replace(localeRegex, `/${nextLocale}`)
            : `/${nextLocale}${currentPath.startsWith("/") ? "" : "/"}${currentPath}`;
          window.history.replaceState(window.history.state, "", `${nextPath}${window.location.search}${window.location.hash}`);
        }
      } catch {
        // Fallback if dictionary fetch fails
      } finally {
        setIsSwitchingLocale(false);
      }
    },
    [locale, fetchLocaleMessages]
  );

  const invalidateI18nCache = useCallback((targetLocale?: string) => {
    memoryLocalesListCache = null;
    if (targetLocale) {
      memoryMessagesCache.delete(`${targetLocale}_std`);
      memoryMessagesCache.delete(`${targetLocale}_preview`);
    } else {
      memoryMessagesCache.clear();
    }
    try {
      localStorage.removeItem(LOCALES_LIST_CACHE_KEY);
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(MESSAGE_CACHE_PREFIX)) {
          if (!targetLocale || k.includes(`${MESSAGE_CACHE_PREFIX}${targetLocale}_`)) {
            keysToDelete.push(k);
          }
        }
      }
      keysToDelete.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }, []);

  const getCachedLocalesList = useCallback(async (): Promise<any[]> => {
    if (memoryLocalesListCache) return memoryLocalesListCache;
    try {
      const raw = localStorage.getItem(LOCALES_LIST_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          Array.isArray(parsed?.list) &&
          typeof parsed.timestamp === "number" &&
          Date.now() - parsed.timestamp < CACHE_TTL_MS
        ) {
          memoryLocalesListCache = parsed.list;
          return parsed.list;
        }
      }
    } catch {
      // ignore
    }

    const res = await fetch("/api/backend/i18n/locales");
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        memoryLocalesListCache = list;
        try {
          localStorage.setItem(
            LOCALES_LIST_CACHE_KEY,
            JSON.stringify({ timestamp: Date.now(), list })
          );
        } catch {
          // ignore
        }
        return list;
      }
    }
    return [];
  }, []);

  const getCachedMe = useCallback(async (forceRefresh = false): Promise<any> => {
    if (
      !forceRefresh &&
      memoryMeCache &&
      Date.now() - memoryMeCache.timestamp < 30_000
    ) {
      return memoryMeCache.data;
    }
    const res = await fetch("/api/backend/clinic/me");
    if (res.ok) {
      const data = await res.json();
      memoryMeCache = { data, timestamp: Date.now() };
      return data;
    }
    return null;
  }, []);

  const contextValue = useMemo<I18nCacheContextValue>(
    () => ({
      locale,
      messages,
      isSwitchingLocale,
      switchLocale,
      invalidateI18nCache,
      getCachedLocalesList,
      getCachedMe,
    }),
    [
      locale,
      messages,
      isSwitchingLocale,
      switchLocale,
      invalidateI18nCache,
      getCachedLocalesList,
      getCachedMe,
    ]
  );

  return (
    <I18nCacheContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </I18nCacheContext.Provider>
  );
}
