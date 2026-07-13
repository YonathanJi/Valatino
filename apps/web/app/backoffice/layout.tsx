import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";
import { LogoutButton } from "@components/backoffice/LogoutButton";
import type { StaffModulo } from "@valatino/types";

const NAV_ITEMS: { modulo: StaffModulo; href: string; label: string }[] = [
  { modulo: "dashboard", href: "/backoffice/dashboard", label: "📈 Dashboard" },
  { modulo: "pedidos", href: "/backoffice/pedidos", label: "📦 Pedidos" },
  { modulo: "catalogo", href: "/backoffice/catalogo", label: "🛍️ Catálogo" },
  { modulo: "inventario", href: "/backoffice/inventario", label: "📊 Inventario" },
];

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso)) redirect("/");

  const visibles = NAV_ITEMS.filter((item) => puedeVerModulo(acceso, item.modulo));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col">
        <div className="px-4 py-5 border-b">
          <p className="font-bold text-primary">Valatino</p>
          <p className="text-xs text-muted-foreground">Back-Office</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {visibles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              {item.label}
            </Link>
          ))}
          {acceso.role === "admin" && (
            <Link
              href="/backoffice/usuarios"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              👥 Usuarios
            </Link>
          )}
          {visibles.length === 0 && acceso.role === "asesor" && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No tienes módulos asignados. Contacta con un administrador.
            </p>
          )}
        </nav>
        <div className="p-3 border-t space-y-1">
          <Link
            href="/backoffice/perfil"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            👤 Mi perfil
          </Link>
          <LogoutButton />
          <p className="text-xs text-muted-foreground px-3">{acceso.email}</p>
          <p className="text-xs font-medium text-primary px-3 capitalize">{acceso.role}</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  );
}
