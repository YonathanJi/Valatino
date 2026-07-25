"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { destinoSeguro } from "@lib/auth/redirect";
import { apiFetch } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

type Step = "request" | "verify";

/**
 * "entrando" = código ya aceptado y navegación en curso. Se distingue de
 * "verificando" para no volver a habilitar el botón entre ambas cosas: ahí es
 * donde el usuario reenviaba el código y se quedaba bloqueado.
 */
type Fase = "idle" | "verificando" | "entrando";

export function AuthForm({
  defaultEmail = "",
  redirectTo: redirectToRaw = "/cuenta/perfil",
}: {
  defaultEmail?: string;
  redirectTo?: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  // `redirectTo` viene de la query string: solo se aceptan rutas internas.
  const redirectTo = destinoSeguro(redirectToRaw, "/cuenta/perfil");
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(defaultEmail);
  const [token, setToken] = useState("");
  const [fase, setFase] = useState<Fase>("idle");
  const ocupado = fase !== "idle";

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFase("verificando");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        shouldCreateUser: true,
      },
    });

    setFase("idle");

    if (error) {
      toast.error(error.message || "No se pudo enviar el código.");
      return;
    }

    toast.success(`Enviamos un código a ${email}. Revisa tu correo.`);
    setStep("verify");
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFase("verificando");

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    // El código OTP es de un solo uso. Si el usuario lo reenvía porque la
    // pantalla parecía colgada, el segundo intento responde `otp_expired`
    // AUNQUE la sesión ya esté creada — y antes eso lo dejaba atrapado aquí con
    // un "código inválido" engañoso. Se comprueba si ya hay sesión y se sigue.
    let sesion = data?.session ?? null;
    if (!sesion) {
      const { data: actual } = await supabase.auth.getSession();
      sesion = actual.session;
    }

    if (!sesion) {
      setFase("idle");
      toast.error(error?.message ?? "Código inválido o expirado.");
      return;
    }

    toast.success("Sesión iniciada");
    setFase("entrando");

    // Vincular pedidos huérfanos y fusionar carrito: son idempotentes y no
    // deciden el destino, así que NO se esperan. Van contra la API en Render,
    // que en plan free duerme y puede tardar decenas de segundos en despertar:
    // esperarlas dejaba la pantalla del código quieta y sin indicador.
    void Promise.allSettled([
      apiFetch("/pedidos/vincular", { method: "POST" }),
      apiFetch("/carrito/fusionar", { method: "POST" }),
    ]);

    // El destino según el rol lo resuelven los layouts server-side: el de
    // /cuenta manda al staff a /backoffice/perfil. Consultar el rol aquí solo
    // añadía dos peticiones más antes de poder navegar.
    router.replace(redirectTo);
    router.refresh();
    // La fase se queda en "entrando" a propósito: el botón sigue deshabilitado
    // hasta que la navegación se complete, en vez de invitar a pulsar de nuevo.
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
        <Button type="submit" className="w-full" size="lg" disabled={ocupado || token.length !== 6}>
          {fase === "verificando"
            ? "Verificando..."
            : fase === "entrando"
              ? "Entrando en tu cuenta…"
              : "Verificar código"}
        </Button>
        {fase === "entrando" && (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Ya estás dentro. Preparando tu cuenta… la primera carga puede tardar unos segundos.
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            setToken("");
            setStep("request");
          }}
          disabled={ocupado}
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
      <Button type="submit" className="w-full" size="lg" disabled={ocupado}>
        {ocupado ? "Enviando código..." : "Enviar código"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Si no tienes cuenta, se creará automáticamente al confirmar el código.
      </p>
    </form>
  );
}