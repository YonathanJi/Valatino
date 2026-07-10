import { redirect } from "next/navigation";
import { getStaffAcceso } from "@lib/auth/staff";

export default async function UsuariosLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (acceso.role !== "admin") redirect("/backoffice");

  return <>{children}</>;
}
