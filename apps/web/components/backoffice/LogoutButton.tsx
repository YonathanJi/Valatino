"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";

/** Cierra la sesión del staff y vuelve al login del panel (/admin). */
export function LogoutButton() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin");
    router.refresh();
  };

  return (
    <button
      onClick={() => void handleLogout()}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
    >
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </button>
  );
}
