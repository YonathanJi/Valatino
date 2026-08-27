import type { MetadataRoute } from "next";
import { mapaDelSitio } from "@lib/seo/mapa-del-sitio";

/**
 * El mapa del sitio. **Toda la lógica está en `@lib/seo/mapa-del-sitio`, y no por
 * gusto**: el runner de tests de la web solo mira `lib/` y `components/`, así que
 * mientras esto vivió aquí no había forma de probarlo — y el 27/08 se midió en
 * producción que servía 5 URLs en vez de 34. Ver la cabecera de ese fichero para el
 * porqué del reintento y de por qué `null` no es `[]`.
 */

/**
 * ⚠️⚠️ EL 300 VA COMO LITERAL Y ESO ES A PROPÓSITO, aunque duela: Next exige que la
 * configuración de segmento sea **analizable estáticamente**, así que
 * `export const revalidate = REVALIDAR_S` con un valor importado no es fiable — según
 * la versión, o lo ignora o rompe el build.
 *
 * ⭐ Es el mismo dato en dos sitios, que es justo lo que este proyecto tiene prohibido.
 * Como la duplicación la impone Next y no se puede evitar, se hace lo segundo mejor:
 * **se COMPRUEBA.** `mapa-del-sitio.spec.ts` importa este fichero y falla si este
 * número y `REVALIDAR_S` dejan de coincidir. Una duplicación vigilada no es una
 * duplicación olvidada.
 */
export const revalidate = 300;

/**
 * ⚠️ NO se pone `maxDuration`, y la decisión tiene motivo. Los dos intentos suman
 * hasta 35 s, más de lo que dura una función de Vercel por defecto — pero subirlo
 * exigiría una clave de configuración sin probar en un fichero de metadatos, y si Next
 * no la acepta el que se cae es el BUILD, o sea la tienda entera. El fallo que se evita
 * no lo merece:
 *
 *   · En el build (que es donde se cuece el mapa que se despliega) no hay límite de
 *     función, solo el de generación estática de Next, y 35 s entran de sobra.
 *   · Si una regeneración en caliente se pasa de tiempo, Next **sigue sirviendo la
 *     versión anterior** — o sea el mapa bueno. Perder una regeneración no cuesta nada.
 *
 * Cambiar esto solo si algún día se mide que el mapa se queda atrás de verdad.
 */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return mapaDelSitio();
}
