import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";

export default async function PedidosLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso) || !puedeVerModulo(acceso, "pedidos")) redirect("/backoffice");

  return <>{children}</>;
}
