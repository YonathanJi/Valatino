import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function GestionHumanaLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("gestion_humana");
  return <>{children}</>;
}
