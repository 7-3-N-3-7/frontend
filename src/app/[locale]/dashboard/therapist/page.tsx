import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTranslations } from "next-intl/server";
import { SyncedTherapistWorkspace } from "../DashboardShellBridge";

import { TherapistTab } from "@/features/clinic/ClinicPlatformFeature";

const VALID_THERAPIST_TABS: ReadonlySet<string> = new Set([
  "overview",
  "timeline",
  "calendar",
  "clinic_cvr",
  "pcl5",
  "finance",
]);

export default async function TherapistDashboard({
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
  const defaultTab: TherapistTab =
    rawTab && VALID_THERAPIST_TABS.has(rawTab)
      ? (rawTab as TherapistTab)
      : "overview";
  const session = await getServerSession(authOptions);
  const t = await getTranslations({ locale, namespace: "dashboard.therapist" });
  const userName = session?.user?.name || t("defaultUser");

  return (
    <div className="space-y-6">
      <SyncedTherapistWorkspace
        locale={locale}
        therapistName={userName}
        defaultTab={defaultTab}
      />
    </div>
  );
}
