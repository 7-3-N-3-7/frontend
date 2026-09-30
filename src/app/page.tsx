import LanguageSwitcher from '@/components/LanguageSwitcher';
import { cookies } from 'next/headers';

async function getDictionary(locale: string) {
  try {
    const res = await fetch(\http://localhost:8081/api/v1/i18n/\\, {
      cache: 'no-store'
    });
    if (!res.ok) return {};
    return await res.json();
  } catch (error) {
    return {};
  }
}

export default async function Home() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('i18n_locale');
  const locale = localeCookie?.value || 'en';
  
  const dict = await getDictionary(locale);

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>{dict['nav_overview'] || 'Overview'}</h1>
        <LanguageSwitcher />
      </div>
      
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Next.js + Turbopack + React Bootstrap</h5>
          <p className="card-text">
            This dashboard is fully server-side rendered. The translation string above is securely fetched 
            from the Spring Boot API during the SSR phase!
          </p>
        </div>
      </div>
    </div>
  );
}
