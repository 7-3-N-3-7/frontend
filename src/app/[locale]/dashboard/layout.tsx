import { DashboardShellBridge } from "./DashboardShellBridge";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <DashboardShellBridge locale={locale}>{children}</DashboardShellBridge>
  );
}
