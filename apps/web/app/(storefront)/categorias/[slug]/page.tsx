import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListaProductos } from "@components/storefront/ListaProductos";
import { FiltroCategorias } from "@components/storefront/FiltroCategorias";
import { agruparPorVariante, varianteVisible } from "@lib/productos/variantes";
import { rutaDeProducto } from "@lib/seo/metadatos";
import { JsonLd } from "@components/seo/JsonLd";
import { listaDeCategoria, migasDeCategoria } from "@lib/seo/datos-estructurados";
import { ogDelSitio } from "@lib/seo/metadatos";
import { pedirCatalogo, PLAZO_PAGINA_MS } from "@lib/productos/catalogo";
import {
  categoriaPorSlug,
  categoriasDe,
  descripcionDeCategoria,
  introduccionDe,
  nombreProbableDe,
  rutaDeCategoria,
} from "@lib/productos/categorias";

/**
 * La página de una categoría.
 *
 * ── DE QUÉ MEDICIÓN SALE ESTA PÁGINA ──
 *
 * La auditoría del 09/09 la pedía como P2 «para no depender solo de búsquedas de
 * marca». El 12/09 Search Console le dio un motivo mejor y más urgente:
 *
 *   · 34 URLs en el sitemap, **21 indexadas y 13 no**.
 *   · Las 13 con «Descubierta: actualmente sin indexar» y **último rastreo N/D**:
 *     Google no ha ido nunca a verlas.
 *   · Entre ellas `/productos/nucita` — y «nucita» es la segunda consulta con más
 *     impresiones de la tienda. La gente la busca, sale `nucita-caja-12` (5,90 €) en
 *     lugar de la unidad (0,50 €), y nadie hace clic.
 *
 * ⭐ Así que esto es, **antes que contenido, un puente de enlaces internos**. Hoy
 * `chocolate-corona` solo se enlaza desde la portada, perdida entre 29 tarjetas; desde
 * aquí está a un clic de la raíz y en compañía de sus cuatro hermanas.
 *
 * ── POR QUÉ ES ESTÁTICA, Y NO ES UN DETALLE ──
 *
 * ⚠️⚠️ `generateStaticParams` + `revalidate` hacen que esta página se cueza en el
 * build o en una regeneración de fondo, **nunca en la visita de un cliente**. Importa
 * porque el catálogo se pide con `pedirCatalogo`, que tiene un plazo de 50 s
 * dimensionado contra el arranque en frío de Render —42,5 s medidos el 28/08—. Ese
 * plazo es aceptable para un robot que construye el sitio y sería **estar roto** para
 * alguien que pincha «Dulces». Al ser estática, quien entra recibe HTML ya hecho y no
 * espera a nadie.
 */
export const revalidate = 300;

/**
 * ⚠️ Solo existen las categorías que tienen productos. Una URL inventada —o una
 * categoría que se quedó sin catálogo— tiene que dar **404 y no una página vacía**:
 * un 200 con «no hay nada aquí» le dice a Google que la URL es buena y la deja en el
 * índice para siempre.
 */
export const dynamicParams = true;

interface Props {
  /** ⚠️ Promesa desde Next 15, igual que en la ficha de producto. */
  params: Promise<{ slug: string }>;
}

/**
 * Las categorías que se prerenderizan.
 *
 * ⚠️ Si la API no contesta durante el build, esto devuelve `[]` y Next genera las
 * páginas **bajo demanda** en vez de tumbar el despliegue. Es la misma decisión que
 * el mapa del sitio: aquí nunca se lanza, porque un `throw` en el build es la tienda
 * entera sin desplegar.
 */
export async function generateStaticParams() {
  const catalogo = await pedirCatalogo();
  if (!catalogo) {
    console.error("[categorias] Sin catálogo en el build: se generarán bajo demanda.");
    return [];
  }
  return categoriasDe(catalogo.productos).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const catalogo = await pedirCatalogo({ plazoMs: PLAZO_PAGINA_MS });
  const categoria = catalogo && categoriaPorSlug(catalogo.productos, slug);

  if (!categoria) return { title: "Categoría no encontrada" };

  const titulo = `${categoria.nombre} — Productos Latinoamericanos`;
  const descripcion = descripcionDeCategoria(categoria);

  return {
    title: titulo,
    description: descripcion,
    /**
     * ⚠️ Canónica propia y absoluta. Sin esto heredaría la del layout —la portada— y
     * las cuatro categorías se declararían duplicados de la home, que es justo lo que
     * `app/layout.tsx` explica que no debe pasar.
     */
    alternates: { canonical: rutaDeCategoria(categoria.slug) },
    openGraph: ogDelSitio(titulo, descripcion),
  };
}

