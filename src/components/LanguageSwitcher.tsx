'use client';

import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleSelect = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <Dropdown onSelect={(eventKey) => eventKey && handleSelect(eventKey)}>
      <Dropdown.Toggle variant="outline-primary" id="dropdown-language">
        {locale === 'en' ? 'English' : locale === 'da' ? 'Dansk' : locale === 'es' ? 'Español' : locale === 'fr' ? 'Français' : locale === 'de' ? 'Deutsch' : locale.toUpperCase()}
      </Dropdown.Toggle>

      <Dropdown.Menu>
        <Dropdown.Item eventKey="en" active={locale === 'en'}>
          English
        </Dropdown.Item>
        <Dropdown.Item eventKey="da" active={locale === 'da'}>
          Dansk
        </Dropdown.Item>
        <Dropdown.Item eventKey="es" active={locale === 'es'}>
          Español
        </Dropdown.Item>
        <Dropdown.Item eventKey="fr" active={locale === 'fr'}>
          Français
        </Dropdown.Item>
        <Dropdown.Item eventKey="de" active={locale === 'de'}>
          Deutsch
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
