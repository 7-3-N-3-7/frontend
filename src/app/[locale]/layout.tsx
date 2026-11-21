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

const METADATA_BY_LOCALE: Record<string, { title: string; description: string }> = {
  da: {
    title: 'EduJournal — Klinisk Praksis & Refleksionsportal',
    description: 'Sikker og rolig sundhedsplatform til klinisk journaling, aftalebooking og patientrefleksion',
  },
  en: {
    title: 'EduJournal — Clinical Practice & Reflection Portal',
    description: 'Secure, calm health platform for clinical journaling, appointment booking, and patient reflection',
  },
  fr: {
    title: 'EduJournal — Pratique Clinique & Portail de Réflexion',
    description: 'Plateforme de santé sécurisée pour le suivi clinique, la prise de rendez-vous et le journal patient',
  },
  es: {
    title: 'EduJournal — Práctica Clínica y Portal de Reflexión',
    description: 'Plataforma clínica segura para diario terapéutico, reserva de citas y seguimiento del paciente',
  },
  de: {
    title: 'EduJournal — Klinische Praxis & Reflexionsportal',
    description: 'Sichere Gesundheitsplattform für klinische Dokumentation, Terminbuchung und Patientenreflexion',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const entry = METADATA_BY_LOCALE[locale] || METADATA_BY_LOCALE.en;
  return {
    title: entry.title,
    description: entry.description,
  };
}

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

