'use client';

import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';

const LOCALE_LABELS: Record<string, { label: string; flag: string }> = {
  da: { label: 'Dansk', flag: '🇩🇰' },
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  es: { label: 'Español', flag: '🇪🇸' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleSelect = (newLocale: string) => {
    if (!newLocale || newLocale === locale) return;
    router.replace(pathname, { locale: newLocale });
    router.refresh();
  };

  const current = LOCALE_LABELS[locale] || { label: locale.toUpperCase(), flag: '🌐' };

  return (
    <Dropdown onSelect={(eventKey) => eventKey && handleSelect(eventKey)} align="end">
      <Dropdown.Toggle
        variant="light"
        id="dropdown-language"
        className="border rounded-pill px-3 py-1.5 fw-medium d-inline-flex align-items-center gap-2 shadow-xs"
        style={{ fontSize: '0.85rem' }}
      >
        <span>{current.flag}</span>
        <span>{current.label}</span>
      </Dropdown.Toggle>

      <Dropdown.Menu className="shadow-sm border rounded-3 py-1">
        {Object.entries(LOCALE_LABELS).map(([code, info]) => (
          <Dropdown.Item
            key={code}
            eventKey={code}
            active={locale === code}
            onClick={() => handleSelect(code)}
            className="d-flex align-items-center justify-content-between gap-3 px-3 py-1.5"
            style={{ fontSize: '0.85rem' }}
          >
            <span>
              <span className="me-2">{info.flag}</span>
              {info.label}
            </span>
            {locale === code && <i className="bi bi-check2 fw-bold"></i>}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

