import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";
import { BackofficeShell } from "@components/backoffice/BackofficeShell";
import type { SidebarNavItem } from "@components/backoffice/SidebarNav";
import type { StaffModulo } from "@valatino/types";

const NAV_ITEMS: {
  modulo: StaffModulo;
  href: string;
  label: string;
  iconKey: string;
  children?: SidebarNavItem["children"];
}[] = [
  { modulo: "dashboard", href: "/backoffice/dashboard", label: "Dashboard", iconKey: "dashboard" },
  { modulo: "pedidos", href: "/backoffice/pedidos", label: "Pedidos", iconKey: "pedidos" },
  { modulo: "catalogo", href: "/backoffice/catalogo", label: "Catálogo", iconKey: "catalogo" },
  { modulo: "inventario", href: "/backoffice/inventario", label: "Inventario", iconKey: "inventario" },
  {
    modulo: "compras",
    href: "/backoffice/compras",
    label: "Compras",
    iconKey: "compras",
    children: [
      { href: "/backoffice/compras/proveedores", label: "Proveedores", iconKey: "proveedores" },
    ],
  },
  {
    modulo: "gestion_humana",
    href: "/backoffice/gestion-humana",
    label: "Gestión Humana",
    iconKey: "gestion_humana",
  },
];

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso)) redirect("/");

  const visibles: SidebarNavItem[] = NAV_ITEMS.filter((item) =>
    puedeVerModulo(acceso, item.modulo),
  ).map(({ href, label, iconKey, children }) => ({ href, label, iconKey, children }));

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
