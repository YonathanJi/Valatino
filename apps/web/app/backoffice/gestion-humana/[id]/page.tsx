import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { EmpleadoDetallePanel } from "@components/backoffice/EmpleadoDetallePanel";

export default async function EmpleadoDetallePage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <EmpleadoDetallePanel />;
}
