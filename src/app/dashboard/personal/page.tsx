import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function PersonalDashboard() {
  const session = await getServerSession(authOptions);
  let secureData = null;
  let backendError = null;

  if ((session as any)?.accessToken) {
    try {
      const res = await fetch("http://backend:8081/api/v1/secure-data", {
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
        cache: "no-store",
      });
      if (res.ok) {
        secureData = await res.json();
      } else {
        backendError = `Backend returned ${res.status}`;
      }
    } catch (e: any) {
      backendError = e.message + " " + e.stack; console.log(e);
    }
  }

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Welcome, {session?.user?.name || 'User'}!</h1>
      </div>

      <div className="row">
        <div className="col-md-8">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-white">
              <h4 className="mb-0">Personal Dashboard</h4>
            </div>
            <div className="card-body">
              <p className="lead">You are currently logged in with a standard personal account.</p>
              
              <div className="mt-4">
                <h5>Backend Integration Test</h5>
                {secureData ? (
                  <div className="alert alert-success mt-2">
                    <strong>Success!</strong> The Spring Boot backend responded using your Keycloak JWT:
                    <p className="mb-0 font-monospace mt-2 bg-light p-2 rounded text-dark">{secureData.data}</p>
                  </div>
                ) : (
                  <div className="alert alert-danger mt-2">
                    <strong>Failed to reach backend:</strong> {backendError || "No session token"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-4">
          <div className="card shadow-sm bg-primary text-white">
            <div className="card-body text-center">
              <h4 className="card-title">Are you a Therapist?</h4>
              <p className="card-text">Upgrade your account to unlock the Therapist Dashboard and manage your practice and appointments.</p>
              <button className="btn btn-light fw-bold mt-2" disabled>Upgrade to Therapist (Coming Soon)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



