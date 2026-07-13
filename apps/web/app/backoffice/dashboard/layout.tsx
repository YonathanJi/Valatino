import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";

// Seguimiento gerencial: admin siempre; asesores solo con el módulo "dashboard"
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso)) redirect("/");
  if (!puedeVerModulo(acceso, "dashboard")) redirect("/backoffice");

  return <>{children}</>;
}
