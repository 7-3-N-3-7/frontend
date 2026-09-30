'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface I18nContextType {
  locale: string;
  dictionary: Record<string, string>;
  setLocale: (newLocale: string) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ 
  initialLocale, 
  initialDictionary, 
  children 
}: { 
  initialLocale: string, 
  initialDictionary: Record<string, string>, 
  children: ReactNode 
}) => {
  const [locale, setLocaleState] = useState(initialLocale);
  const router = useRouter();

  const setLocale = (newLocale: string) => {
    // Set a cookie so the server knows the preference on the next request
    document.cookie = `i18n_locale=${newLocale}; path=/; max-age=31536000`;
    setLocaleState(newLocale);
    
    // Refresh the current route to re-trigger Server Components and fetch the new dictionary
    router.refresh();
  };

  const t = (key: string, fallback?: string) => {
    return initialDictionary[key] || fallback || key;
  };

  return (
    <I18nContext.Provider value={{ locale, dictionary: initialDictionary, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
