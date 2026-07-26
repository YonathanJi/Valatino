import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("pedidos");
  return <>{children}</>;
}
