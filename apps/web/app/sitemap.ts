import type { MetadataRoute } from "next";
import type { Producto } from "@valatino/types";
import { API_URL } from "@lib/api/url";
import { SITIO, rutaDeProducto } from "@lib/seo/metadatos";

/**
 * El mapa del sitio, que **hasta hoy devolvía un 404**.
 *
 * Es la vía por la que un buscador descubre las 30 fichas de producto sin depender de
 * rastrear enlace a enlace desde la portada, y la que le dice cuándo cambió cada una.
 * `robots.ts` lo anuncia.
 *
 * ⚠️⚠️ `API_URL` SE IMPORTA DE `@lib/api/url` Y NO DE `@lib/api/client`, y eso no es
 * un detalle de estilo: `client.ts` empieza por `"use client"`, y cuando un módulo de
 * SERVIDOR —como este— importa un valor de ahí, Next no le da el valor sino un stub
 * que lanza. Es exactamente la avería que dejó las tres páginas legales vacías durante
 * dos sesiones (22–23/08). Ver la cabecera de `url.ts`.
 *
 * ⚠️⚠️ Y LA OTRA TRAMPA, QUE ES LA QUE MANDA EN EL DISEÑO DE ESTE FICHERO: **la API
 * duerme.** Está en el plan gratuito de Render, así que un despliegue puede
 * construirse con la API apagada y el primer arranque en frío tarda entre 8 y 16
 * segundos (medido: 16,3 s el 25/08, 8,3 s el 26/08). Eso ya dejó las legales en
 * blanco al desplegar.
 *
 * Por eso las rutas fijas **no dependen del fetch**: se devuelven siempre, y los
 * productos se AÑADEN si se pudieron traer. Un mapa con la portada y el catálogo es
 * útil; un mapa vacío le dice al buscador que aquí no hay nada, y eso es peor que no
 * tener mapa. La regla es la misma de `getIdentidad`: un fallo de red no puede
 * convertirse en «la tienda está vacía».
 */

/** Cuánto se espera a la API. Ver la nota del arranque en frío de arriba. */
const CORTE_MS = 20_000;

/**
 * Se regenera cada hora. El catálogo no cambia cada minuto y esto lo pide un
 * rastreador, no una persona esperando.
 */
export const revalidate = 3600;

async function productos(): Promise<Producto[]> {
  try {
    const res = await fetch(`${API_URL}/productos?limit=200`, {
      next: { revalidate },
      signal: AbortSignal.timeout(CORTE_MS),
    });
    if (!res.ok) return [];

    const cuerpo = (await res.json()) as { data?: Producto[] } | Producto[];
    return Array.isArray(cuerpo) ? cuerpo : (cuerpo.data ?? []);
  } catch {
    /**
     * ⚠️ Se calla A PROPÓSITO y devuelve lista vacía: el mapa sale con las rutas
     * fijas y el ISR lo repinta con los productos en la siguiente hora. Lanzar aquí
     * dejaría `/sitemap.xml` en un 500, que para un buscador es peor que un mapa
     * corto — y tumbaría el build si la API estuviera dormida en ese momento.
     */
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ahora = new Date();

  /**
   * Las que existen siempre, con su prioridad relativa.
   *
   * ⚠️ NO van `/carrito`, `/checkout`, `/login` ni `/cuenta`: están cerradas en
   * `robots.ts`, y anunciar en el mapa lo que se prohíbe rastrear es contradecirse
   * — Search Console lo marca como aviso y con razón.
   */
  const fijas: MetadataRoute.Sitemap = [
    { url: SITIO, lastModified: ahora, changeFrequency: "daily", priority: 1 },
    {
      url: `${SITIO}/contacto`,
      lastModified: ahora,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${SITIO}/terminos`,
      lastModified: ahora,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITIO}/aviso-legal`,
      lastModified: ahora,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITIO}/politica-privacidad`,
      lastModified: ahora,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const catalogo = await productos();

  return [
    ...fijas,
    ...catalogo
      // Solo lo que un cliente puede comprar. Un producto desactivado sigue
      // respondiendo su ficha, pero ofrecerlo al buscador es invitar a una visita
      // que acaba en un artículo que no está.
      .filter((p) => p.activo)
      .map((p) => ({
        url: `${SITIO}${rutaDeProducto(p)}`,
        // `updated_at` es la verdad de cuándo cambió la ficha: precio, foto o nombre.
        lastModified: p.updated_at ? new Date(p.updated_at) : ahora,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
  ];
}
