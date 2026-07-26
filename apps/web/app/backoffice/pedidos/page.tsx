import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso, nivelEn } from "@lib/auth/staff";
import { PedidosPanel } from "@components/backoffice/PedidosPanel";

// El nivel se resuelve en el servidor (staff_modulos, nunca metadata) y se pasa
// al panel: determina qué transiciones se ofrecen y si aparece el reembolso. El
// layout ya protege la ruta; esto es el guard defensivo y la fuente del nivel.
export default async function BackofficePedidosPage() {
  const acceso = await getStaffAcceso();
  if (!esStaff(acceso)) redirect("/admin");

  return <PedidosPanel nivel={nivelEn(acceso, "pedidos") ?? "lectura"} />;
}
