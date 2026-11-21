import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DashboardShellBridge } from "./DashboardShellBridge";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, session] = await Promise.all([
    params,
    getServerSession(authOptions),
  ]);
  return (
    <DashboardShellBridge
      locale={locale}
      initialUserName={session?.user?.name ?? undefined}
      initialUserEmail={session?.user?.email ?? undefined}
    >
      {children}
    </DashboardShellBridge>
  );
}
