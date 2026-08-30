import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Producto } from "@valatino/types";
import { AddToCartButton } from "@components/storefront/AddToCartButton";
import { BotonFavorito } from "@components/storefront/BotonFavorito";
import { hermanosDeVariante, tieneVariante, varianteVisible } from "@lib/productos/variantes";
import { descripcionPropia, ogDeProducto, rutaDeProducto } from "@lib/seo/metadatos";
import { JsonLd } from "@components/seo/JsonLd";
import { migasDeProducto, productoJsonLd } from "@lib/seo/datos-estructurados";
import { formatEUR } from "@lib/utils";
import { API_URL } from "@lib/api/url";



async function getProducto(slug: string): Promise<Producto | null> {
  try {
    const res = await fetch(`${API_URL}/productos/slug/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Producto;
  } catch {
    return null;
  }
}

/** Presentaciones de la misma familia, para el selector de la ficha */
async function getHermanos(producto: Producto): Promise<Producto[]> {
  if (!tieneVariante(producto)) return [];
  try {
    const res = await fetch(`${API_URL}/productos?limit=100`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Producto[] };
    return hermanosDeVariante(producto, json.data ?? []);
  } catch {
    return [];
  }
}

/**
 * ⚠️ `params` es una PROMESA desde Next 15, y hay que esperarla.
 *
 * Es el cambio de fondo de esa versión: la página empieza a renderizarse antes
 * de que se conozcan los parámetros de la ruta, así que dejan de estar
 * disponibles de forma síncrona. Es la única ruta dinámica del proyecto que los
 * usa — las tres del panel leen su id en cliente.
 */
interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const producto = await getProducto(slug);
  if (!producto) return { title: "Producto no encontrado" };
  return {
    title: producto.nombre,
    /**
     * ⚠️ `descripcionPropia` y NO `producto.descripcion` en crudo: un producto sin
     * texto emitía `<meta name="description" content="">`, y una etiqueta vacía es
     * peor que no ponerla —gasta la señal y no dice nada—. Sin etiqueta, el buscador
     * compone el fragmento con el contenido de la página. Ver la cabecera de esa
     * función: la misma regla estaba escrita tres veces y las tres diferían.
     */
    description: descripcionPropia(producto),
    alternates: { canonical: rutaDeProducto(producto) },
    /**
     * La tarjeta que sale al compartir la ficha por WhatsApp: la foto del
     * producto, su nombre y su precio.
     *
     * ⚠️ Sustituye entera a la `openGraph` del layout raíz, no la completa campo
     * a campo — por eso `ogDeProducto` devuelve también `siteName` y `locale`.
     * Si se devolviera solo `images`, la tarjeta se quedaría con el título
     * genérico de la tienda en vez del nombre del producto.
     */
    openGraph: ogDeProducto(producto),
  };
}

export default async function ProductoPage({ params }: Props) {
  const { slug } = await params;
  const producto = await getProducto(slug);
  if (!producto) notFound();

  const agotado = producto.stock_disponible <= 0;
  const hermanos = await getHermanos(producto);
  const esVariante = tieneVariante(producto);

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      {/*
        El precio y la disponibilidad salen del MISMO `producto` que pinta la página de
        abajo, así que no pueden discrepar — y eso importa: si el buscador enseña un
        precio distinto del que se cobra, Google retira los resultados enriquecidos del
        sitio entero.
      */}
      <JsonLd fichas={[productoJsonLd(producto), migasDeProducto(producto)]} />

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Volver al catálogo
      </Link>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Imagen */}
        {/*
          ⚠️⚠️ EL `relative` VA AQUÍ FUERA Y NO EN EL CONTENEDOR DE LA FOTO, que es la
          misma cicatriz que ya tiene escrita `ProductoCard`: el de dentro RECORTA
          (`overflow-hidden` + `rounded-2xl`) y se comería la esquina del botón, más
          todavía al crecer con el `hover:scale-110`.
        */}
        <div className="relative">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
            <Image
              src={producto.imagenes[0] ?? "/placeholder.png"}
              alt={producto.nombre}
              unoptimized={(producto.imagenes[0] ?? "").endsWith(".svg")}
              fill
              className="object-cover"
              priority
            />
          </div>

          {/*
            Arriba a la derecha sobre la foto, igual que en el catálogo. Lo pidió
            Jonathan el 30/08: estaba al lado del precio y al entrar en un producto
            desde la portada el corazón «se movía de sitio». Que el mismo gesto esté
            siempre donde estaba es más importante que el argumento de ponerlo junto
            al precio, que era donde se decide.
          */}
          <BotonFavorito productoId={producto.id} nombre={producto.nombre} />
        </div>

        {/* Información */}
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            {producto.categoria}
          </p>
          <h1 className="text-3xl font-bold">
            {hermanos.length > 0 && esVariante ? producto.familia : producto.nombre}
          </h1>
          {producto.descripcion && (
            <p className="text-muted-foreground leading-relaxed">{producto.descripcion}</p>
          )}

          {/* Selector de presentación: se declara en `familia`/`variante` (057) */}
          {hermanos.length > 0 && esVariante && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                <span className="capitalize">{producto.variante_tipo}</span>:{" "}
                <span className="text-muted-foreground">{varianteVisible(producto.variante)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {hermanos.map((h) => {
                  const valor = h.variante ? varianteVisible(h.variante) : h.nombre;
                  const esActual = h.id === producto.id;
                  return esActual ? (
                    <span
                      key={h.id}
                      aria-current="true"
                      className="inline-flex items-center rounded-full border-2 border-primary bg-primary/5 px-4 py-1.5 text-sm font-medium"
                    >
                      {valor}
                    </span>
                  ) : (
                    <Link
                      key={h.id}
                      href={`/productos/${h.slug ?? h.id}`}
                      className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition-colors"
                    >
                      {valor}
                      {h.stock_disponible <= 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(agotado)</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-4xl font-bold text-primary">{formatEUR(Number(producto.precio))}</p>

          <p className="text-sm text-muted-foreground">
            {agotado ? (
              <span className="text-destructive font-medium">Sin stock</span>
            ) : (
              // El stock real no se muestra al cliente
              <span className="text-neutral-600 font-medium">Disponible</span>
            )}
          </p>

          <AddToCartButton productoId={producto.id} agotado={agotado} />
        </div>
      </div>
    </main>
  );
}
