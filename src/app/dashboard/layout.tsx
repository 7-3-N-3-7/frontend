export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="d-flex" style={{ minHeight: '100vh', backgroundColor: '#f4f6f9' }}>
      {/* Sidebar */}
      <div className="bg-white border-end d-flex flex-column" style={{ width: '260px' }}>
        <div className="p-4 d-flex align-items-center border-bottom">
          <i className="bi bi-hurricane text-primary fs-3 me-2"></i>
          <span className="fs-4 fw-bold text-primary">Rocker</span>
          <i className="bi bi-arrow-bar-left ms-auto text-muted fs-5 cursor-pointer"></i>
        </div>
        
        <div className="flex-grow-1 overflow-auto p-3">
          <ul className="nav flex-column mb-4">
            <li className="nav-item mb-1">
              <a href="#" className="nav-link bg-primary bg-opacity-10 text-primary rounded fw-semibold d-flex align-items-center">
                <i className="bi bi-house-door me-2"></i> Dashboard
                <i className="bi bi-chevron-down ms-auto" style={{fontSize: '0.8em'}}></i>
              </a>
              <ul className="nav flex-column ms-3 mt-1">
                <li className="nav-item"><a href="#" className="nav-link text-primary py-1"><small>→ Default</small></a></li>
                <li className="nav-item"><a href="#" className="nav-link text-muted py-1"><small>→ Alternate</small></a></li>
              </ul>
            </li>
            <li className="nav-item mb-1">
              <a href="#" className="nav-link text-dark d-flex align-items-center">
                <i className="bi bi-grid-1x2 me-2 text-muted"></i> Application
                <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i>
              </a>
            </li>
          </ul>

          <div className="text-muted text-uppercase fw-bold mb-2" style={{fontSize: '0.75rem', letterSpacing: '0.5px'}}>UI Elements</div>
          <ul className="nav flex-column mb-4">
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-puzzle me-2 text-muted"></i> Widgets</a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-cart3 me-2 text-muted"></i> eCommerce <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-box me-2 text-muted"></i> Components <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-file-earmark-text me-2 text-muted"></i> Content <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-droplet me-2 text-muted"></i> Icons <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
          </ul>

          <div className="text-muted text-uppercase fw-bold mb-2" style={{fontSize: '0.75rem', letterSpacing: '0.5px'}}>Forms & Tables</div>
          <ul className="nav flex-column mb-4">
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-ui-radios me-2 text-muted"></i> Forms <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-table me-2 text-muted"></i> Tables <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
          </ul>

          <div className="text-muted text-uppercase fw-bold mb-2" style={{fontSize: '0.75rem', letterSpacing: '0.5px'}}>Pages</div>
          <ul className="nav flex-column mb-4">
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-lock me-2 text-muted"></i> Authentication <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
            <li className="nav-item mb-1"><a href="#" className="nav-link text-dark d-flex align-items-center"><i className="bi bi-person me-2 text-muted"></i> User Profile <i className="bi bi-chevron-right ms-auto text-muted" style={{fontSize: '0.8em'}}></i></a></li>
          </ul>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow-1 d-flex flex-column" style={{ overflowX: 'hidden' }}>
        {/* Top Navbar */}
        <header className="bg-white border-bottom p-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center bg-light rounded px-3 py-2 w-50 ms-3">
            <i className="bi bi-search text-muted me-2"></i>
            <input type="text" className="form-control bg-transparent border-0 shadow-none p-0" placeholder="Type to search..." />
          </div>

          <div className="d-flex align-items-center pe-3">
            <button className="btn btn-link text-dark p-1 me-3 position-relative">
              <i className="bi bi-grid-3x3-gap fs-5"></i>
            </button>
            <button className="btn btn-link text-dark p-1 me-3 position-relative">
              <i className="bi bi-bell fs-5"></i>
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.6rem' }}>
                7
              </span>
            </button>
            <button className="btn btn-link text-dark p-1 me-4 position-relative">
              <i className="bi bi-chat-left-text fs-5"></i>
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.6rem' }}>
                4
              </span>
            </button>
            <div className="d-flex align-items-center ms-2 border-start ps-4">
              <img src="https://i.pravatar.cc/150?u=pauline" alt="User" className="rounded-circle me-2" style={{width: '40px', height: '40px', objectFit: 'cover'}} />
              <div className="d-flex flex-column line-height-sm" style={{lineHeight: '1.2'}}>
                <span className="fw-semibold" style={{fontSize: '0.9rem'}}>Pauline Seitz</span>
                <span className="text-muted" style={{fontSize: '0.75rem'}}>Web Designer</span>
              </div>
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
