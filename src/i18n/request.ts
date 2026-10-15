import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { routing } from './routing';

const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";

function mergeWithFallback(
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
      result[k] = mergeWithFallback(
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

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  let previewHighlight = false;
  let cookieLocale: string | undefined;
  try {
    const cookieStore = await cookies();
    previewHighlight = cookieStore.get('i18n_preview_mode')?.value === '1';
    cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  } catch {
    previewHighlight = false;
  }

  // Ensure that a valid locale is used, falling back to NEXT_LOCALE cookie or defaultLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    if (cookieLocale && routing.locales.includes(cookieLocale as any)) {
      locale = cookieLocale;
    } else {
      locale = routing.defaultLocale;
    }
  }

  const fetchCacheOptions: RequestInit = previewHighlight
    ? { cache: 'no-store' }
    : { next: { revalidate: 300, tags: [`i18n-${locale}`, 'i18n'] } };

  const [res, fallbackRes] = await Promise.all([
    fetch(`${backendUrl}/api/v1/i18n/${locale}`, fetchCacheOptions),
    locale !== 'da'
      ? fetch(`${backendUrl}/api/v1/i18n/da`, fetchCacheOptions)
      : Promise.resolve(null),
  ]);

  if (!res.ok) {
    if (res.status === 404) notFound();
    throw new Error(`Failed to fetch translations for ${locale}`);
  }

  const isFallbackResponse = res.headers.get('X-Locale-Fallback') != null;
  const rawMessages = isFallbackResponse ? {} : await res.json();
  let fallbackMessages: Record<string, any> = {};
  if (fallbackRes && fallbackRes.ok) {
    fallbackMessages = await fallbackRes.json();
  } else if (isFallbackResponse) {
    fallbackMessages = await res.json();
  }

  const messages =
    locale === 'da' && !previewHighlight
      ? rawMessages
      : mergeWithFallback(rawMessages, fallbackMessages, locale, previewHighlight);

  return {
    locale,
    messages,
  };
});

