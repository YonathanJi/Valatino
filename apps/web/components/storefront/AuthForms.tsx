"use client";

import { useEffect, useState } from "react";
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
  /**
   * Segundos que faltan para poder pedir otro código.
   *
   * Supabase impone un enfriamiento por dirección de correo: pedirlo antes
   * devuelve **429 y NO envía nada**. Antes no se llevaba la cuenta, así que
   * quien no veía llegar el correo volvía a pulsar, se comía el 429 en inglés y
   * se quedaba sin correo — parecía que el login estaba roto. Ver el log de auth
   * del 2026-07-27: `over_email_send_rate_limit`.
   */
  const [esperaReenvio, setEsperaReenvio] = useState(0);

  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const t = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [esperaReenvio]);

  /** Extrae los segundos del mensaje de Supabase («after 35 seconds»). */
  const segundosDelMensaje = (mensaje: string): number => {
    const m = mensaje.match(/(\d+)\s*second/i);
    return m ? Number(m[1]) : 60;
  };

  /**
   * `limite` se distingue de `error` a propósito: significa que **ya hay un
   * código enviado y válido**, así que el usuario no está bloqueado —tiene que
   * teclear el que le llegó. Tratarlo como error lo dejaba en la pantalla del
   * correo sin poder escribir el código que ya tenía en el buzón.
   */
  const pedirCodigo = async (): Promise<"enviado" | "limite" | "error"> => {
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
      // El límite se traduce y se convierte en cuenta atrás: es una espera, no un
      // error del que el usuario tenga que hacer nada.
      const esLimite =
        error.status === 429 || /rate limit|only request this after/i.test(error.message);

      if (esLimite) {
        setEsperaReenvio(segundosDelMensaje(error.message));
        return "limite";
      }

      toast.error(error.message || "No se pudo enviar el código.");
      return "error";
    }

    // 60 s es el enfriamiento de Supabase; se arranca ya para no volver a chocar.
    setEsperaReenvio(60);
    return "enviado";
  };

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const resultado = await pedirCodigo();
    if (resultado === "error") return;

    if (resultado === "limite") {
      // Ya se le envió uno hace unos segundos: se le pasa a teclearlo en vez de
      // dejarlo mirando el formulario del correo.
      toast.info(`Ya te enviamos un código a ${email} hace un momento. Úsalo para entrar.`);
    } else {
      toast.success(`Enviamos un código a ${email}. Revisa tu correo.`);
    }

    setStep("verify");
  };

  const handleReenviar = async () => {
    if (esperaReenvio > 0) return;
    const resultado = await pedirCodigo();
    if (resultado === "enviado") {
      toast.success(`Te enviamos otro código a ${email}.`);
      setToken("");
    } else if (resultado === "limite") {
      toast.info("Todavía hay un código válido en tu correo. Espera para pedir otro.");
    }
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
        {/* Reenviar SIN salir de la pantalla. Antes la única salida era «Cambiar
            correo», así que quien no recibía el correo volvía al paso 1 y pedía
            otro sin saber que había un enfriamiento: 429 y ningún correo. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void handleReenviar()}
          disabled={ocupado || esperaReenvio > 0}
        >
          {esperaReenvio > 0
            ? `Reenviar código en ${esperaReenvio}s`
            : "No me ha llegado — reenviar código"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Si el correo trae un enlace en vez de un código, también sirve: pulsarlo
          te mete directamente.
        </p>

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