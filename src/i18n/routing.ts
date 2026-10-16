import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const SUPPORTED_LOCALE_CODES = [
  'en',
  'da',
  'fr',
  'es',
  'de',
  'sv',
  'no',
  'nl',
  'it',
  'pl',
  'fi',
  'pt',
  'is',
] as const;

export const routing = defineRouting({
  locales: SUPPORTED_LOCALE_CODES,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

