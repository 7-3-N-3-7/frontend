import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

interface I18nContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, fallback?: string) => string;
  isLoading: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  // Try to load locale from localStorage, default to 'en'
  const [locale, setLocale] = useState<string>(() => {
    return localStorage.getItem('app_locale') || 'en';
  });

  // Update localStorage when locale changes
  useEffect(() => {
    localStorage.setItem('app_locale', locale);
  }, [locale]);

  // Fetch dictionary from backend
  const { data: dictionary, isLoading } = useQuery({
    queryKey: ['i18n', locale],
    queryFn: async () => {
      // Assuming Vite proxy routes /api to the backend
      const res = await fetch(`/api/v1/i18n/${locale}`);
      if (!res.ok) {
        if (res.status === 404) return {};
        throw new Error('Failed to load dictionary');
      }
      return res.json() as Promise<Record<string, string>>;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const t = (key: string, fallback?: string) => {
    if (!dictionary) return fallback || key;
    return dictionary[key] || fallback || key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, isLoading }}>
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
