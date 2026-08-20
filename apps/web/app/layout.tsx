import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ogDelSitio, SITIO } from "@lib/seo/metadatos";
import "./globals.css";

const TITULO = "Valatino — Sabores de Latinoamérica en España";
const DESCRIPCION =
  "Productos latinoamericanos originales enviados a toda España. Chocoramos, Jugos Hit, Galletas Ducales y mucho más.";

export const metadata: Metadata = {
  /**
   * ⚠️ **`metadataBase` es lo que hace que las rutas relativas de las etiquetas
   * para compartir se vuelvan absolutas.** Sin él, Next emite la imagen tal cual
   * y el crawler de WhatsApp —que está en sus servidores, no en el nuestro— no
   * puede resolverla: sale la tarjeta sin foto. Es la trampa clásica de esto,
   * porque parece configurado y no funciona.
   *
   * Se pone aunque `lib/seo/metadatos.ts` ya devuelva URLs absolutas: sirve
   * también para los `canonical` de aquí abajo y para cualquier metadato que se
   * añada después sin acordarse de absolutizarlo a mano.
   */
  metadataBase: new URL(SITIO),
  title: {
    default: TITULO,
    template: "%s | Valatino",
  },
  description: DESCRIPCION,
  keywords: ["productos latinoamericanos", "colombia españa", "chocoramo", "jugos hit"],
  /**
   * ⚠️⚠️ **AQUÍ NO VA `alternates.canonical`, y se probó por qué.**
   *
   * `alternates` se hereda igual que `openGraph`: la reemplaza el último segmento
   * que la declare, así que una página que no la declare se queda con la del
   * layout. Poniendo `canonical: "/"` aquí, el HTML servido decía
   * `canonical: https://valatino.es` en **`/carrito`, `/checkout`, `/login`,
   * `/terminos` y `/politica-privacidad`** — o sea, cinco páginas diciéndole a
   * Google que son duplicados de la portada. Eso es peor que no tener canonical.
   *
   * Van solo donde se conoce el valor correcto: la portada, en
   * `(storefront)/page.tsx`, y la ficha, en su `generateMetadata`.
   */
  openGraph: ogDelSitio(TITULO, DESCRIPCION),
  /**
   * X/Twitter lee las `og:` si no encuentra las suyas, así que basta con decirle
   * qué formato de tarjeta queremos. El resto lo hereda.
   */
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {/* El shell de tienda (navbar + carrito) vive en los layouts de
            (storefront) y /cuenta — las áreas internas no lo cargan */}
        {children}
        {/* Abajo a la derecha para no tapar la navbar (perfil/carrito) ni la
            franja superior en móvil. Compactos y de corta duración. */}
        <Toaster
          position="bottom-right"
          richColors
          duration={2500}
          toastOptions={{
            style: {
              fontSize: "13px",
              padding: "10px 12px",
              minHeight: "auto",
            },
          }}
        />
      </body>
    </html>
  );
}
