import { CABECERA_PROXY_SECRETO, CABECERA_IP_CLIENTE } from "@valatino/types";

/**
 * Las cabeceras con las que el proxy `/api` se identifica ante la API.
 *
 * El porqué está en `packages/types`: al pasar por Vercel se añade un salto, y
 * la API acaba contando la cuota por la IP del nodo de Vercel en vez de por la
 * del cliente — o sea, toda la tienda en el mismo cubo de 100/min.
 *
 * Vive aquí y no dentro de `middleware.ts` porque la web no tiene tests de
 * componentes ni de middleware: una regla escrita dentro del middleware es una
 * regla sin red. Aquí es una función pura con su spec al lado.
 */

const CADENA_REENVIOS = "x-forwarded-for";

/**
 * De dónde sale la IP del cliente: la **ÚLTIMA** entrada de `x-forwarded-for`.
 *
 * ⚠️⚠️ LA ÚLTIMA, Y ESTO ES LO ÚNICO DELICADO DE TODO EL ARREGLO.
 *
 * La primera entrada es la tentación, porque en la convención de la cabecera es
 * «el cliente original». Pero esa cadena la puede empezar a escribir el propio
 * cliente, y cada proxy va AÑADIENDO por la derecha: la última la escribe el
 * proxy más cercano, que aquí es Vercel, y esa no la toca nadie de fuera.
 *
 * Si se cogiera la primera y Vercel añadiera en vez de sobrescribir, cualquiera
 * mandaría un `x-forwarded-for` inventado y distinto en cada petición: cubo
 * nuevo cada vez y límite inexistente. O sea, se habría cambiado un problema de
 * reparto por un agujero — **peor que no hacer nada**.
 *
 * Cogiendo la última se acierta con los dos comportamientos posibles de Vercel:
 *
 *   - si SOBRESCRIBE la cabecera, hay una sola entrada y es la buena;
 *   - si AÑADE, la suya queda la última y las inventadas se quedan detrás.
 *
 * Y en el peor caso imaginable —que lo que añada Vercel sea una IP interna
 * suya— lo que pasa es que no mejora nada y se sigue agrupando como hoy. Nunca
 * que alguien se salte el límite. Ante la duda, se elige el fallo que no abre
 * la puerta.
 *
 * ⚠️ Por lo mismo NO se mira `x-real-ip`: es una cabecera sin espacio de
 * nombres reservado, y no consta que Vercel la limpie si la manda el cliente.
 * Sin `x-forwarded-for` no se declara ninguna IP y la API se queda con
 * `req.ip`, que es lo que hacía antes de todo esto.
 */
export function ipDelCliente(entrantes: Headers): string | null {
  const cadena = entrantes.get(CADENA_REENVIOS);
  if (!cadena) return null;

  const partes = cadena.split(",").map((p) => p.trim()).filter((p) => p !== "");
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

/**
 * Las cabeceras que hay que añadir al reenviar, o `null` si no hay secreto
 * configurado.
 *
 * ⚠️ Devolver `null` es una decisión, no un descuido: en local no hay secreto y
 * la tienda tiene que funcionar igual. La API, sin reconocer al proxy, se queda
 * con `req.ip` — que es exactamente lo que hacía antes de todo esto.
 *
 * ⚠️⚠️ Las dos cabeceras se ESCRIBEN SIEMPRE, nunca se reenvía lo que venga de
 * fuera. Si un cliente manda su propia `x-valatino-ip` para colarse en otro
 * cubo, aquí se le pisa. Ese `set` es media seguridad del asunto.
 */
export function cabecerasDelProxy(
  entrantes: Headers,
  secreto: string | undefined,
): Headers | null {
  if (!secreto) return null;

  const salida = new Headers(entrantes);
  salida.set(CABECERA_PROXY_SECRETO, secreto);

  const ip = ipDelCliente(entrantes);
  if (ip) salida.set(CABECERA_IP_CLIENTE, ip);
  else salida.delete(CABECERA_IP_CLIENTE);

  return salida;
}
