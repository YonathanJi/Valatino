import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo, etiquetaCargo } from "@lib/auth/staff";
import { BackofficeShell } from "@components/backoffice/BackofficeShell";
import { PermisosProvider } from "@components/backoffice/PermisosProvider";
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
  { modulo: "clientes", href: "/backoffice/clientes", label: "Clientes", iconKey: "clientes" },
  {
    modulo: "contabilidad",
    href: "/backoffice/contabilidad",
    label: "Contabilidad",
    iconKey: "contabilidad",
    children: [
      { href: "/backoffice/contabilidad/iva", label: "Liquidación de IVA", iconKey: "iva" },
      { href: "/backoffice/contabilidad/facturas", label: "Facturas emitidas", iconKey: "facturas" },
    ],
  },
  {
    modulo: "gestion_humana",
    href: "/backoffice/gestion-humana",
    label: "Gestión Humana",
    iconKey: "gestion_humana",
  },
  {
    modulo: "ti",
    href: "/backoffice/ti",
    label: "TI",
    iconKey: "ti",
    children: [
      { href: "/backoffice/ti/usuarios", label: "Usuarios", iconKey: "usuarios" },
      { href: "/backoffice/ti/cargos", label: "Cargos", iconKey: "cargos" },
      { href: "/backoffice/ti/ajustes", label: "Ajustes", iconKey: "ajustes" },
    ],
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
    // Los permisos bajan una sola vez al árbol cliente. Las pantallas los leen
    // con useNivel/usePuede para apagar lo que la API rechazaría, en vez de
    // preguntárselos cada una por su cuenta.
    <PermisosProvider
      userId={acceso.userId}
      rol={acceso.role ?? "cliente"}
      permisos={acceso.permisos}
    >
      <BackofficeShell
        items={visibles}
        showNoModulos={visibles.length === 0 && acceso.role === "asesor"}
        email={acceso.email}
        cargo={etiquetaCargo(acceso)}
      >
        {children}
      </BackofficeShell>
    </PermisosProvider>
  );
}
