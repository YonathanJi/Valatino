"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserCircle } from "lucide-react";
import { LogoutButton } from "@components/backoffice/LogoutButton";
import { SidebarNav, type SidebarNavItem } from "@components/backoffice/SidebarNav";

interface BackofficeShellProps {
  items: SidebarNavItem[];
  showNoModulos: boolean;
  email: string | null;
  role: string;
  children: React.ReactNode;
}

export function BackofficeShell({
  items,
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

  const darkLink =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white";

  const contenidoSidebar = (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-lg font-bold tracking-tight text-white">Valatino</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          Back-Office
        </p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <SidebarNav items={items} />
        {showNoModulos && (
          <p className="px-3 py-2 text-xs text-zinc-500">
            No tienes módulos asignados. Contacta con un administrador.
          </p>
        )}
      </nav>
      <div className="space-y-1 border-t border-white/10 p-3">
        <Link href="/backoffice/perfil" className={darkLink}>
          <UserCircle className="h-[18px] w-[18px] shrink-0" />
          Mi perfil
        </Link>
        <LogoutButton />
        <div className="px-3 pt-1.5">
          <p className="truncate text-xs text-zinc-400">{email}</p>
          <p className="text-[11px] font-medium capitalize text-orange-400">{role}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="theme-admin flex min-h-screen bg-background">
      {/* Sidebar fijo (escritorio) */}
      <aside className="hidden w-60 shrink-0 flex-col md:flex">{contenidoSidebar}</aside>

      {/* Drawer deslizante (móvil) */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85%] flex-col shadow-2xl">
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
            className="rounded-lg border p-1.5 text-foreground hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-foreground">Valatino</span>
          <span className="text-xs text-muted-foreground">Back-Office</span>
        </header>

        <main className="flex-1 overflow-auto">
          <div key={pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
