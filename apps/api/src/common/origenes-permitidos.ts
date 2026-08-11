/**
 * Quién puede hablar con esta API desde un navegador.
 *
 * Vive aquí y no en main.ts porque lo usan DOS cosas: la política de CORS y la
 * comprobación de Origin que frena el CSRF. Con dos listas separadas, añadir un
 * dominio en una y olvidarlo en la otra da un fallo que solo se ve en
 * producción y solo al escribir — el GET seguiría funcionando.
 */
export interface OrigenesPermitidos {
  /** Los dominios exactos configurados, para poder registrarlos al arrancar. */
  lista: string[];
  permite(origin: string): boolean;
}

export function construirOrigenesPermitidos(env: NodeJS.ProcessEnv): OrigenesPermitidos {
  const lista = (env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Preview URLs de Vercel: se aceptan SOLO las del propio proyecto, indicando
  // su prefijo en CORS_VERCEL_PREVIEW_PREFIX (p.ej. "valatino" habilita
  // https://valatino-<hash>.vercel.app). Antes se admitía cualquier
  // *.vercel.app, así que bastaba con desplegar ahí para hablar con esta API
  // con `credentials: true` y manipular carrito y checkout de invitados.
  const prefijo = env.CORS_VERCEL_PREVIEW_PREFIX?.trim();
  const previewVercel = prefijo
    ? new RegExp(`^${prefijo.replace(/[^a-zA-Z0-9-]/g, "")}-[a-z0-9-]+\\.vercel\\.app$`)
    : null;

  return {
    lista,
    permite(origin: string): boolean {
      if (lista.includes(origin)) return true;
      if (!previewVercel) return false;
      try {
        const { hostname, protocol } = new URL(origin);
        return protocol === "https:" && previewVercel.test(hostname);
      } catch {
        return false; // Origin malformado
      }
    },
  };
}
