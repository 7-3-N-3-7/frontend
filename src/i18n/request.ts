import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from './routing';

const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
 
  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }
 
  const res = await fetch(`${backendUrl}/api/v1/i18n/${locale}`, {
      // Use Next.js fetch cache to avoid hitting the backend on every SSR request
      next: { revalidate: 3600 } 
    });
    
    if (!res.ok) {
      if (res.status === 404) notFound();
      throw new Error(`Failed to fetch translations for ${locale}`);
    }
    
    const messages = await res.json();
    console.log(`Fetched messages for ${locale}:`, Object.keys(messages));
    return {
      locale,
      messages
    };
});
