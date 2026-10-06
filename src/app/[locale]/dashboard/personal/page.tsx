import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";

export default async function PersonalDashboard() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.personal");
  
  let secureData = null;
  let backendError = null;

  if ((session as any)?.accessToken) {
    try {
      const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";
      const res = await fetch(`${backendUrl}/api/v1/secure-data`, {
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
      backendError = e.message;
    }
  }

  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>{t("welcome", { name: userName })}</h1>
      </div>

      <div className="row">
        <div className="col-md-8">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-white">
              <h4 className="mb-0">{t("title")}</h4>
            </div>
            <div className="card-body">
              <p className="lead">{t("description")}</p>
              
              <div className="mt-4">
                <h5>{t("integrationTest.title")}</h5>
                {secureData ? (
                  <div className="alert alert-success mt-2">
                    <strong>{t("integrationTest.success")}</strong> {t("integrationTest.successMessage")}
                    <p className="mb-0 font-monospace mt-2 bg-light p-2 rounded text-dark">{secureData.data}</p>
                  </div>
                ) : (
                  <div className="alert alert-danger mt-2">
                    <strong>{t("integrationTest.failed")}</strong> {backendError || t("integrationTest.noSession")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-4">
          <div className="card shadow-sm bg-primary text-white">
            <div className="card-body text-center">
              <h4 className="card-title">{t("upsell.title")}</h4>
              <p className="card-text">{t("upsell.description")}</p>
              <button className="btn btn-light fw-bold mt-2" disabled>{t("upsell.button")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



