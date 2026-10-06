import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";

export default async function TherapistDashboard() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.therapist");
  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>{t("welcome", { name: userName })}</h1>
      </div>

      <div className="row">
        <div className="col-md-12">
          <div className="alert alert-info shadow-sm">
            <h5><i className="bi bi-shield-check"></i> {t("accessGrantedTitle")}</h5>
            <p className="mb-0">{t("accessGrantedDesc")}</p>
            <p className="mb-0" dangerouslySetInnerHTML={{ __html: t("accessGrantedDesc") }}></p>
            <p className="mb-0" dangerouslySetInnerHTML={{ __html: t("accessGrantedDesc") }}></p>
          </div>
        </div>
      </div>

      <div className="row mt-3">
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white">
              <h5 className="mb-0">{t("appointmentsTitle")}</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">{t("appointmentsDesc")}</p>
              <button className="btn btn-primary" disabled>{t("appointmentsButton")}</button>
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-white">
              <h5 className="mb-0">{t("dictionaryTitle")}</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">{t("dictionaryDesc")}</p>
              <button className="btn btn-secondary" disabled>{t("dictionaryButton")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
