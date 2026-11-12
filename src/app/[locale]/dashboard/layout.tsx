import { ConnectedPortalWorkspaceShell as PortalWorkspaceShell } from '@/features/clinic/ClinicPlatformFeature';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalWorkspaceShell>{children}</PortalWorkspaceShell>;
}
