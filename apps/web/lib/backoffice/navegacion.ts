/**
 * Las dos decisiones del menú del panel: **si estoy dentro de un módulo** y **si su
 * lista de submódulos está desplegada**.
 *
 * ⚠️⚠️ VIVEN AQUÍ Y NO EN `SidebarNav.tsx` PORQUE EL COMPONENTE NO SE PUEDE PROBAR:
 * el runner de la web corre en `node` y no tiene `jsdom` ni `@testing-library/react`
 * (ver `jest.config.js`), así que un `.tsx` con JSX no se puede montar. Sacar el
 * criterio a una función pura es lo que permite que la parte que **puede estar mal**
 * tenga tests, y es la misma regla que trajo `lib/seo/mapa-del-sitio.ts`: si una
 * lógica importa, vive en `lib/`.
 *
 * ── EL PROBLEMA QUE ARREGLA ESTO ──
 *
 * Hasta el 28/08 los submódulos solo se pintaban `&& dentroDelModulo`: para ver qué
 * hay dentro de TI **había que entrar primero en TI**. O sea que para elegir un
 * submódulo hacían falta dos navegaciones, y la primera era a ciegas — no se sabía
 * qué opciones había hasta llegar. Ahora hay una flecha que despliega sin salir de
 * donde estés.
 */

/**
 * ¿La ruta actual cae dentro de este módulo?
 *
 * ⚠️ La barra final del prefijo **no es un detalle de estilo**: sin ella,
 * `/backoffice/compras` daría por «dentro» a una futura `/backoffice/compras-viejas`,
 * y el módulo equivocado saldría abierto y marcado. Hay un test que lo fija.
 */
export function dentroDelModulo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * ¿Se ve la lista de submódulos?
 *
 * ⭐ La regla, y el orden importa: **manda lo que haya pulsado la persona**; si no ha
 * pulsado nada, se sigue la ruta. Así el módulo en el que estás aparece abierto sin
 * que nadie tenga que abrirlo, y a la vez se puede cerrar a mano cuando estorba.
 *
 * `forzado === undefined` es «no me he pronunciado», que **no es lo mismo que
 * `false`**. Confundir «no lo sé» con «no» es la avería que este proyecto lleva
 * arreglando toda la semana en otros sitios (ver `lib/seo/mapa-del-sitio.ts`); aquí
 * costaría solo un menú cerrado, pero el criterio es el mismo.
 */
export function desplegado(forzado: boolean | undefined, dentro: boolean): boolean {
  return forzado ?? dentro;
}
