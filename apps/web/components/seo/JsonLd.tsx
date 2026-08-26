import type { JsonLd as Ficha } from "@lib/seo/datos-estructurados";

/**
 * Pinta una o varias fichas de schema.org en un `<script type="application/ld+json">`.
 *
 * ⚠️⚠️ EL ESCAPE DE `<` NO ES PARANOIA, ES LO ÚNICO QUE HACE ESTO SEGURO. Dentro de un
 * `<script>` el navegador busca la cadena `</script` para cerrarlo, y **no le importa
 * que esté dentro de una cadena JSON**. El nombre o la descripción de un producto los
 * escribe una persona desde el panel: un artículo llamado `</script><img onerror=…>`
 * cerraría la etiqueta antes de tiempo y lo que viniera detrás sería HTML ejecutable.
 *
 * `JSON.stringify` **no protege de esto** —el JSON con un `<` dentro de una cadena es
 * JSON perfectamente válido— así que se sustituye el carácter por su escape unicode
 * `<`, que JSON entiende igual y el analizador de HTML ya no reconoce como el
 * principio de una etiqueta.
 *
 * Es el mismo tipo de descuido que `HuellaDiagnostico` evita escapando `-->`: un dato
 * de negocio metido en un contexto que tiene su propia sintaxis.
 *
 * ⚠️ `undefined` se cae solo al serializar, que es justo lo que se quiere: las fichas
 * de `datos-estructurados.ts` dejan campos sin poner cuando el dato no existe, y así
 * no salen propiedades vacías.
 */
export function JsonLd({ fichas }: { fichas: Ficha[] }) {
  const json = JSON.stringify(fichas.length === 1 ? fichas[0] : fichas).replace(/</g, "\\u003c");

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
