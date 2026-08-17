import { CABECERA_PROXY_SECRETO, CABECERA_IP_CLIENTE } from "@valatino/types";
import { cabecerasDelProxy, ipDelCliente } from "./cabeceras-proxy";

/**
 * Lo que estas pruebas tienen que garantizar es UNA cosa, y es de seguridad:
 * que la IP que el proxy le declara a la API **no la pueda elegir el cliente**.
 *
 * Si se pudiera, cualquiera estrenaría cubo de 100/min en cada petición
 * mandando una `x-valatino-ip` distinta, y el límite dejaría de existir — que
 * es exactamente el agujero que se abriría subiendo `TRUST_PROXY_HOPS` a 2, y
 * el motivo de montar todo esto en vez de cambiar un número.
 */

const SECRETO = "un-secreto-cualquiera";

describe("cabecerasDelProxy", () => {
  it("firma la petición y declara la IP que dice Vercel", () => {
    const entrantes = new Headers({ "x-forwarded-for": "203.0.113.5" });

    const salida = cabecerasDelProxy(entrantes, SECRETO);

    expect(salida?.get(CABECERA_PROXY_SECRETO)).toBe(SECRETO);
    expect(salida?.get(CABECERA_IP_CLIENTE)).toBe("203.0.113.5");
  });

  // EL test. Un cliente que intenta elegir su propio cubo.
  it("pisa la IP que venga de fuera, no la reenvía", () => {
    const entrantes = new Headers({
      "x-forwarded-for": "203.0.113.5",
      [CABECERA_IP_CLIENTE]: "9.9.9.9",
    });

    const salida = cabecerasDelProxy(entrantes, SECRETO);

    expect(salida?.get(CABECERA_IP_CLIENTE)).toBe("203.0.113.5");
  });

  // Y el mismo intento con el secreto: aunque acierte el nombre, se sobrescribe.
  it("pisa también el secreto que venga de fuera", () => {
    const entrantes = new Headers({
      "x-forwarded-for": "203.0.113.5",
      [CABECERA_PROXY_SECRETO]: "me-lo-invento",
    });

    const salida = cabecerasDelProxy(entrantes, SECRETO);

    expect(salida?.get(CABECERA_PROXY_SECRETO)).toBe(SECRETO);
  });

  // Sin secreto la tienda tiene que seguir funcionando igual: es el caso de
  // local, y el de un despliegue a medias.
  it("sin secreto configurado no añade nada", () => {
    const salida = cabecerasDelProxy(new Headers({ "x-forwarded-for": "203.0.113.5" }), undefined);

    expect(salida).toBeNull();
  });

  // Si Vercel no diera la IP, es preferible no declarar ninguna a declarar una
  // inventada: la API se queda con req.ip, que es el comportamiento de antes.
  it("si no hay IP que declarar, firma pero no se inventa una", () => {
    const salida = cabecerasDelProxy(new Headers(), SECRETO);

    expect(salida?.get(CABECERA_PROXY_SECRETO)).toBe(SECRETO);
    expect(salida?.get(CABECERA_IP_CLIENTE)).toBeNull();
  });

  it("y tampoco deja pasar la de fuera cuando Vercel no da ninguna", () => {
    const entrantes = new Headers({ [CABECERA_IP_CLIENTE]: "9.9.9.9" });

    const salida = cabecerasDelProxy(entrantes, SECRETO);

    expect(salida?.get(CABECERA_IP_CLIENTE)).toBeNull();
  });

  // El intento completo, tal cual lo haría alguien: mandar una cadena entera
  // inventada por delante de la que ponga Vercel.
  it("un x-forwarded-for inventado por delante no cambia la IP declarada", () => {
    const entrantes = new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.5" });

    const salida = cabecerasDelProxy(entrantes, SECRETO);

    expect(salida?.get(CABECERA_IP_CLIENTE)).toBe("203.0.113.5");
  });
});

describe("ipDelCliente", () => {
  // Si Vercel SOBRESCRIBE la cabecera, hay una sola entrada y es la buena.
  it("con una sola entrada, esa", () => {
    expect(ipDelCliente(new Headers({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  /**
   * EL test de seguridad de este fichero, y la razón de coger la última.
   *
   * Si Vercel AÑADE en vez de sobrescribir, lo que el cliente haya escrito se
   * queda a la izquierda y lo de Vercel a la derecha. Coger la primera —que es
   * lo que dice la convención de la cabecera— sería dejar que el cliente
   * eligiera su cubo y estrenara uno en cada petición.
   */
  it("con varias, la ÚLTIMA: las de delante las puede escribir el cliente", () => {
    const cabeceras = new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.5" });

    expect(ipDelCliente(cabeceras)).toBe("203.0.113.5");
  });

  it("aguanta espacios y entradas vacías", () => {
    const cabeceras = new Headers({ "x-forwarded-for": " 9.9.9.9 ,, 203.0.113.5 ," });

    expect(ipDelCliente(cabeceras)).toBe("203.0.113.5");
  });

  // No se mira x-real-ip: no consta que Vercel la limpie si la manda el
  // cliente, y equivocarse ahí abre justo el agujero que se quiere cerrar.
  it("ignora x-real-ip aunque venga", () => {
    expect(ipDelCliente(new Headers({ "x-real-ip": "9.9.9.9" }))).toBeNull();
  });

  it("sin nada de donde sacarla, devuelve null", () => {
    expect(ipDelCliente(new Headers())).toBeNull();
  });
});
