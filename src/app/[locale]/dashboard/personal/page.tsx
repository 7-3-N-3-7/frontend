import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import { SyncedClientPortalWorkspace } from "../DashboardShellBridge";

export default async function PersonalDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  const t = await getTranslations({ locale, namespace: "dashboard.personal" });

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
    <SyncedClientPortalWorkspace
      locale={locale}
      userName={userName}
      secureStatus={secureData?.data || null}
    />
  );
}
