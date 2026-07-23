import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";
import { BackofficeShell } from "@components/backoffice/BackofficeShell";
import type { SidebarNavItem } from "@components/backoffice/SidebarNav";
import type { StaffModulo } from "@valatino/types";

const NAV_ITEMS: { modulo: StaffModulo; href: string; label: string; children?: SidebarNavItem["children"] }[] = [
  { modulo: "dashboard", href: "/backoffice/dashboard", label: "📈 Dashboard" },
  { modulo: "pedidos", href: "/backoffice/pedidos", label: "📦 Pedidos" },
  { modulo: "catalogo", href: "/backoffice/catalogo", label: "🛍️ Catálogo" },
  { modulo: "inventario", href: "/backoffice/inventario", label: "📊 Inventario" },
  {
    modulo: "compras",
    href: "/backoffice/compras",
    label: "🛒 Compras",
    children: [{ href: "/backoffice/compras/proveedores", label: "🚚 Proveedores" }],
  },
];

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso)) redirect("/");

  const visibles: SidebarNavItem[] = NAV_ITEMS.filter((item) =>
    puedeVerModulo(acceso, item.modulo),
  ).map(({ href, label, children }) => ({ href, label, children }));

  return (
    <BackofficeShell
      items={visibles}
      isAdmin={acceso.role === "admin"}
      showNoModulos={visibles.length === 0 && acceso.role === "asesor"}
      email={acceso.email}
      role={acceso.role ?? ""}
    >
      {children}
    </BackofficeShell>
  );
}
