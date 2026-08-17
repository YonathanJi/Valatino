import { CABECERA_PROXY_SECRETO, CABECERA_IP_CLIENTE } from "@valatino/types";
import { decidirIpDeLaCuota } from "./throttler-ip-real.guard";

/**
 * De quién es la cuota de 100/min.
 *
 * El caso que hay que blindar es el de abajo del todo: quien llama a la API en
 * DIRECTO no puede elegir su cubo. Si pudiera, estrenaría uno en cada petición
 * y el límite sería decorativo — que es justo lo que pasaría subiendo
 * `TRUST_PROXY_HOPS` a 2, comprobado en su momento con Express de verdad:
 *
 *   hops=1 → XFF="1.2.3.4, IPreal" → req.ip = IPreal   (la mentira se ignora)
 *   hops=2 → XFF="1.2.3.4, IPreal" → req.ip = 1.2.3.4  (se la cree)
 *
 * Por eso la API no sube el número de saltos: exige que el proxy se identifique.
 */

const SECRETO = "un-secreto-cualquiera";

/** Una petición como la ve Express: `ip` ya resuelta por `trust proxy`. */
function peticion(ip: string, cabeceras: Record<string, string> = {}) {
  return { ip, headers: cabeceras };
}

describe("decidirIpDeLaCuota", () => {
  it("con el secreto bueno, la cuota es del cliente y no del proxy", () => {
    const req = peticion("76.76.21.21", {
      [CABECERA_PROXY_SECRETO]: SECRETO,
      [CABECERA_IP_CLIENTE]: "203.0.113.5",
    });

    expect(decidirIpDeLaCuota(req, SECRETO)).toEqual({
      ip: "203.0.113.5",
      proxyIdentificado: true,
      motivo: "proxy-identificado",
    });
  });

  // EL test: alguien que llama directo a api.valatino.es imitando al proxy.
  it("sin el secreto bueno NO se le cree la IP, aunque mande la cabecera", () => {
    const req = peticion("198.51.100.9", {
      [CABECERA_PROXY_SECRETO]: "me-lo-invento",
      [CABECERA_IP_CLIENTE]: "9.9.9.9",
    });

    const decision = decidirIpDeLaCuota(req, SECRETO);

    expect(decision.ip).toBe("198.51.100.9");
    expect(decision.proxyIdentificado).toBe(false);
    expect(decision.motivo).toBe("secreto-no-coincide");
  });

  it("y tampoco si manda la IP sin ningún secreto", () => {
    const req = peticion("198.51.100.9", { [CABECERA_IP_CLIENTE]: "9.9.9.9" });

    const decision = decidirIpDeLaCuota(req, SECRETO);
    expect(decision.ip).toBe("198.51.100.9");
    expect(decision.motivo).toBe("sin-cabecera");
  });

  /**
   * Los dos motivos se separan porque se arreglan en sitios distintos, y
   * juntarlos costó una vuelta entera: el diagnóstico decía «secreto no
   * coincide» tanto cuando la web no mandaba nada (falta la variable en Vercel
   * o falta redesplegar) como cuando los dos valores diferían de verdad.
   */
  it("distingue «no llegó la cabecera» de «llegó y no coincide»", () => {
    const sinNada = peticion("198.51.100.9");
    const conOtro = peticion("198.51.100.9", { [CABECERA_PROXY_SECRETO]: "otro-distinto-aa" });

    expect(decidirIpDeLaCuota(sinNada, SECRETO).motivo).toBe("sin-cabecera");
    expect(decidirIpDeLaCuota(conOtro, SECRETO).motivo).toBe("secreto-no-coincide");
  });

  // El despliegue a medias: la web ya manda la cabecera y la API aún no tiene
  // el secreto. Tiene que comportarse como antes, no caerse ni fiarse.
  it("sin secreto en la API se vuelve al comportamiento de siempre", () => {
    const req = peticion("76.76.21.21", {
      [CABECERA_PROXY_SECRETO]: SECRETO,
      [CABECERA_IP_CLIENTE]: "203.0.113.5",
    });

    const decision = decidirIpDeLaCuota(req, undefined);

    expect(decision.ip).toBe("76.76.21.21");
    expect(decision.motivo).toBe("sin-secreto");
  });

  it("proxy identificado pero sin IP: se cae a la de la conexión", () => {
    const req = peticion("76.76.21.21", { [CABECERA_PROXY_SECRETO]: SECRETO });

    expect(decidirIpDeLaCuota(req, SECRETO)).toEqual({
      ip: "76.76.21.21",
      proxyIdentificado: true,
      motivo: "proxy-sin-ip",
    });
  });

  it("una IP en blanco no cuenta como IP", () => {
    const req = peticion("76.76.21.21", {
      [CABECERA_PROXY_SECRETO]: SECRETO,
      [CABECERA_IP_CLIENTE]: "   ",
    });

    expect(decidirIpDeLaCuota(req, SECRETO).motivo).toBe("proxy-sin-ip");
  });

  // Un secreto de otra longitud no puede reventar la comparación en tiempo
  // constante: timingSafeEqual exige buffers iguales y lanza si no lo son.
  it("un secreto de otra longitud se rechaza sin reventar", () => {
    const req = peticion("198.51.100.9", { [CABECERA_PROXY_SECRETO]: "corto" });

    expect(() => decidirIpDeLaCuota(req, SECRETO)).not.toThrow();
    expect(decidirIpDeLaCuota(req, SECRETO).proxyIdentificado).toBe(false);
  });

  it("una petición sin cabeceras no rompe nada", () => {
    expect(decidirIpDeLaCuota({ ip: "198.51.100.9" }, SECRETO).ip).toBe("198.51.100.9");
  });
});
