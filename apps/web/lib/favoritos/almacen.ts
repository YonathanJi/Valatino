import { TOPE_FAVORITOS } from "@valatino/types";

/**
 * Los favoritos guardados en ESTE navegador.
 *
 * ── POR QUÉ EL INVITADO NO VA AL SERVIDOR ──
 *
 * El carrito sí: tiene una cookie de sesión y tablas propias (`carritos.session_id`,
 * `fusionarCarrito`). Los favoritos no, y son tres motivos medidos —el detalle entero
 * está en la cabecera de la migración 085—:
 *
 *   1. El carrito NECESITA servidor (reserva de stock, precio congelado, checkout).
 *      Esto es una lista de ids.
 *   2. **La API duerme**: 42,5 s de arranque en frío medidos el 28/08. Un corazón es
 *      un microgesto y no puede esperar a que Render despierte. Y como el catálogo se
 *      sirve de caché ISR, alguien puede llegar al corazón sin haberla despertado.
 *   3. La cookie de invitado **tampoco cruza dispositivos**. Hacerlo en servidor no
 *      compraría durabilidad ninguna y costaría toda la latencia.
 *
 * ── POR QUÉ ESTE FICHERO ES DE FUNCIONES PURAS ──
 *
 * ⚠️⚠️ Porque el runner de la web corre en `node` sin `jsdom` (ver `jest.config.js`)
 * y solo mira `lib/` y `components/`: un `.tsx` no se puede montar. Lo que puede
 * estar mal —normalizar basura, unir listas, respetar el tope— vive aquí y tiene
 * tests; el componente queda de puro pintado. Es la misma regla que trajo
 * `lib/seo/mapa-del-sitio.ts` y `lib/backoffice/navegacion.ts`.
 */

/** Dónde se guarda. Con prefijo, para no chocar con nada más del dominio. */
export const CLAVE = "valatino:favoritos";

/**
 * Deja una lista en condiciones venga de donde venga.
 *
 * ⚠️ Esto lee algo que escribió **una versión anterior de la tienda** o que alguien
 * pudo tocar a mano desde la consola del navegador. No es entrada de confianza: se
 * filtra lo que no sea texto, se quitan repetidos y se aplica el tope. Un `as
 * string[]` aquí sería creerse lo que dice el almacén.
 */
export function normalizar(crudo: unknown): string[] {
  if (!Array.isArray(crudo)) return [];
  const limpio = crudo.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(limpio)].slice(0, TOPE_FAVORITOS);
}

/**
 * Lo guardado en este navegador. **Nunca lanza.**
 *
 * ⚠️⚠️ El `try` envuelve hasta el ACCESO a `localStorage`, no solo el `getItem`: en
 * modo privado y con las cookies bloqueadas hay navegadores que lanzan al tocar la
 * propiedad. Y en el servidor no existe `window` — este módulo lo importa un
 * componente de cliente, pero el primer render ocurre en el servidor.
 */
export function leer(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    return normalizar(JSON.parse(crudo));
  } catch {
    // JSON roto, almacén bloqueado o sin `window`: no hay favoritos y no pasa nada.
    return [];
  }
}

/**
 * Guarda. **Nunca lanza.** Devuelve si se pudo.
 *
 * ⚠️ Que devuelva `false` no es un fallo que haya que enseñar: en modo privado la
 * tienda sigue funcionando, los favoritos viven en memoria mientras dure la pestaña.
 * Lo que no puede es reventar la página por no poder escribir.
 */
export function escribir(ids: string[]): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(CLAVE, JSON.stringify(normalizar(ids)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Une dos listas sin repetir, **conservando el orden de la primera**.
 *
 * ⚠️⚠️ SE UNE, NO SE REEMPLAZA, y esa es la decisión de fondo de toda la
 * funcionalidad. Al iniciar sesión hay dos listas: la que traía el invitado y la de
 * su cuenta. Quedarse con una y tirar la otra pierde algo que alguien guardó a
 * propósito — y perder la del invitado es lo peor, porque lo acaba de hacer y lo está
 * mirando. Es la misma decisión que `fusionarCarrito`, que suma cantidades en vez de
 * quedarse con un carrito.
 */
export function unir(a: string[], b: string[]): string[] {
  return normalizar([...normalizar(a), ...normalizar(b)]);
}

/**
 * Pone o quita un id.
 *
 * Lo nuevo entra **el primero**, para que la página lo enseñe arriba — el mismo
 * orden que devuelve la API (`order created_at desc`).
 *
 * ⚠️ Al llegar al tope, lo que se cae es lo MÁS VIEJO. Se elige eso frente a negarse
 * a guardar porque un corazón que no responde parece roto, y porque el tope está muy
 * por encima del catálogo entero. Queda dicho aquí para que no sorprenda.
 */
export function alternar(ids: string[], id: string): string[] {
  const actuales = normalizar(ids);
  return actuales.includes(id)
    ? actuales.filter((x) => x !== id)
    : normalizar([id, ...actuales]);
}

/** Si ya no cabe ninguno más. Lo mira la interfaz para poder avisar. */
export function estaLleno(ids: string[]): boolean {
  return normalizar(ids).length >= TOPE_FAVORITOS;
}
