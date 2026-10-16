import PortalWorkspaceShell from '@/components/PortalWorkspaceShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalWorkspaceShell>{children}</PortalWorkspaceShell>;
}
