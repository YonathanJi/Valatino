import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { PedidosPanel } from "@components/backoffice/PedidosPanel";

export default async function BackofficePedidosPage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <PedidosPanel />;
}
