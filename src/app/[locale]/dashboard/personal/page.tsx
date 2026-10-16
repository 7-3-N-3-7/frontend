import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import ClientPortalWorkspace from "@/components/ClientPortalWorkspace";

export default async function PersonalDashboard() {
  const session = await getServerSession(authOptions);
  const t = await getTranslations("dashboard.personal");

  let secureData = null;

  if ((session as any)?.accessToken) {
    try {
      const backendUrl =
        process.env.BACKEND_INTERNAL_URL || "http://localhost:8081";
      const res = await fetch(`${backendUrl}/api/v1/secure-data`, {
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
        cache: "no-store",
      });
      if (res.ok) {
        secureData = await res.json();
      }
    } catch {
      // Fallback gracefully when running frontend standalone
    }
  }

  const userName = session?.user?.name || t("defaultUser");

  return (
    <ClientPortalWorkspace
      userName={userName}
      secureStatus={secureData?.data || null}
    />
  );
}
