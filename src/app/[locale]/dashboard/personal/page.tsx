import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import { ClientTab } from "@/features/clinic/ClinicPlatformFeature";
import { SyncedClientPortalWorkspace } from "../DashboardShellBridge";

const VALID_CLIENT_TABS: ReadonlySet<string> = new Set([
  "overview",
  "appointments",
  "journal",
  "marketplace",
  "consents",
  "pcl5",
  "finance",
]);

export default async function PersonalDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const [{ locale }, resolvedSearch] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { tab?: string }),
  ]);
  const rawTab = resolvedSearch?.tab;
  const defaultTab: ClientTab =
    rawTab && VALID_CLIENT_TABS.has(rawTab)
      ? (rawTab as ClientTab)
      : "overview";
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

  const rawSecure = typeof secureData?.data === "string" ? secureData.data.trim() : "";
  const secureStatus =
    rawSecure && !/sensitive enterprise data/i.test(rawSecure)
      ? rawSecure
      : null;

  return (
    <SyncedClientPortalWorkspace
      locale={locale}
      userName={userName}
      secureStatus={secureStatus}
      defaultTab={defaultTab}
    />
  );
}
