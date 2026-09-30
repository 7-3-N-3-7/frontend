import { cookies } from 'next/headers';

async function getDictionary(locale: string) {
  try {
    const res = await fetch(`http://localhost:8081/api/v1/i18n/${locale}`, {
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
      <div className="card shadow p-4">
        <h1 className="display-4 text-center">{dict.nav_overview || 'Overview'}</h1>
        <p className="lead text-center mt-3">
          {dict.content_rendered_msg || 'This content is rendered on the server side using the Spring Boot dictionary!'}
        </p>
      </div>
    </div>
  );
}
