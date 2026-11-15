import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { CachedI18nProvider } from '@/features/i18n/I18nFeature';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'EduJournal — Klinisk Praksis & Refleksionsportal',
  description: 'Sikker og rolig sundhedsplatform til klinisk journaling, aftalebooking og patientrefleksion',
};

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode,
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  setRequestLocale(locale);

  // Providing all messages to the client (fetched live from backend MongoDB i18n dictionary)
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <CachedI18nProvider initialLocale={locale} initialMessages={messages as Record<string, any>}>
          {children}
        </CachedI18nProvider>
      </body>
    </html>
  );
}

