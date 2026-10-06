"use client";

import { Dropdown } from 'react-bootstrap';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export default function UserDropdown() {
  const t = useTranslations("dashboard.dropdown");

  return (
    <Dropdown>
      <Dropdown.Toggle 
        variant="link" 
        id="dropdown-basic" 
        className="d-flex align-items-center text-dark text-decoration-none shadow-none p-0 border-0"
      >
        <i className="bi bi-person-circle fs-4 text-muted me-2"></i>
        <div className="d-flex flex-column line-height-sm text-start" style={{lineHeight: '1.2'}}>
          <span className="fw-semibold" style={{fontSize: '0.9rem'}}>{t("account")}</span>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu align="end" className="shadow-sm border-0 mt-2">
        <Dropdown.Item 
          onClick={(e) => {
            e.preventDefault();
            const baseDomain = window.location.hostname.replace('platform.', '');
            const targetUrl = window.location.protocol + "//" + baseDomain + "/";
            signOut({ callbackUrl: targetUrl });
          }} 
          className="text-danger"
        >
          <i className="bi bi-box-arrow-right me-2"></i> {t("signOut")}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
