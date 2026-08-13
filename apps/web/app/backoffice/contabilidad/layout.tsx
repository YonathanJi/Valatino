import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("contabilidad");
  return <>{children}</>;
}
