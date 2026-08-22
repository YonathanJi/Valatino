import { API_URL } from "@lib/api/client";
import type { IdentidadPublica } from "@valatino/types";

/**
 * Quién vende y cómo se le pregunta, para el pie, el aviso legal y el contacto.
 *
 * ⚠️⚠️ NUNCA LANZA, y eso no es pereza: esto lo pinta el PIE DE PÁGINA, o sea
 * todas las páginas de la tienda. Si un hipo de la API propagara la excepción,
 * la tienda entera dejaría de responder por no poder pintar un aviso legal — que
 * es exactamente al revés de lo que interesa.
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

export async function getIdentidad(): Promise<IdentidadPublica> {
  try {
    const res = await fetch(`${API_URL}/tienda/identidad`, {
      // Cinco minutos. Son datos que cambian una vez al año, y el pie los pide en
      // cada página: sin caché sería una llamada a la API por visita.
      next: { revalidate: 300 },
    });
    if (!res.ok) return IDENTIDAD_VACIA;
    return (await res.json()) as IdentidadPublica;
  } catch {
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