export default async function CategoriaPage({ params }: Props) {
  const { slug } = await params;
  const catalogo = await pedirCatalogo({ plazoMs: PLAZO_PAGINA_MS });

  /**
   * ⚠️⚠️ «NO PUDE PREGUNTAR» Y «NO EXISTE» NO SON LO MISMO, y cada uno se trata
   * distinto:
   *
   *   · `null` —no se pudo preguntar— NO puede dar 404, porque Next lo cachearía y
   *     una categoría real quedaría muerta hasta la siguiente revalidación.
   *   · Y tampoco puede LANZAR. La primera versión de esta página lanzaba aquí, y el
   *     12/09 se vio en un build real lo que eso cuesta: con la API caída, `next
   *     build` murió con «took more than 60 seconds» y **no se desplegó la tienda**.
   *     Es lo mismo que el mapa del sitio tiene escrito desde agosto: aquí nunca se
   *     lanza, porque un `throw` en el build no es una página rota, es el despliegue
   *     entero.
   *
   * ⭐ Así que se pinta la página **sin listado y diciéndolo**: el título y las migas
   * son correctos, y `revalidate` la arregla sola en cinco minutos. Una página
   * degradada durante un rato es barata; un despliegue caído, no.
   */
  const categoria = catalogo ? categoriaPorSlug(catalogo.productos, slug) : null;

  // Preguntamos y esta categoría NO existe: eso sí es un 404 de verdad.
  if (catalogo && !categoria) notFound();

  /**
   * Y el estado degradado: la categoría existe —viene de `generateStaticParams`—
   * pero ahora mismo no se puede decir qué hay dentro.
   *
   * ⚠️ Sin JSON-LD y sin recuento: declararle a Google una `ItemList` vacía sería
   * peor que no declarar nada. Lo que se pinta es una página honesta que dice qué
   * pasa, y que `revalidate` sustituye por la buena en cuanto la API responda.
   */
  if (!categoria) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-12">
        <nav aria-label="Migas de pan" className="mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Inicio
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-foreground">{nombreProbableDe(slug)}</span>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {nombreProbableDe(slug)}
        </h1>
        <p className="mt-6 text-muted-foreground">
          No hemos podido cargar los productos de esta categoría ahora mismo. Vuelve a
          intentarlo en unos segundos.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm hover:text-primary transition-colors">
          ← Ver todo el catálogo
        </Link>
      </main>
    );
  }

  const entradilla = introduccionDe(categoria.slug);

  return (
    <main className="max-w-7xl mx-auto px-4 py-12">
      <JsonLd
        fichas={[
          migasDeCategoria(categoria.nombre, categoria.slug),
          listaDeCategoria(categoria.nombre, categoria.slug, categoria.productos),
        ]}
      />

      {/*
        Las migas visibles, que son las mismas que el JSON-LD declara. Van en un <nav>
        con su `aria-label` porque son navegación, no decoración.
      */}
      {/*
        Las migas visibles, que son las mismas que el JSON-LD declara. Se quedan
        aunque esté el filtro: dicen DÓNDE estás, y el filtro dice a dónde puedes ir.
      */}
      <nav aria-label="Migas de pan" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Inicio
        </Link>
        <span className="mx-2" aria-hidden="true">
          ›
        </span>
        <span className="text-foreground">{categoria.nombre}</span>
      </nav>

      {/*
        ⚠️ El mismo filtro que la portada, con esta categoría marcada. Que sea el
        mismo componente y esté en el mismo sitio es lo que hace que pulsar un chip se
        sienta como filtrar y no como saltar a otra página.
        ⭐ Va con `-mx-4` y sin `pt-8` porque aquí ya hay margen: el componente trae su
        propio contenedor para la portada, y aquí está dentro de uno.
      */}
      <div className="-mx-4 mb-8">
        <FiltroCategorias activa={categoria.slug} />
      </div>

      <header className="mb-10">
        {/*
          ⚠️ El H1 es el NOMBRE DE LA CATEGORÍA y nada más. La tentación es escribir
          «Compra Dulces colombianos online en España»; eso es escribir para el robot,
          y Google lleva quince años penalizándolo.
        */}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{categoria.nombre}</h1>

        {/*
          Sin entradilla si no hay una escrita: ver `introduccionDe`. Una categoría
          nueva se pinta con su título y su listado, que es una página perfectamente
          válida — y mejor que un párrafo de relleno igual al de las otras tres.
        */}
        {entradilla && (
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl">{entradilla}</p>
        )}

        <p className="mt-2 text-sm text-muted-foreground">
          {categoria.productos.length}{" "}
          {categoria.productos.length === 1 ? "producto" : "productos"}
        </p>
      </header>

      <ListaProductos productos={categoria.productos} />

      {/*
        ⚠️⚠️ EL BLOQUE QUE HACE QUE ESTA PÁGINA SIRVA PARA LO QUE VINO A SERVIR, y sin
        él casi no servía. Se vio midiendo: `/categorias/dulces` enlazaba a **5 fichas
        de las 9** que tiene la categoría, porque `ListaProductos` agrupa las
        presentaciones de una familia en UNA tarjeta con selector. Para el cliente eso
        está bien —nadie quiere ver cuatro Jugo Hit seguidos—, pero el enlace solo
        apunta a la presentación representante.

        Y las que se quedaban fuera son **justo las que Google no rastrea**:
        `nucita-caja-12`, `bon-bon-bum-939`, `sparkies-caja-24`… O sea que la página
        creada para dar caminos internos a las fichas huérfanas se los daba a la mitad.

        ⭐ Aquí van todas, con su presentación en el texto del enlace. Sirve a los dos:
        al rastreador le da el camino que le faltaba, y a quien busca «la caja de 24»
        le deja llegar sin pasar por el selector.
      */}
      {agruparPorVariante(categoria.productos).length < categoria.productos.length && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-lg font-semibold mb-4">Todas las presentaciones</h2>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {categoria.productos.map((p) => (
              <li key={p.id}>
                <Link
                  href={rutaDeProducto(p)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {p.variante
                    ? `${p.familia ?? p.nombre} — ${varianteVisible(p.variante)}`
                    : p.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

    </main>
  );
}
