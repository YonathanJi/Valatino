/**
 * Cuándo se le puede enseñar al cliente el mensaje de una RPC.
 *
 * Las funciones de la BD hacen `raise exception 'Solo hay 3 de «X» sin
 * reservar'`: eso está escrito para que alguien lo lea y actúe, y devolverlo
 * tal cual es mejor UX que un mensaje genérico.
 *
 * ⚠️ Pero varios sitios devolvían **cualquier** `error.message` de la RPC, y
 * ahí caben también los de Postgres: `duplicate key value violates unique
 * constraint "..."`, `relation "..." does not exist`, un fallo de conexión.
 * Eso publica nombres de tablas y restricciones en un 400, que el filtro de
 * errores no depura porque los 4xx sí deben explicar qué pasó.
 *
 * La frontera es el SQLSTATE: `raise exception` sin `using errcode` da
 * **P0001**, que es exactamente «lo ha escrito una persona en la migración».
 * Todo lo demás lo genera el motor.
 *
 * Las RPC que quieren distinguir casos usan su propio código a propósito (el
 * checkout mira P0002/P0003 para carrito inexistente o vacío); esas se
 * comprueban en su sitio, que es donde se sabe qué significa cada uno.
 */
export const SQLSTATE_MENSAJE_ESCRITO_A_MANO = "P0001";

export function esMensajeParaElUsuario(error: { code?: string | null }): boolean {
  return error.code === SQLSTATE_MENSAJE_ESCRITO_A_MANO;
}
