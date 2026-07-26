import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("catalogo");
  return <>{children}</>;
}
