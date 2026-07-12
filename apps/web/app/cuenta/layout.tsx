import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAcceso, esStaff } from "@lib/auth/staff";

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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <nav className="flex gap-4 mb-8 border-b pb-4">
        <Link href="/cuenta/pedidos" className="text-sm hover:text-primary transition-colors">
          Mis pedidos
        </Link>
        <Link href="/cuenta/perfil" className="text-sm hover:text-primary transition-colors">
          Perfil y direcciones
        </Link>
      </nav>
      {children}
    </div>
  );
}
