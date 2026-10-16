'use client';

import React, { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useI18nCache, setLocaleCookie } from '@/components/CachedI18nProvider';

const DEFAULT_LOCALE_LABELS: Record<string, { label: string; flag: string; published?: boolean; completionPct?: number }> = {
  da: { label: 'Dansk', flag: '🇩🇰', published: true, completionPct: 100 },
  en: { label: 'English', flag: '🇬🇧', published: true, completionPct: 100 },
  fr: { label: 'Français', flag: '🇫🇷', published: true, completionPct: 100 },
  es: { label: 'Español', flag: '🇪🇸', published: true, completionPct: 100 },
  de: { label: 'Deutsch', flag: '🇩🇪', published: true, completionPct: 100 },
};

export default function LanguageSwitcher() {
  const intlLocale = useLocale();
  const i18nCache = useI18nCache();
  const locale = i18nCache?.locale || intlLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [localesMap, setLocalesMap] = useState(DEFAULT_LOCALE_LABELS);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const hasCookie =
      typeof document !== 'undefined' &&
      document.cookie.split(';').some((c) => c.trim().startsWith('i18n_preview_mode=1'));
    setPreviewMode(hasCookie);

    const loadList = i18nCache?.getCachedLocalesList
      ? i18nCache.getCachedLocalesList()
      : fetch('/api/backend/i18n/locales').then((r) => (r.ok ? r.json() : []));

    loadList
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          const next: Record<string, { label: string; flag: string; published?: boolean; completionPct?: number }> = {};
          for (const item of list) {
            if (!item?.locale) continue;
            next[item.locale] = {
              label: item.displayName || DEFAULT_LOCALE_LABELS[item.locale]?.label || item.locale.toUpperCase(),
              flag: item.flag || DEFAULT_LOCALE_LABELS[item.locale]?.flag || '🌐',
              published: item.published !== false,
              completionPct: typeof item.completionPct === 'number' ? item.completionPct : 100,
            };
          }
          if (Object.keys(next).length > 0) {
            setLocalesMap(next);
          }
        }
      })
      .catch(() => {});
  }, [i18nCache]);

  const handleSelect = async (newLocale: string) => {
    if (!newLocale || newLocale === locale) return;
    setLocaleCookie(newLocale);

    // If CachedI18nProvider is active, keep the underlying HTML cached in memory
    // and download ONLY the language dictionary JSON on click
    if (i18nCache?.switchLocale) {
      await i18nCache.switchLocale(newLocale);
      return;
    }

    router.replace(pathname, { locale: newLocale });
  };

  const togglePreviewCookie = (enable: boolean) => {
    if (typeof document === 'undefined') return;
    document.cookie = `i18n_preview_mode=${enable ? '1' : '0'}; path=/; max-age=${enable ? 86400 : 0}`;
    setPreviewMode(enable);
    i18nCache?.invalidateI18nCache();
    router.refresh();
  };

  const visibleEntries = Object.entries(localesMap).filter(
    ([code, info]) => info.published !== false || previewMode || code === locale
  );

  const current = localesMap[locale] || DEFAULT_LOCALE_LABELS[locale] || {
    label: locale.toUpperCase(),
    flag: '🌐',
    published: true,
  };

  return (
    <div className="d-inline-flex align-items-center gap-2">
      {previewMode && (
        <span
          className="badge bg-warning text-dark border border-warning-subtle rounded-pill px-2.5 py-1 d-inline-flex align-items-center gap-1"
          style={{ fontSize: '0.75rem' }}
          title="Forhåndsvisning af oversættelser er aktiv — manglende nøgler i MongoDB fremhæves med ⚠️"
        >
          <span>⚠️ Sprog-Preview Aktiv</span>
          <button
            type="button"
            onClick={() => togglePreviewCookie(false)}
            className="btn btn-link btn-sm p-0 ms-1 text-dark text-decoration-none fw-bold"
            style={{ fontSize: '0.72rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </span>
      )}

      <Dropdown onSelect={(eventKey) => eventKey && handleSelect(eventKey)} align="end">
        <Dropdown.Toggle
          variant="light"
          id="dropdown-language"
          className="border rounded-pill px-3 py-1.5 fw-medium d-inline-flex align-items-center gap-2 shadow-xs"
          style={{ fontSize: '0.85rem' }}
          disabled={i18nCache?.isSwitchingLocale}
        >
          <span>{current.flag}</span>
          <span>{current.label}</span>
          {current.published === false && (
            <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.65rem' }}>
              Kladde
            </span>
          )}
        </Dropdown.Toggle>

        <Dropdown.Menu className="shadow-sm border rounded-3 py-1" style={{ minWidth: '220px' }}>
          {visibleEntries.map(([code, info]) => (
            <Dropdown.Item
              key={code}
              eventKey={code}
              active={locale === code}
              onClick={() => handleSelect(code)}
              className="d-flex align-items-center justify-content-between gap-3 px-3 py-1.5"
              style={{ fontSize: '0.85rem' }}
            >
              <span className="d-flex align-items-center gap-2">
                <span>{info.flag}</span>
                <span>{info.label}</span>
                {info.published === false && (
                  <span className="badge bg-warning text-dark" style={{ fontSize: '0.65rem' }}>
                    Kladde ({info.completionPct ?? 0}%)
                  </span>
                )}
              </span>
              {locale === code && <i className="bi bi-check2 fw-bold"></i>}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}


