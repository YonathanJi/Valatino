"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { obtenerRol, esRolStaff } from "@lib/auth/rol";
import { apiFetch } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

type Step = "request" | "verify";

export function AuthForm({
  defaultEmail = "",
  redirectTo = "/cuenta/perfil",
}: {
  defaultEmail?: string;
  redirectTo?: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        shouldCreateUser: true,
      },
    });

    setIsLoading(false);

    if (error) {
      toast.error(error.message || "No se pudo enviar el código.");
      return;
    }

    toast.success(`Enviamos un código a ${email}. Revisa tu correo.`);
    setStep("verify");
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    setIsLoading(false);

    if (error || !data.session) {
      toast.error(error?.message ?? "Código inválido o expirado.");
      return;
    }

    toast.success("Sesión iniciada");

    // Vincular pedidos huérfanos y fusionar carrito en paralelo (no bloqueante)
    await Promise.allSettled([
      apiFetch("/pedidos/vincular", { method: "POST" }),
      apiFetch("/carrito/fusionar", { method: "POST" }),
    ]);

    // Determinar destino por rol real en BD (user_roles)
    const { data: { user } } = await supabase.auth.getUser();
    const role = user ? await obtenerRol(supabase, user.id) : undefined;
    const isStaff = esRolStaff(role);
    router.push(isStaff ? "/backoffice/pedidos" : redirectTo);
    router.refresh();
  };

  if (step === "verify") {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="token">Código de verificación</Label>
          <Input
            id="token"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoFocus
            className="text-center text-2xl tracking-[0.5em] font-mono"
          />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Te enviamos un código a <strong>{email}</strong>. Expira en 1 hora.
        </p>
        <Button type="submit" className="w-full" size="lg" disabled={isLoading || token.length !== 6}>
          {isLoading ? "Verificando..." : "Verificar código"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            setToken("");
            setStep("request");
          }}
          disabled={isLoading}
        >
          ← Cambiar correo
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email-auth">Correo electrónico</Label>
        <Input
          id="email-auth"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
        {isLoading ? "Enviando código..." : "Enviar código"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Si no tienes cuenta, se creará automáticamente al confirmar el código.
      </p>
    </form>
  );
}