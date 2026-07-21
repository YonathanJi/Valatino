"use client";

import { createSupabaseBrowserClient } from "@lib/supabase/client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

  const res = await fetch(`${API_URL}${path}`, {
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

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
