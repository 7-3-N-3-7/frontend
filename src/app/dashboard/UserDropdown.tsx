"use client";

import { Dropdown } from 'react-bootstrap';
import { signOut } from 'next-auth/react';

export default function UserDropdown() {
  return (
    <Dropdown>
      <Dropdown.Toggle 
        variant="link" 
        id="dropdown-basic" 
        className="d-flex align-items-center text-dark text-decoration-none shadow-none p-0 border-0"
      >
        <i className="bi bi-person-circle fs-4 text-muted me-2"></i>
        <div className="d-flex flex-column line-height-sm text-start" style={{lineHeight: '1.2'}}>
          <span className="fw-semibold" style={{fontSize: '0.9rem'}}>Account</span>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu align="end" className="shadow-sm border-0 mt-2">
        <Dropdown.Item href="/dashboard/settings">
          <i className="bi bi-gear me-2"></i> Account Settings
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item 
          onClick={(e) => {
            e.preventDefault();
            const baseDomain = window.location.hostname.replace('platform.', '');
            const targetUrl = window.location.protocol + "//" + baseDomain + "/";
            signOut({ callbackUrl: targetUrl });
          }} 
          className="text-danger"
        >
          <i className="bi bi-box-arrow-right me-2"></i> Sign Out
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
