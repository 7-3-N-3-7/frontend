import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function TherapistDashboard() {
  const session = await getServerSession(authOptions);

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Welcome, Therapist {session?.user?.name || ''}!</h1>
      </div>

      <div className="row">
        <div className="col-md-12">
          <div className="alert alert-info shadow-sm">
            <h5><i className="bi bi-shield-check"></i> Therapist Access Granted</h5>
            <p className="mb-0">You have been securely routed to this dashboard because your Keycloak token contains the <code>therapist</code> role.</p>
          </div>
        </div>
      </div>

      <div className="row mt-3">
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white">
              <h5 className="mb-0">Appointment Management</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Manage your patient appointments using our secure MongoDB backend.</p>
              <button className="btn btn-primary" disabled>View Appointments (Coming Soon)</button>
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white">
              <h5 className="mb-0">Dictionary Management</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Edit platform translations powered by our robust PostgreSQL database.</p>
              <button className="btn btn-secondary" disabled>Open i18n Editor (Coming Soon)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
