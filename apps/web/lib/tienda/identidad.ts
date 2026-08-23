// ⚠️⚠️ DE `@lib/api/url` Y NO DE `@lib/api/client`, QUE ES LO QUE ROMPIO ESTA PAGINA
// DURANTE DOS SESIONES. `client` lleva `"use client"`, y este fichero corre en el
// SERVIDOR: importar de ahi daba un stub que lanza en vez de la URL, y el `catch` de
// abajo lo convertia en la identidad vacia. Ver la cabecera de `@lib/api/url`.
import { API_URL } from "@lib/api/url";
import type { IdentidadPublica } from "@valatino/types";

/**
 * Quién vende y cómo se le pregunta, para el pie, el aviso legal y el contacto.
 *
 * ⚠️⚠️ NUNCA LANZA. Si un hipo de la API propagara la excepción, la página de
 * aviso legal —que existe justo para dar confianza— sería la que no carga.
 *
 * ⚠️ Y NO SE LLAMA DESDE EL LAYOUT. Se intentó, para pintar el NIF en el pie de
 * todas las páginas, y rompió el build: un layout corre en cada página, así que
 * eran 38 llamadas de red al generar el sitio. Ver el comentario del layout.
 *
 * Cuando falla devuelve la identidad vacía, que es el MISMO caso que «todavía sin
 * configurar»: las pantallas ya saben decirlo y no hay una segunda rama que
 * mantener.
 */
export const IDENTIDAD_VACIA: IdentidadPublica = {
  nombre: null,
  nif: null,
  direccion: null,
  codigo_postal: null,
  ciudad: null,
  provincia: null,
  pais: null,
  email: null,
  whatsapp: null,
  telefono: null,
  identificada: false,
  contactable: false,
};

/**
 * ⚠️⚠️ EL `TIMEOUT` NO ES UN ADORNO, ES LO QUE IMPIDE QUE ESTO TUMBE UN BUILD.
 *
 * Next genera estas páginas estáticamente, y le da a cada una **60 segundos**
 * antes de darla por fallida. Un `fetch` a una API caída no falla rápido: en
 * Windows se queda intentando IPv6 y luego IPv4, y con los reintentos internos
 * puede pasar del minuto. Pasó de verdad el 2026-08-22 —el build se rindió tras
 * tres intentos por página— y habría vuelto a pasar en Vercel, porque la API vive
 * en el plan gratuito de Render y **duerme**: un despliegue con la API fría es el
 * caso normal, no el raro.
 *
 * Con el corte a 5 s, una API dormida cuesta 5 segundos y la página sale con la
 * identidad vacía en vez de no salir. Luego `revalidate` la repinta — pero eso
 * solo empezó a ser cierto al arreglar lo de abajo: el mismo corte que salvaba el
 * build impedía que la regeneración trajera nunca los datos.
 */
const CORTE_MS = 5_000;

/**
 * ⚠️⚠️ Y EL CORTE SOLO EXISTE DURANTE EL BUILD. Medido en producción el
 * 2026-08-22, unas horas después de poner esto: las tres páginas legales seguían
 * diciendo «todavía no están configurados» mucho después de vencer el
 * `revalidate`, con la API respondiendo 200 en 1,5 s. No era que faltara esperar:
 *
 *   · `x-vercel-cache` pasaba de STALE a HIT con `age: 0` → el ISR SÍ regeneraba;
 *   · y la página regenerada seguía saliendo vacía → el `fetch` fallaba en el
 *     servidor, siempre, y el `catch` lo convertía en silencio.
 *
 * Lo que lo delató fue la comparación: `productos/[slug]` hace exactamente el
 * mismo `fetch` a la misma API con `next: { revalidate }` y sí trae datos en
 * producción. La única diferencia era este `signal`. La regeneración de ISR corre
 * en segundo plano, después de haber respondido, con el bucle de eventos
 * congelado entre medias: el temporizador de `AbortSignal.timeout` se dispara en
 * cuanto el bucle revive y aborta la petición antes de que llegue a nada.
 *
 * Durante el build no pasa —el bucle está vivo— y ahí es donde el corte hace
 * falta, porque es donde está el límite de 60 s por página. Así que se queda
 * exactamente ahí y en ningún otro sitio.
 */
const EN_BUILD = process.env.NEXT_PHASE === "phase-production-build";

/**
 * ⚠️⚠️ POR QUÉ ESTO EXISTE, Y ES LA LECCIÓN DE DOS SESIONES PERDIDAS. Las tres
 * páginas legales llevan desde el 22/08 saliendo vacías en producción, y no se ha
 * podido averiguar por qué **porque el `catch` de abajo convierte cualquier fallo en
 * silencio**. Se descartó el `AbortSignal` (el 23/08 se comprobó que el despliegue
 * llevaba 23 h vivo, que el build compila `NEXT_PHASE` como lectura en ejecución, que
 * la API responde 200 en 0,9 s y que el ISR regenera con `Revalidate 5m`) y no queda
 * ninguna hipótesis que se pueda probar DESDE FUERA.
 *
 * Así que el motivo del fallo deja de morir aquí: viaja con la identidad vacía y las
 * páginas lo escriben en un comentario HTML. No se le enseña al cliente —un comentario
 * no se pinta— pero convierte «no sé por qué falla» en un `curl | grep`.
 *
 * ⚠️ Y se queda para siempre, no es andamio: el día que esto vuelva a fallar —por otra
 * causa, en otro despliegue— la respuesta estará en la página en vez de en cuatro
 * horas de bisección.
 */
