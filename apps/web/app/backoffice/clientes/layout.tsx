import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function ClientesLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("clientes");
  return <>{children}</>;
}
