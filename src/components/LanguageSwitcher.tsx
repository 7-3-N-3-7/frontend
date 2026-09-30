'use client';

import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { useI18n } from './I18nProvider';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <Dropdown onSelect={(eventKey) => eventKey && setLocale(eventKey)}>
      <Dropdown.Toggle variant="outline-primary" id="dropdown-language">
        {locale === 'en' ? 'English' : locale === 'da' ? 'Dansk' : 'Language'}
      </Dropdown.Toggle>

      <Dropdown.Menu>
        <Dropdown.Item eventKey="en" active={locale === 'en'}>
          English
        </Dropdown.Item>
        <Dropdown.Item eventKey="da" active={locale === 'da'}>
          Dansk
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
