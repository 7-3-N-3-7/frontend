import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import TherapistMultiWindowWorkspace from "@/components/TherapistMultiWindowWorkspace";

export default async function TherapistDashboard() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.therapist");
  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="d-flex flex-column gap-4">
      <div className="card border-0 shadow-xs rounded-4 bg-white">
        <div className="card-body p-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div>
            <span className="badge bg-success-subtle text-success rounded-pill px-3 py-1 mb-2">
              <i className="bi bi-hospital me-1"></i> {t("accessGrantedTitle")}
            </span>
            <h1 className="h3 fw-bold text-dark mb-1">
              {t("welcome", { name: userName })}
            </h1>
            <p
              className="text-muted small mb-0"
              dangerouslySetInnerHTML={{ __html: String(t.raw("accessGrantedDesc")) }}
            />
          </div>
        </div>
      </div>

      <TherapistMultiWindowWorkspace therapistName={userName} />
    </div>
  );
}
