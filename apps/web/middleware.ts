import { NextResponse, type NextRequest } from "next/server";
import { cabecerasDelProxy } from "@lib/api/cabeceras-proxy";
import { NO_INDEXAR, fueraDelIndice } from "@lib/seo/rutas-cerradas";

const PROTECTED_PREFIXES = ["/cuenta", "/backoffice"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  /**
   * ⭐ Marca la respuesta como no indexable si la ruta no es para buscadores. Se
   * aplica a TODAS las salidas de este middleware, y por eso está aquí arriba y no
   * pegado a un `return`: hay cuatro caminos distintos —proxy de API, ruta abierta,
   * redirección al acceso y ruta protegida con sesión— y el que se olvidara sería
   * justo el que no se prueba.
   *
   * ⚠️⚠️ POR QUÉ POR CABECERA Y NO CON `metadata.robots` EN CADA PÁGINA. Dos
   * motivos, y el segundo es el que decide:
   *
   *   1. `/login` y `/checkout` son componentes de cliente (`"use client"`), y una
   *      página de cliente **no puede exportar `metadata`** en el App Router. Habría
   *      que inventarles un `layout.tsx` a cada una solo para esto.
   *   2. ⚠️ Y lo de fondo: una etiqueta en el HTML **desaparece en silencio** el día
   *      que alguien convierta una página en `"use client"` o la mueva de carpeta.
   *      Nadie se enteraría, porque el síntoma aparece semanas después y en Search
   *      Console. La cabecera sale de la lista compartida con `robots.txt` y el mapa
   *      del sitio, así que una pantalla nueva que se añada a esa lista queda
   *      cubierta **sin tocar este fichero**.
   *
   * Para Google las dos formas valen igual; lo que no vale igual es lo que aguanta
   * un refactor.
   */
  const sinIndice = (respuesta: NextResponse) => {
    if (fueraDelIndice(pathname)) respuesta.headers.set("X-Robots-Tag", NO_INDEXAR);
    return respuesta;
  };

  /**
   * Lo que va a la API por el proxy `/api` sale identificado, para que allí se
   * cuente la cuota por la IP del cliente y no por la del nodo de Vercel. El
   * porqué, largo, está en `packages/types` y en `throttler-ip-real.guard.ts`.
   *
   * ⚠️ NO se toca el enrutado: el reenvío lo sigue haciendo el `rewrites()` de
   * `next.config.mjs`, y aquí solo se añaden dos cabeceras. Se eligió así
   * frente a hacer el `rewrite()` desde el middleware porque por este camino
   * pasa la tienda entera —carrito, checkout, login—, y si las cabeceras no
   * llegasen a sobrevivir al reenvío, lo peor que pasa es que la API no
   * reconoce al proxy y agrupa como hasta ahora. Rehacer el enrutado, si
   * saliera mal, deja la tienda muerta. Se comprueba con /diagnostico/red.
   */
  if (pathname.startsWith("/api/")) {
    const cabeceras = cabecerasDelProxy(request.headers, process.env.PROXY_API_SECRETO);
    if (cabeceras) return sinIndice(NextResponse.next({ request: { headers: cabeceras } }));
    return sinIndice(NextResponse.next());
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!isProtected) return sinIndice(NextResponse.next());

  // @supabase/ssr puede partir la cookie en chunks (sb-xxx-auth-token.0, .1…),
  // por eso se usa includes() en lugar de endsWith().
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );

  if (!hasAuthCookie) {
    // El staff entra por /admin; los clientes por /login.
    const loginPath = pathname.startsWith("/backoffice") ? "/admin" : "/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return sinIndice(NextResponse.redirect(loginUrl));
  }

  return sinIndice(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
