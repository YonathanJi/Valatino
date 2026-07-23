"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@components/backoffice/LogoutButton";
import { SidebarNav, type SidebarNavItem } from "@components/backoffice/SidebarNav";

interface BackofficeShellProps {
  items: SidebarNavItem[];
  isAdmin: boolean;
  showNoModulos: boolean;
  email: string | null;
  role: string;
  children: React.ReactNode;
}

export function BackofficeShell({
  items,
  isAdmin,
  showNoModulos,
  email,
  role,
  children,
}: BackofficeShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer al navegar a otra ruta.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const linkCls =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors";

  const contenidoSidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5 border-b">
        <p className="font-bold text-primary">Valatino</p>
        <p className="text-xs text-muted-foreground">Back-Office</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <SidebarNav items={items} />
        {isAdmin && (
          <Link href="/backoffice/usuarios" className={linkCls}>
            👥 Usuarios
          </Link>
        )}
        {showNoModulos && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No tienes módulos asignados. Contacta con un administrador.
          </p>
        )}
      </nav>
      <div className="p-3 border-t space-y-1">
        <Link href="/backoffice/perfil" className={linkCls}>
          👤 Mi perfil
        </Link>
        <LogoutButton />
        <p className="text-xs text-muted-foreground px-3 truncate">{email}</p>
        <p className="text-xs font-medium text-primary px-3 capitalize">{role}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar fijo (escritorio) */}
      <aside className="hidden md:flex w-56 shrink-0 border-r bg-card flex-col">
        {contenidoSidebar}
      </aside>

      {/* Drawer deslizante (móvil) */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] flex-col border-r bg-card shadow-lg">
            {contenidoSidebar}
          </aside>
        </div>
      )}

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior con hamburguesa (solo móvil) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="rounded-lg border px-2.5 py-1.5 text-lg leading-none hover:bg-muted"
          >
            ☰
          </button>
          <span className="font-bold text-primary">Valatino</span>
          <span className="text-xs text-muted-foreground">Back-Office</span>
        </header>

        <main className="flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
