import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("dashboard");
  return <>{children}</>;
}
