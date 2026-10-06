import UserDropdown from './UserDropdown';
<<<<<<< HEAD
=======
import LanguageSwitcher from '@/components/LanguageSwitcher';
>>>>>>> origin/dev
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("dashboard.layout");

  return (
    <div className="d-flex" style={{ minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      {/* Sidebar */}
      <div className="bg-white border-end d-flex flex-column" style={{ width: '260px' }}>
        <div className="p-4 d-flex align-items-center border-bottom">
          <div className="d-flex align-items-center">
            <i className="bi bi-hurricane fs-4 me-2 text-success"></i>
            <span className="fs-5 fw-bold text-success">EduJournal</span>
          </div>
        </div>
        
        <div className="flex-grow-1 p-3">
          <div className="text-muted text-uppercase fw-bold mb-2" style={{fontSize: '0.75rem', letterSpacing: '0.5px'}}>{t("main")}</div>
          <ul className="nav flex-column mb-4">
            <li className="nav-item mb-1">
              <Link href="/dashboard/personal" className="nav-link text-dark d-flex align-items-center">
                <i className="bi bi-house-door me-2 text-primary"></i> {t("home")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow-1 d-flex flex-column" style={{ overflowX: 'hidden' }}>
        {/* Top Navbar */}
        <header className="bg-white border-bottom p-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center bg-light rounded px-3 py-2 w-50 ms-3">
            <i className="bi bi-search text-muted me-2"></i>
            <input type="text" className="form-control bg-transparent border-0 shadow-none p-0" placeholder={t("search")} />
          </div>

          <div className="d-flex align-items-center pe-3">
<<<<<<< HEAD
=======
            <LanguageSwitcher />
>>>>>>> origin/dev
            <div className="d-flex align-items-center ms-2 border-start ps-4">
              <UserDropdown />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-grow-1 p-4 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
