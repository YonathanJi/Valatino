import Link from "next/link";
import { PageTransition } from "@components/ui/PageTransition";
import { StorefrontShell } from "@components/storefront/StorefrontShell";

/**
 * ⚠️⚠️ AQUÍ NO SE LLAMA A LA API, Y ES UNA CICATRIZ: el primer intento pintaba en
 * el pie el nombre y el NIF del titular leyéndolos de `/tienda/identidad`. Es
 * bonito y **rompió el build entero**.
 *
 * El motivo: un layout corre en CADA página, así que esa llamada se hacía 38
 * veces al generar el sitio. Con la API caída, cada página esperaba a que el
 * `fetch` fallara y se pasaba del límite de 60 s de generación estática de Next;
 * tres reintentos por página y el build se rindió. La portada, el login y el
 * checkout —que nunca habían necesitado la API para construirse— pasaron a
 * depender de ella.
 *
 * ⚠️ Y no era solo un problema local: la API vive en el plan gratuito de Render,
 * **que duerme**. Un despliegue de Vercel con la API fría habría fallado igual, y
 * el fallo habría aparecido en el peor sitio: al desplegar, no al programar.
 *
 * ⭐ Lo que la LSSI exige es que la identidad sea de acceso «permanente, fácil y
 * directo», y eso lo cumple **un enlace desde todas las páginas** — que es lo que
 * hay aquí. Los datos se pintan en `/aviso-legal`, `/contacto` y la política de
 * privacidad, que son tres páginas y sí pueden permitirse la llamada.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <StorefrontShell>
      <div className="flex min-h-screen flex-col">
        <PageTransition>
          <div className="flex-1">{children}</div>
        </PageTransition>

        <footer className="border-t py-8 text-center text-sm text-muted-foreground">
          <p>© 2026 Valatino · Sabores de Latinoamérica en España</p>

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
