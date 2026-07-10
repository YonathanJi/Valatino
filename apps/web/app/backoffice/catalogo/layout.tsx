import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";

export default async function CatalogoLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso) || !puedeVerModulo(acceso, "catalogo")) redirect("/backoffice");

  return <>{children}</>;
}
