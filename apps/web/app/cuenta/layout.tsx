import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@lib/supabase/server";
import Link from "next/link";

export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/login");
  }

  if (!user) redirect("/login");

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
