import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { ClienteDetallePanel } from "@components/backoffice/ClienteDetallePanel";

export default async function ClienteDetallePage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <ClienteDetallePanel />;
}
