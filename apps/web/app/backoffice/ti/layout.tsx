import { exigirModulo } from "@lib/auth/guard-modulo";

export default async function TILayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("ti");
  return <>{children}</>;
}
