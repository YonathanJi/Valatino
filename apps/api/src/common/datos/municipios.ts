import { provinciaPorCP } from "@valatino/types";
import { MUNICIPIOS_POR_PROVINCIA } from "./municipios.generado";

/**
 * Resolución de municipios contra el diccionario del INE.
 *
 * La comparación es TOLERANTE (ignora mayúsculas, acentos y espacios de más) y
 * el resultado es CANÓNICO: se acepta que alguien escriba «MEJORADA DEL CAMPO»
 * o «mejorada  del campo», y se guarda «Mejorada del Campo». Así el campo deja
 * de acumular variantes del mismo sitio sin castigar a quien teclea rápido.
 */

/** Clave de comparación: minúsculas, sin acentos y con un solo espacio. */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // marcas combinantes que deja NFD
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Índice por provincia construido una sola vez al cargar el módulo: hacerlo en
 * cada petición serían 8.132 normalizaciones por dirección validada.
 */
const INDICE = new Map<string, Map<string, string>>();
for (const [cpro, municipios] of Object.entries(MUNICIPIOS_POR_PROVINCIA)) {
  const porClave = new Map<string, string>();
  for (const nombre of municipios) porClave.set(clave(nombre), nombre);
  INDICE.set(cpro, porClave);
}

/** Municipios de una provincia por su código INE. */
export function municipiosDe(cpro: string): readonly string[] {
  return MUNICIPIOS_POR_PROVINCIA[cpro] ?? [];
}

/**
 * Nombre oficial del municipio si pertenece a la provincia del código postal,
 * o `null` si no existe ahí.
 *
 * Se valida contra la provincia que sale del CP y no contra las 8.132 de toda
 * España: así «Barcelona» con un CP de Madrid no cuela. Un municipio que existe
 * pero a 600 km del código postal es un error de datos, no una dirección.
 */
export function municipioCanonico(codigoPostal: string, ciudad: string): string | null {
  const cpro = codigoPostal.trim().slice(0, 2);
  if (!provinciaPorCP(codigoPostal)) return null;
  return INDICE.get(cpro)?.get(clave(ciudad)) ?? null;
}
