import Link from "next/link";
import { PageTransition } from "@components/ui/PageTransition";
import { StorefrontShell } from "@components/storefront/StorefrontShell";
import { getIdentidad, domicilioEnUnaLinea } from "@lib/tienda/identidad";

/**
 * ⚠️⚠️ EL PIE ES DONDE LA LSSI SE CUMPLE O NO SE CUMPLE. El art. 10 de la Ley
 * 34/2002 exige que la identidad de quien vende esté disponible «de forma
 * permanente, fácil, directa y gratuita», y «permanente» quiere decir desde
 * cualquier página — no escondida detrás de un enlace que hay que adivinar.
 *
 * Hasta el 2026-08-22 aquí solo había «© 2026 Valatino» y dos enlaces. Ni nombre,
 * ni NIF, ni forma de preguntar nada.
 *
 * ⭐ Y el nombre del titular va IMPRESO en el pie, no solo enlazado, porque es lo
 * que hace la diferencia comercial: quien duda de si la tienda es real no va a
 * abrir el aviso legal, va a mirar el pie por encima. Ver ahí un nombre y un NIF
 * cambia lo que decide sin que tenga que hacer clic.
 *
 * ⚠️ `getIdentidad()` no lanza nunca (lo garantiza su test): esto lo pinta TODA
 * la tienda, así que un hipo de la API no puede tumbar el catálogo por no poder
 * escribir un pie de página.
 */
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const identidad = await getIdentidad();
  const domicilio = domicilioEnUnaLinea(identidad);

  return (
    <StorefrontShell>
      <div className="flex min-h-screen flex-col">
        <PageTransition>
          <div className="flex-1">{children}</div>
        </PageTransition>

        <footer className="border-t py-8 text-center text-sm text-muted-foreground">
          <p>© 2026 Valatino · Sabores de Latinoamérica en España</p>

          {identidad.identificada && (
            <p className="mt-1 text-xs">
              {identidad.nombre} · NIF {identidad.nif}
              {domicilio ? ` · ${domicilio}` : ""}
            </p>
          )}

          <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/contacto" className="hover:text-foreground">
              Contacto
            </Link>
            <Link href="/aviso-legal" className="hover:text-foreground">
              Aviso legal
            </Link>
            <Link href="/terminos" className="hover:text-foreground">
              Términos
            </Link>
            <Link href="/politica-privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
          </nav>
        </footer>
      </div>
    </StorefrontShell>
  );
}
