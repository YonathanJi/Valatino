import { API_URL } from "@lib/api/client";
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
 * identidad vacía en vez de no salir. `revalidate` la arregla en la siguiente
 * visita pasados los 5 minutos.
 */
const CORTE_MS = 5_000;

export async function getIdentidad(): Promise<IdentidadPublica> {
  try {
    const res = await fetch(`${API_URL}/tienda/identidad`, {
      // Cinco minutos. Son datos que cambian una vez al año.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(CORTE_MS),
    });
    if (!res.ok) return IDENTIDAD_VACIA;
    return (await res.json()) as IdentidadPublica;
  } catch {
    /**
     * ⚠️ Se traga TODO —red caída, timeout, JSON roto— y devuelve la identidad
     * vacía, que las pantallas ya saben tratar porque es el mismo caso que
     * «todavía sin configurar». Dejar que esto lance convertiría un hipo de la
     * API en una página que no existe.
     */
    return IDENTIDAD_VACIA;
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
