import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";

export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso) || !puedeVerModulo(acceso, "inventario")) redirect("/backoffice");

  return <>{children}</>;
}
