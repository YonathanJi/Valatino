import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff } from "@lib/auth/staff";
import { StorefrontShell } from "@components/storefront/StorefrontShell";

// Área EXCLUSIVA de clientes: el staff (admin/asesor) tiene su propia área
// en /backoffice (layout, visuales y guards separados) y se redirige allí.
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  let acceso = null;
  try {
    acceso = await getStaffAcceso();
  } catch {
    redirect("/login");
  }

  if (!acceso) redirect("/login");
  if (esStaff(acceso)) redirect("/backoffice/perfil");

  return (
    <StorefrontShell>
      <div className="max-w-4xl mx-auto px-4 py-8">{children}</div>
    </StorefrontShell>
  );
}
