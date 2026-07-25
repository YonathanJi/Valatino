import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff } from "@lib/auth/staff";
import { PedidosPanel } from "@components/backoffice/PedidosPanel";

// El rol se resuelve en el servidor (user_roles, nunca metadata) y se pasa al
// panel: determina qué transiciones de estado se ofrecen. El layout ya protege
// la ruta; esto es el guard defensivo y la fuente del rol.
export default async function BackofficePedidosPage() {
  const acceso = await getStaffAcceso();
  if (!esStaff(acceso)) redirect("/admin");

  return <PedidosPanel rol={acceso.role === "admin" ? "admin" : "asesor"} />;
}
