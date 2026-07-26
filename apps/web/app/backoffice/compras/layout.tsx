import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("compras");
  return <>{children}</>;
}
