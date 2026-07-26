import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("inventario");
  return <>{children}</>;
}
