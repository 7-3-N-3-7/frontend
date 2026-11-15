import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import { SyncedTherapistWorkspace } from "../DashboardShellBridge";

export default async function TherapistDashboard() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.therapist");
  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="space-y-6">
      <SyncedTherapistWorkspace therapistName={userName} />
    </div>
  );
}
