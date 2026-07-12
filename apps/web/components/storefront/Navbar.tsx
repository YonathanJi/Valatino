"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, User, LogOut, Package, Settings, LayoutDashboard } from "lucide-react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { obtenerRol, esRolStaff } from "@lib/auth/rol";
import { useCarrito } from "@lib/hooks/useCarrito";
import { Button } from "@components/ui/button";
import { toast } from "sonner";

export function Navbar() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const { carrito } = useCarrito();
  const [userData, setUserData] = useState<{ email?: string; nombre?: string; role?: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemCount = carrito?.items.reduce((sum, i) => sum + i.cantidad, 0) ?? 0;

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata as { nombre?: string } | undefined;
        const role = await obtenerRol(supabase, user.id);
        setUserData({ email: user.email, nombre: meta?.nombre, role });
      }
    };
    void load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata as { nombre?: string } | undefined;
        // setState inmediato con datos básicos; rol en cuanto responda la BD
        setUserData({ email: session.user.email, nombre: meta?.nombre });
        void obtenerRol(supabase, session.user.id).then((role) => {
          setUserData((prev) => (prev ? { ...prev, role } : prev));
        });
      } else {
        setUserData(null);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    toast.success("Sesión cerrada");
    router.push("/");
    router.refresh();
  };

  const initial = userData?.nombre?.[0]?.toUpperCase()
    ?? userData?.email?.[0]?.toUpperCase()
    ?? "?";

  const esStaff = esRolStaff(userData?.role);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <nav className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          Valatino
        </Link>

        <div className="flex items-center gap-3">
          {userData ? (
            <div className="flex items-center gap-3">
              {esStaff ? (
                <Link href="/backoffice/pedidos" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                  Panel de control
                </Link>
              ) : (
                <Link href="/cuenta/pedidos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Mis pedidos
                </Link>
              )}

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  title={userData.nombre ?? userData.email}
                >
                  {initial}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border bg-card shadow-lg py-1 z-50">
                    <div className="px-3 py-2 border-b">
                      <p className="text-sm font-medium truncate">{userData.nombre ?? "Usuario"}</p>
                      <p className="text-xs text-muted-foreground truncate">{userData.email}</p>
                    </div>
                    <Link
                      href={esStaff ? "/backoffice/perfil" : "/cuenta/perfil"}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      Mi perfil
                    </Link>
                    {esStaff && (
                      <Link
                        href="/backoffice/pedidos"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-primary"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Panel de control
                      </Link>
                    )}
                    {!esStaff && (
                      <Link
                        href="/cuenta/pedidos"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        <Package className="h-4 w-4" />
                        Mis pedidos
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">
                <User className="h-4 w-4 mr-1" />
                Iniciar sesión
              </Link>
            </Button>
          )}

          {!esStaff && (
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link href="/carrito">
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </Link>
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
