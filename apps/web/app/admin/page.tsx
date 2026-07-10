"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@lib/supabase/client";

function AdminLoginForm() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/backoffice/pedidos";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !data.session) {
      setIsLoading(false);
      setError("Credenciales incorrectas.");
      return;
    }

    // Solo staff: el rol se valida contra user_roles en BD (nunca metadata).
    const { data: rolData } = await supabase
      .from("user_roles")
      .select("roles(nombre)")
      .eq("user_id", data.session.user.id)
      .limit(1)
      .maybeSingle();

    const role = (rolData as { roles?: { nombre?: string } } | null)?.roles?.nombre;

    if (role !== "admin" && role !== "asesor") {
      await supabase.auth.signOut();
      setIsLoading(false);
      setError("Esta cuenta no tiene acceso al panel de administración.");
      return;
    }

    router.push(redirectTo.startsWith("/backoffice") ? redirectTo : "/backoffice/pedidos");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="admin-email" className="block text-sm font-medium text-zinc-300">
          Correo electrónico
        </label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          placeholder="tu@valatino.es"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-zinc-400"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="admin-password" className="block text-sm font-medium text-zinc-300">
          Contraseña
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-zinc-400"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isLoading ? "Verificando..." : "Entrar al panel"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-3xl font-bold tracking-tight text-white">Valatino</p>
          <p className="mt-1 text-sm uppercase tracking-[0.25em] text-zinc-500">Back-Office</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl">
          <Suspense>
            <AdminLoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Acceso exclusivo para el equipo de Valatino.
          <br />
          ¿Eres cliente? Inicia sesión en{" "}
          <a href="/login" className="text-zinc-400 underline-offset-2 hover:underline">
            valatino.es/login
          </a>
        </p>
      </div>
    </main>
  );
}