export interface IdentidadConDiagnostico extends IdentidadPublica {
  /**
   * Qué pasó cuando no se pudo traer la identidad. `null` si fue bien.
   *
   * ⚠️ Truncado a 200 caracteres: es para un comentario HTML, no para un log. Y solo
   * el mensaje del error, nunca el objeto entero, que arrastraría la URL con lo que
   * llevara dentro.
   */
  fallo: string | null;
}

/**
 * La huella del despliegue, para que «¿está esto desplegado?» sea un `grep`.
 *
 * ⚠️⚠️ ES LA OTRA MITAD DE LA LECCIÓN. El 22/08 se perdió media hora sin poder
 * distinguir «Vercel todavía no ha desplegado» de «el arreglo no sirve», porque el
 * commit no cambiaba NADA visible en el cliente: `identidad.ts` es código de servidor
 * y los tipos se borran al compilar. Se intentó con `buildId`, con los chunks y con el
 * hash del CSS, y los tres eran inservibles.
 *
 * `VERCEL_GIT_COMMIT_SHA` lo pone Vercel en el build. En local no existe y sale
 * `local`, que también es la verdad.
 */
export const HUELLA_DESPLIEGUE = (
  process.env.VERCEL_GIT_COMMIT_SHA ?? "local"
).slice(0, 7);

export async function getIdentidad(): Promise<IdentidadConDiagnostico> {
  try {
    const res = await fetch(`${API_URL}/tienda/identidad`, {
      // Cinco minutos. Son datos que cambian una vez al año.
      next: { revalidate: 300 },
      signal: EN_BUILD ? AbortSignal.timeout(CORTE_MS) : undefined,
    });
    if (!res.ok) {
      return { ...IDENTIDAD_VACIA, fallo: `HTTP ${res.status} ${res.statusText}` };
    }
    return { ...((await res.json()) as IdentidadPublica), fallo: null };
  } catch (e) {
    /**
     * ⚠️ Sigue tragándose TODO —red caída, timeout, JSON roto— y devolviendo la
     * identidad vacía, que las pantallas ya saben tratar porque es el mismo caso que
     * «todavía sin configurar». Dejar que esto lance convertiría un hipo de la API en
     * una página que no existe, y esa página es la que existe para dar confianza.
     *
     * ⭐ LO QUE CAMBIA ES QUE YA NO SE TRAGA EL MOTIVO. Antes se perdía aquí y no
     * quedaba forma de saber qué había pasado en el servidor de Vercel.
     */
    const fallo =
      e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200);
    return { ...IDENTIDAD_VACIA, fallo };
  }
}

/**
 * El domicilio en una línea, como se escribe en España: calle, CP, población y
 * provincia. Devuelve `null` si no hay ni calle, porque media dirección no es una
 * dirección.
 *
 * ⚠️ La provincia solo se añade si NO repite la población. «Madrid, Madrid» y
 * «Murcia, Murcia» se leen como una errata, y en España pasa en unas cuantas.
 */
export function domicilioEnUnaLinea(i: IdentidadPublica): string | null {
  if (!i.direccion?.trim()) return null;

  const provincia =
    i.provincia && i.provincia.trim().toLowerCase() !== (i.ciudad ?? "").trim().toLowerCase()
      ? i.provincia
      : null;

  return [i.direccion, [i.codigo_postal, i.ciudad].filter(Boolean).join(" "), provincia]
    .map((t) => t?.trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * El enlace de WhatsApp, o `null` si no hay número.
 *
 * ⚠️ `wa.me` exige el número en dígitos y con prefijo de país. Llega ya
 * normalizado desde la API (migración 081), así que aquí no se limpia nada: si
 * hiciera falta limpiarlo aquí, sería que hay dos sitios normalizando y el día
 * que difieran el enlace nacería roto sin que nadie lo viera.
 */
export function enlaceWhatsapp(i: IdentidadPublica, mensaje?: string): string | null {
  if (!i.whatsapp) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${i.whatsapp}${texto}`;
}

/** El número de WhatsApp como se lee, no como se marca: `+34 600 11 12 22`. */
export function whatsappLegible(i: IdentidadPublica): string | null {
  if (!i.whatsapp) return null;
  // Prefijo español + 9 dígitos es el caso de esta tienda; el resto se deja tal
  // cual con su `+`, que ya es legible y no se puede agrupar sin saber el país.
  const m = /^34(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(i.whatsapp);
  return m ? `+34 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${i.whatsapp}`;
}
