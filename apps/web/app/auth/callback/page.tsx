"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { destinoSeguro } from "@lib/auth/redirect";
import { apiFetch } from "@lib/api/client";
import { Button } from "@components/ui/button";

const DESTINO_POR_DEFECTO = "/cuenta/pedidos";

/** Margen para que `detectSessionInUrl` procese el fragmento antes de rendirse. */
const ESPERA_MAXIMA_MS = 10_000;

/**
 * Entrada por ENLACE del correo. Es el camino secundario: el principal es teclear
 * el código de 6 dígitos, que va por otra ruta y no pasa por aquí.
 *
 * ⚠️ Esto era un route handler de servidor y **no funcionaba**. Lo destapó un 502
 * de Supabase al descargar nuestra plantilla: envió su correo por defecto, que
 * trae enlace en vez de código, y ahí se estrenó el camino roto. En el log de
 * auth se ve así:
 *
 *     /verify  303   ← se pulsa el enlace
 *     /token   400   ← el intercambio PKCE falla
 *     /token   400   ← y otra vez
 *
 * Dos razones por las que el servidor no puede hacerlo:
 *
 *  1. El **verificador PKCE** lo crea `signInWithOtp` en el navegador. El
 *     intercambio tiene que ocurrir donde vive, no en el servidor.
 *  2. Supabase puede devolver la sesión en el **fragmento** de la URL
 *     (`#access_token=…`), y un fragmento **nunca se envía al servidor**: en el
 *     log hay un intento en el que no llegó ni a pedir el token, porque no había
 *     nada que leer.
 *
 * Aquí en cliente se cubren los tres formatos: `?code=`, `?token_hash=` y el
 * fragmento (que `detectSessionInUrl` procesa solo al crear el cliente).
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fallo, setFallo] = useState<string | null>(null);
  const resuelto = useRef(false);

  const redirectTo = destinoSeguro(searchParams.get("redirectTo"), DESTINO_POR_DEFECTO);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const entrar = () => {
      if (resuelto.current) return;
      resuelto.current = true;

      // El token venía en la URL: se borra del historial para que no quede en el
      // botón «atrás» ni se copie al compartir el enlace de la página.
      window.history.replaceState(null, "", window.location.pathname);

      // Igual que al entrar con código: idempotentes y no deciden el destino, así
      // que no se esperan (la API duerme en plan free y puede tardar).
      void Promise.allSettled([
        apiFetch("/pedidos/vincular", { method: "POST" }),
        apiFetch("/carrito/fusionar", { method: "POST" }),
      ]);

      router.replace(redirectTo);
      router.refresh();
    };

    // Si `detectSessionInUrl` procesa el fragmento, llega por aquí.
    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (sesion && (evento === "SIGNED_IN" || evento === "INITIAL_SESSION")) entrar();
    });

    void (async () => {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      // Un error propio de Supabase viaja en la query: se muestra tal cual en vez
      // de dejar la pantalla girando diez segundos para nada.
      const errorDeSupabase =
        searchParams.get("error_description") ?? searchParams.get("error");

      try {
        if (errorDeSupabase) {
          setFallo(errorDeSupabase);
          resuelto.current = true;
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          entrar();
          return;
        }

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "email" | "recovery" | "signup" | "magiclink",
          });
          if (error) throw error;
          entrar();
          return;
        }

        // Ni query ni error: o el fragmento ya se está procesando, o ya había
        // sesión. Se comprueba y, si no, se espera al evento.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          entrar();
          return;
        }

        temporizador = setTimeout(() => {
          if (resuelto.current) return;
          resuelto.current = true;
          setFallo("Este enlace ya se usó o ha caducado.");
        }, ESPERA_MAXIMA_MS);
      } catch (e) {
        resuelto.current = true;
        setFallo(e instanceof Error ? e.message : "No se pudo completar el acceso.");
      }
    })();

    return () => {
      suscripcion.subscription.unsubscribe();
      if (temporizador) clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fallo) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">No pudimos abrir tu sesión</h1>
        <p className="text-sm text-muted-foreground">{fallo}</p>
        {/* Se le devuelve al camino que SÍ funciona siempre, en vez de dejarlo
            en una pantalla sin salida. */}
        <p className="text-sm">
          Pide un código nuevo y entra tecleándolo: son 6 dígitos y funciona
          aunque abras el correo en otro dispositivo.
        </p>
        <Button asChild className="w-full" size="lg">
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>
            Pedir un código
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3 text-center" aria-live="polite">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      <p className="text-sm text-muted-foreground">Entrando en tu cuenta…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Entrando en tu cuenta…</p>
        }
      >
        <CallbackContent />
      </Suspense>
    </main>
  );
}
