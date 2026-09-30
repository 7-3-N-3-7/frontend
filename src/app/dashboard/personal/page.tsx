import { cookies } from 'next/headers';

async function getDictionary(locale: string) {
  try {
    const res = await fetch(`http://backend:8081/api/v1/i18n/${locale}`, {
      cache: 'no-store'
    });
    if (!res.ok) return {};
    return await res.json();
  } catch (error) {
    return {};
  }
}

export default async function Dashboard() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('i18n_locale');
  const locale = localeCookie?.value || 'en';
  
  const dict = await getDictionary(locale);

  return (
    <div className="container-fluid p-0">
      {/* Top Cards */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 border-start border-4 border-info">
            <div className="card-body d-flex justify-content-between align-items-center p-4">
              <div>
                <p className="text-muted mb-1 fw-semibold">Total Orders</p>
                <h3 className="text-info fw-bold mb-1">4805</h3>
                <small className="text-muted"><span className="text-success">+2.5%</span> from last week</small>
              </div>
              <div className="bg-info bg-gradient bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center" style={{width: '50px', height: '50px'}}>
                <i className="bi bi-cart3 text-white fs-4"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 border-start border-4 border-danger">
            <div className="card-body d-flex justify-content-between align-items-center p-4">
              <div>
                <p className="text-muted mb-1 fw-semibold">Total Revenue</p>
                <h3 className="text-danger fw-bold mb-1">$84,245</h3>
                <small className="text-muted"><span className="text-success">+5.4%</span> from last week</small>
              </div>
              <div className="bg-danger bg-gradient bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center" style={{width: '50px', height: '50px'}}>
                <i className="bi bi-wallet2 text-white fs-4"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 border-start border-4 border-success">
            <div className="card-body d-flex justify-content-between align-items-center p-4">
              <div>
                <p className="text-muted mb-1 fw-semibold">Bounce Rate</p>
                <h3 className="text-success fw-bold mb-1">34.6%</h3>
                <small className="text-muted"><span className="text-danger">-4.5%</span> from last week</small>
              </div>
              <div className="bg-success bg-gradient bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center" style={{width: '50px', height: '50px'}}>
                <i className="bi bi-bar-chart text-white fs-4"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 border-start border-4 border-warning">
            <div className="card-body d-flex justify-content-between align-items-center p-4">
              <div>
                <p className="text-muted mb-1 fw-semibold">Total Customers</p>
                <h3 className="text-warning fw-bold mb-1">8.4K</h3>
                <small className="text-muted"><span className="text-success">+8.4%</span> from last week</small>
              </div>
              <div className="bg-warning bg-gradient bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center" style={{width: '50px', height: '50px'}}>
                <i className="bi bi-people text-white fs-4"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: Charts */}
      <div className="row g-4 mb-4">
        {/* Bar Chart Mockup */}
        <div className="col-md-8">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 fw-bold">Sales Overview</h5>
              <i className="bi bi-three-dots text-muted cursor-pointer fs-5"></i>
            </div>
            <div className="d-flex mb-4">
              <span className="me-3 d-flex align-items-center" style={{fontSize: '0.85rem'}}><span className="d-inline-block rounded-circle bg-primary me-2" style={{width:'8px',height:'8px'}}></span> Sales</span>
              <span className="d-flex align-items-center" style={{fontSize: '0.85rem'}}><span className="d-inline-block rounded-circle bg-warning me-2" style={{width:'8px',height:'8px'}}></span> Visits</span>
            </div>
            
            {/* Fake Chart area */}
            <div className="position-relative w-100 border-bottom border-start d-flex align-items-end justify-content-around pb-2" style={{height: '220px', borderColor: '#eee'}}>
              {/* Y-axis labels */}
              <div className="position-absolute d-flex flex-column justify-content-between h-100 text-muted" style={{left: '-25px', top: 0, fontSize: '0.7rem'}}>
                <span>90</span><span>80</span><span>70</span><span>60</span><span>50</span><span>40</span><span>30</span><span>20</span><span>10</span>
              </div>
              {/* Bars */}
              {[
                { s: 65, v: 25, label: 'Jan' },
                { s: 58, v: 48, label: 'Feb' },
                { s: 80, v: 40, label: 'Mar' },
                { s: 80, v: 18, label: 'Apr' },
                { s: 65, v: 28, label: 'May' },
                { s: 58, v: 48, label: 'Jun' },
                { s: 78, v: 40, label: 'Jul' },
                { s: 80, v: 15, label: 'Aug' },
                { s: 58, v: 40, label: 'Sep' },
                { s: 80, v: 18, label: 'Oct' },
                { s: 82, v: 28, label: 'Nov' },
                { s: 65, v: 48, label: 'Dec' },
              ].map((item, i) => (
                <div key={i} className="d-flex align-items-end h-100 position-relative" style={{width: '20px'}}>
                  <div className="bg-primary rounded-top" style={{height: `${item.s}%`, width: '8px', opacity: 0.8}}></div>
                  <div className="bg-warning rounded-top ms-1" style={{height: `${item.v}%`, width: '8px', opacity: 0.8}}></div>
                  <span className="position-absolute text-muted" style={{bottom: '-25px', fontSize: '0.75rem', left: '50%', transform: 'translateX(-50%)'}}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Bottom Stats */}
            <div className="row mt-5 pt-3 border-top text-center">
              <div className="col-4 border-end">
                <h4 className="fw-bold mb-1">24.15M</h4>
                <small className="text-muted">Overall Visitor <span className="text-success">+ 2.43%</span></small>
              </div>
              <div className="col-4 border-end">
                <h4 className="fw-bold mb-1">12:38</h4>
                <small className="text-muted">Visitor Duration <span className="text-success">+ 12.65%</span></small>
              </div>
              <div className="col-4">
                <h4 className="fw-bold mb-1">639.82</h4>
                <small className="text-muted">Pages/Visit <span className="text-success">+ 5.62%</span></small>
              </div>
            </div>
          </div>
        </div>

        {/* Donut Chart Mockup */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 fw-bold">Trending Products</h5>
              <i className="bi bi-three-dots text-muted cursor-pointer fs-5"></i>
            </div>
            
            <div className="d-flex justify-content-center align-items-center my-4">
              {/* CSS Donut Chart */}
              <div style={{
                width: '200px', height: '200px', borderRadius: '50%',
                background: 'conic-gradient(#5cb85c 0% 25%, #d9534f 25% 45%, #f0ad4e 45% 60%, #5bc0de 60% 70%, #6f42c1 70% 100%)',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%',
                  backgroundColor: 'white', borderRadius: '50%'
                }}></div>
              </div>
            </div>

            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <span className="text-muted" style={{fontSize: '0.9rem'}}>Jeans</span>
                <span className="badge bg-success rounded-pill px-3 py-2">25</span>
              </div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <span className="text-muted" style={{fontSize: '0.9rem'}}>T-Shirts</span>
                <span className="badge bg-danger rounded-pill px-3 py-2">18</span>
              </div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <span className="text-muted" style={{fontSize: '0.9rem'}}>Shoes</span>
                <span className="badge bg-primary rounded-pill px-3 py-2">65</span>
              </div>
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-muted" style={{fontSize: '0.9rem'}}>Lingerie</span>
                <span className="badge bg-warning rounded-pill px-3 py-2">14</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="card border-0 shadow-sm rounded-3 p-4 mb-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 fw-bold">Recent Orders</h5>
          <i className="bi bi-three-dots text-muted cursor-pointer fs-5"></i>
        </div>
        <div className="table-responsive">
          <table className="table table-borderless align-middle mb-0">
            <thead className="border-bottom">
              <tr>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Product</th>
                <th className="text-muted fw-semibold pb-3 text-center" style={{fontSize: '0.85rem'}}>Photo</th>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Product ID</th>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Status</th>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Amount</th>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Date</th>
                <th className="text-muted fw-semibold pb-3" style={{fontSize: '0.85rem'}}>Shipping</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="fw-semibold">Iphone 5</td>
                <td className="text-center">
                  <div className="bg-light rounded p-2 d-inline-block">
                    <i className="bi bi-phone fs-4 text-dark"></i>
                  </div>
                </td>
                <td className="text-muted">#9405822</td>
                <td><span className="badge bg-success bg-opacity-25 text-success px-3 py-2 rounded-pill">Paid</span></td>
                <td className="fw-semibold">$1250.00</td>
                <td className="text-muted">03 Feb 2020</td>
                <td>
                  <div className="progress" style={{height: '6px', width: '60px'}}>
                    <div className="progress-bar bg-success" role="progressbar" style={{width: '100%'}}></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
