import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import { cookies } from 'next/headers';
import { I18nProvider } from '@/components/I18nProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Platform',
  description: 'Server Side Rendered Platform',
};

async function getDictionary(locale: string) {
  try {
    const res = await fetch(\http://localhost:8081/api/v1/i18n/\\, {
      cache: 'no-store' // Ensure we get fresh translations when switching
    });
    if (!res.ok) return {};
    return await res.json();
  } catch (error) {
    console.error('Failed to fetch dictionary', error);
    return {};
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('i18n_locale');
  const locale = localeCookie?.value || 'en';
  
  const dictionary = await getDictionary(locale);

  return (
    <html lang={locale} className={\\ \\}>
      <body>
        <I18nProvider initialLocale={locale} initialDictionary={dictionary}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
