import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso } from "@lib/auth/staff";
import { UsuariosPanel } from "@components/backoffice/UsuariosPanel";

export default async function BackofficeUsuariosPage() {
  if (!esStaff(await getStaffAcceso())) redirect("/admin");
  return <UsuariosPanel />;
}
