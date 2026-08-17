import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";
import { CABECERA_PROXY_SECRETO, CABECERA_IP_CLIENTE } from "@valatino/types";

/**
 * De quién es la cuota: el cliente de verdad, no el proxy que lo trae.
 *
 * El `ThrottlerGuard` de serie usa `req.ip`, y con `TRUST_PROXY_HOPS=1` eso es
 * correcto SOLO para quien llama a la API en directo. La tienda no llama en
 * directo: pasa por el proxy `/api` de Vercel, que añade un salto, así que
 * `req.ip` es la IP del nodo de Vercel — **y todos los clientes que caen en ese
 * nodo comparten el cubo de 100/min**. Dos personas comprando desde Madrid se
 * quitan la cuota entre ellas.
 *
 * ⚠️ Lo que NO se hace, y es lo primero que apetece: subir los saltos a 2. A
 * esta misma API se llega también en directo (la confirmación del pedido y el
 * widget de calificar hablan con `api.valatino.es`), y con 2 saltos cualquiera
 * que llame en directo con un `X-Forwarded-For` de su invención estrena cubo en
 * cada petición: el límite deja de existir. El número de saltos es una
 * propiedad del CAMINO, no del servidor, y aquí hay dos caminos de profundidad
 * distinta. No hay número que sirva para los dos.
 *
 * Así que el proxy se identifica. Si trae el secreto, la IP que declara es
 * buena; si no, se usa `req.ip` como siempre.
 *
 * ⚠️⚠️ SIN SECRETO CONFIGURADO ESTO NO FALLA: se comporta exactamente como
 * antes. Es a propósito — el día que se despliegue la web con el secreto y la
 * API sin él (o al revés) la tienda tiene que seguir vendiendo, no caerse. El
 * precio es que la avería es muda, y por eso `main.ts` lo dice al arrancar y
 * hay un endpoint de diagnóstico que enseña qué está viendo la API.
 */
@Injectable()
export class ThrottlerIpRealGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return decidirIpDeLaCuota(req, process.env.PROXY_API_SECRETO).ip;
  }
}

/** Lo que se decidió y por qué. El `motivo` es lo que enseña el diagnóstico. */
export interface IpDeLaCuota {
  ip: string;
  proxyIdentificado: boolean;
  motivo: "proxy-identificado" | "sin-secreto" | "secreto-no-coincide" | "proxy-sin-ip";
}

/**
 * La decisión, aparte del guard para poder probarla y para que el endpoint de
 * diagnóstico enseñe EXACTAMENTE lo que se aplica, y no una copia parecida que
 * con el tiempo dejaría de coincidir.
 */
export function decidirIpDeLaCuota(
  req: Record<string, unknown>,
  secreto: string | undefined,
): IpDeLaCuota {
  const cabeceras = (req.headers ?? {}) as Record<string, unknown>;
  const ipDeLaConexion = (req.ip as string | undefined) ?? "";

  if (!secreto) {
    return { ip: ipDeLaConexion, proxyIdentificado: false, motivo: "sin-secreto" };
  }

  const declarado = cabeceras[CABECERA_PROXY_SECRETO];
  if (typeof declarado !== "string" || !igualEnTiempoConstante(declarado, secreto)) {
    return { ip: ipDeLaConexion, proxyIdentificado: false, motivo: "secreto-no-coincide" };
  }

  const ip = cabeceras[CABECERA_IP_CLIENTE];
  if (typeof ip !== "string" || ip.trim() === "") {
    // El proxy se identifica pero no trae IP (Vercel no se la dio). Se cae a
    // `req.ip`: agrupar por el proxy es impreciso, pero inventarse una clave
    // fija metería a todo el mundo en el mismo cubo a ciegas.
    return { ip: ipDeLaConexion, proxyIdentificado: true, motivo: "proxy-sin-ip" };
  }

  return { ip: ip.trim(), proxyIdentificado: true, motivo: "proxy-identificado" };
}

/**
 * Comparación sin filtrar el secreto por el tiempo que tarda.
 *
 * La longitud sí se filtra (`timingSafeEqual` exige buffers iguales y hay que
 * comprobarlo antes), y se acepta: saber cuántos caracteres tiene no acerca a
 * nadie a adivinarlo.
 */
function igualEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
