"use client";

import { createSupabaseBrowserClient } from "@lib/supabase/client";

/**
 * ⚠️⚠️ SE REEXPORTA, NO SE DEFINE AQUI, y hay que dejarlo escrito porque definirla
 * aqui costo dos sesiones. Este modulo lleva `"use client"`, y un componente de
 * SERVIDOR que importe un valor de un modulo de cliente no recibe el valor: recibe un
 * stub que lanza. Las tres paginas legales salieron vacias del 22/08 al 23/08 por eso.
 * Ver la cabecera de `@lib/api/url`.
 *
 * ⚠️ El reexport es para el codigo de NAVEGADOR, que ya la importaba de aqui. Si lo
 * que escribes corre en el servidor, importala de `@lib/api/url` directamente.
 */
export { API_URL } from "./url";

// Base para las llamadas del NAVEGADOR que llevan la cookie de sesión: mismo
// origen que la web (proxy /api de next.config.mjs) → la cookie es de primera
// parte y funciona en Safari/iOS. Un fetch directo a Render la haría de
// terceros y el carrito se perdería en iPhone.
const BROWSER_API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Cliente HTTP tipado para la API de NestJS.
 * - Adjunta automáticamente el Bearer token de Supabase si hay sesión
 *   (imprescindible para que el backend asocie carrito/checkout al usuario).
 * - Incluye siempre credentials para la cookie de sesión de invitado.
 * - Normaliza los errores ({ statusCode, message }) a ApiError.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await peticion(path, options);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Lo mismo, pero devolviendo el cuerpo en binario. Para el PDF de una factura.
 *
 * ⚠️⚠️ HACE FALTA UNA VARIANTE Y NO SIRVE UN `<a href>` PELADO, y el motivo está
 * dos funciones más arriba: la API se autentica con el **Bearer** de la sesión de
 * Supabase, y un enlace normal no manda cabeceras. Un `<a>` al endpoint del PDF
 * daría un 401 — o peor, la pantalla de login en una pestaña nueva.
 *
 * Así que se pide con la sesión, se envuelve en un `blob:` y se abre eso. Quien lo
 * llame debe **revocar la URL** cuando termine (`URL.revokeObjectURL`), o cada
 * factura consultada se queda en memoria hasta recargar la página.
 */
export async function apiFetchBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const res = await peticion(path, options);
  return res.blob();
}

/** La parte común: sesión, cabeceras y el mapeo de errores a `ApiError`. */
async function peticion(path: string, options: RequestInit): Promise<Response> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  // Con FormData el navegador fija el Content-Type (incluye el boundary)
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${BROWSER_API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message)
        ? body.message.join(". ")
        : (body.message ?? message);
    } catch {
      // cuerpo no-JSON: mantener mensaje genérico
    }
    throw new ApiError(res.status, message);
  }

  return res;
}
