import { dentroDelModulo, desplegado } from "./navegacion";

/**
 * ⚠️⚠️ POR QUÉ SE PRUEBA ESTO Y NO EL COMPONENTE: `SidebarNav.tsx` es un `.tsx` y el
 * runner de la web corre en `node`, sin `jsdom` ni `@testing-library/react` (ver
 * `jest.config.js`). Montar el menú es imposible hoy, así que el criterio se saca a
 * funciones puras y **se prueba la parte que puede estar mal**: qué módulo cuenta como
 * «el actual» y cuándo se ve la lista de submódulos. Lo que queda sin cubrir es puro
 * pintado (la flecha, el giro), y eso se ve a simple vista.
 *
 * Es la misma regla que trajo `lib/seo/mapa-del-sitio.ts` el 27/08: si una lógica
 * importa, vive en `lib/`, porque si no **es intesteable por construcción**.
 */

describe("qué módulo es el actual", () => {
  it("la propia página del módulo cuenta como dentro", () => {
    expect(dentroDelModulo("/backoffice/ti", "/backoffice/ti")).toBe(true);
  });

  it("y sus submódulos también", () => {
    expect(dentroDelModulo("/backoffice/ti/usuarios", "/backoffice/ti")).toBe(true);
    expect(dentroDelModulo("/backoffice/contabilidad/iva", "/backoffice/contabilidad")).toBe(true);
  });

  /**
   * ⭐ Rutas que existen en el panel y NO están en la lista de submódulos —crear una
   * compra, ver una ficha— siguen siendo «dentro de Compras». Es lo que hace que el
   * módulo se quede abierto y marcado mientras trabajas en ellas.
   */
  it("incluye rutas del módulo que no son submódulos declarados", () => {
    expect(dentroDelModulo("/backoffice/compras/nueva", "/backoffice/compras")).toBe(true);
    expect(dentroDelModulo("/backoffice/compras/0e5f-abc", "/backoffice/compras")).toBe(true);
  });

  it("otro módulo no cuenta", () => {
    expect(dentroDelModulo("/backoffice/pedidos", "/backoffice/perfil")).toBe(false);
    expect(dentroDelModulo("/backoffice", "/backoffice/ti")).toBe(false);
  });

  /**
   * ⚠️⚠️ EL QUE DE VERDAD GUARDA ALGO, y es la razón de que el prefijo lleve barra
   * final. Sin ella, `startsWith("/backoffice/compras")` daría por «dentro» a
   * `/backoffice/compras-viejas`, y saldrían DOS módulos abiertos y marcados a la vez.
   * Es un fallo que no existe hoy porque ningún nombre es prefijo de otro — o sea que
   * lo trae el día que alguien añada un módulo con un nombre parecido, que es
   * exactamente cuando nadie estará mirando esta función.
   */
  it("un módulo cuyo nombre EMPIEZA igual que otro no cuenta como dentro", () => {
    expect(dentroDelModulo("/backoffice/compras-viejas", "/backoffice/compras")).toBe(false);
    expect(dentroDelModulo("/backoffice/tienda", "/backoffice/ti")).toBe(false);
  });
});

describe("cuándo se ve la lista de submódulos", () => {
  /**
   * ⭐⭐ ESTO ES EL ARREGLO DEL 28/08 EN UNA LÍNEA. Antes la lista solo existía si ya
   * estabas dentro del módulo: para elegir un submódulo de TI había que entrar en TI
   * primero, y esa primera navegación era a ciegas. Ahora un clic en la flecha la
   * abre **estando fuera**.
   */
  it("se puede desplegar un módulo en el que NO estás", () => {
    expect(desplegado(true, false)).toBe(true);
  });

  it("el módulo en el que estás sale abierto sin tener que pulsar nada", () => {
    expect(desplegado(undefined, true)).toBe(true);
  });

  it("y los demás salen cerrados", () => {
    expect(desplegado(undefined, false)).toBe(false);
  });

  /** Se puede cerrar a mano el módulo en el que estás, si estorba. */
  it("lo que pulsa la persona manda sobre la ruta", () => {
    expect(desplegado(false, true)).toBe(false);
  });

  /**
   * ⚠️ `undefined` es «no me he pronunciado» y **no es lo mismo que `false`**. Si se
   * confundieran, el módulo en el que estás saldría cerrado y volveríamos al problema
   * de partida. Es la misma distinción que `null` vs `[]` en el mapa del sitio: no
   * saber no es decir que no.
   */
  it("«no me he pronunciado» no es «cerrado»", () => {
    expect(desplegado(undefined, true)).not.toBe(desplegado(false, true));
  });
});
