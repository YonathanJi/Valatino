import { NextResponse, type NextRequest } from "next/server";
import { cabecerasDelProxy } from "@lib/api/cabeceras-proxy";

const PROTECTED_PREFIXES = ["/cuenta", "/backoffice"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
    if (cabeceras) return NextResponse.next({ request: { headers: cabeceras } });
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!isProtected) return NextResponse.next();

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
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
