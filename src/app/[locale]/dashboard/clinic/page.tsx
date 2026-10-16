import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import TherapistMultiWindowWorkspace from "@/components/TherapistMultiWindowWorkspace";

export default async function ClinicPage() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.therapist");
  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="d-flex flex-column gap-4">
      <TherapistMultiWindowWorkspace therapistName={userName} initialTab="clinic_cvr" />
    </div>
  );
}
