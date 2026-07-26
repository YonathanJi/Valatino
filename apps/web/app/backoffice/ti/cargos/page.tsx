import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { CargosPanel } from "@components/backoffice/CargosPanel";

export default async function BackofficeCargosPage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <CargosPanel />;
}
