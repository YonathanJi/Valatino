import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListaProductos } from "@components/storefront/ListaProductos";
import { FiltroCategorias } from "@components/storefront/FiltroCategorias";
import { JsonLd } from "@components/seo/JsonLd";
import {
  listaDeCategoria,
  migasDeCategoria,
} from "@lib/seo/datos-estructurados";
import { ogDelSitio } from "@lib/seo/metadatos";
import { pedirCatalogo, PLAZO_PAGINA_MS } from "@lib/productos/catalogo";
import {
  categoriaPorSlug,
  categoriasDe,
  descripcionDeCategoria,
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
    console.error(
      "[categorias] Sin catálogo en el build: se generarán bajo demanda.",
    );
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
  const categoria = catalogo
    ? categoriaPorSlug(catalogo.productos, slug)
    : null;

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
        <nav
          aria-label="Migas de pan"
          className="mb-6 text-sm text-muted-foreground"
        >
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
          No hemos podido cargar los productos de esta categoría ahora mismo.
          Vuelve a intentarlo en unos segundos.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm hover:text-primary transition-colors"
        >
          ← Ver todo el catálogo
        </Link>
      </main>
    );
  }

  return (
    <main>
      <JsonLd
        fichas={[
          migasDeCategoria(categoria.nombre, categoria.slug),
          listaDeCategoria(
            categoria.nombre,
            categoria.slug,
            categoria.productos,
          ),
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/*
          Las migas visibles, que son las mismas que el JSON-LD declara. Se quedan
          aunque esté el filtro: dicen DÓNDE estás, y el filtro dice a dónde ir.
        */}
        <nav
          aria-label="Migas de pan"
          className="mb-4 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Inicio
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-foreground">{categoria.nombre}</span>
        </nav>

        <header className="mb-10">
          {/*
          ⚠️ El H1 es el NOMBRE DE LA CATEGORÍA y nada más. La tentación es escribir
          «Compra Dulces colombianos online en España»; eso es escribir para el robot,
          y Google lleva quince años penalizándolo.
        */}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {categoria.nombre}
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            {categoria.productos.length}{" "}
            {categoria.productos.length === 1 ? "producto" : "productos"}
          </p>
        </header>

        {/*
          ⚠️ El mismo filtro que la portada y en el mismo sitio relativo: debajo del
          título de lo que se está listando y encima de la rejilla. Que esté en el
          mismo lugar en las dos es lo que hace que pulsar un chip se sienta como
          filtrar y no como saltar a otra página.
        */}
        <div className="mb-8">
          <FiltroCategorias activa={categoria.slug} />
        </div>

        <ListaProductos productos={categoria.productos} />

        {/*
        ⚠️⚠️ AQUÍ HUBO UN BLOQUE «TODAS LAS PRESENTACIONES» CON UN ENLACE POR FICHA, Y
        SE QUITÓ EL 12/09 A PETICIÓN DE JONATHAN. Queda escrito por qué estuvo y por
        qué se puede quitar, para que nadie lo reponga ni lo eche de menos:

        Estaba porque `ListaProductos` agrupa las presentaciones de una familia en UNA
        tarjeta, así que la rejilla solo enlaza a la representante: esta categoría
        muestra 5 tarjetas para 9 fichas. Las 12 que quedan escondidas en todo el
        catálogo son, además, justo las que Google no rastrea.

        ⭐ Se puede quitar porque **ninguna se queda huérfana**: la ficha de cada
        familia enlaza a todas sus hermanas con `<Link>` de verdad (el selector de
        presentaciones), y eso está comprobado en producción —`/productos/nucita`
        enlaza a `nucita-caja-12`, y la de Mora a lulo, mango y tropical—. La cadena
        queda portada → categoría → ficha → hermana: un salto más, no un callejón.

        ⚠️ Lo que NO se puede hacer si algún día hace falta reforzarlo: esconder los
        enlaces con CSS para que los vea el rastreador y no el cliente. Eso es
        exactamente lo que Google llama enlaces ocultos y lo penaliza. O están a la
        vista, o no están.
      */}
      </div>
    </main>
  );
}
