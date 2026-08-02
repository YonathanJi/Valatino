import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { AjustesPanel } from "@components/backoffice/AjustesPanel";

export default async function BackofficeAjustesPage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <AjustesPanel />;
}
