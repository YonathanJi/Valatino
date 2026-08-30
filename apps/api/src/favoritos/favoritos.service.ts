import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { TOPE_FAVORITOS } from "@valatino/types";

/**
 * Los favoritos de un cliente CON CUENTA.
 *
 * ⚠️⚠️ AQUÍ NO HAY NADA DE INVITADOS, Y ES EL DISEÑO. Los favoritos de quien no ha
 * iniciado sesión viven en el `localStorage` de su navegador y no tocan la base
 * nunca; solo suben cuando inicia sesión, por `fusionar`. El porqué está entero en
 * la cabecera de la migración 085, pero el resumen es que la API duerme —42,5 s de
 * arranque en frío medidos el 28/08— y un corazón es un microgesto: no puede
 * esperar a que Render despierte.
 *
 * ⭐ TODO SE APOYA EN EL UNIQUE `(user_id, producto_id)` de la 085. Es lo que hace
 * que guardar sea idempotente **sin leer antes**: un `upsert` con `ignoreDuplicates`
 * y ya está. La alternativa —consultar y luego insertar— es una carrera, la misma
 * que costó el correo duplicado de los reembolsos el 26/08.
 */
@Injectable()
export class FavoritosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Los ids que este cliente tiene guardados, el último primero.
   *
   * ⚠️ Devuelve IDS y no productos a propósito: un invitado tiene que resolver su
   * lista por el catálogo público igualmente (`GET /productos?ids=…`), así que si
   * esto devolviera productos habría dos formas de pintar la misma página según si
   * hay sesión. Con ids, el camino de pintado es uno solo.
   */
  async listar(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("favoritos")
      .select("producto_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(TOPE_FAVORITOS);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los favoritos");

    return ((data as Array<{ producto_id: string }>) ?? []).map((f) => f.producto_id);
  }

  /**
   * Guardar. Repetirlo no hace nada, y eso lo decide la base, no una lectura previa.
   *
   * ⚠️ El `ignoreDuplicates` es lo que convierte el choque contra el unique en un
   * «ya estaba» en vez de en un error. Sin él, el segundo toque en un móvil daría un
   * 500 por hacer justo lo que el cliente quería.
   */
  async guardar(userId: string, productoId: string): Promise<void> {
    const { error } = await this.supabase
      .from("favoritos")
      .upsert({ user_id: userId, producto_id: productoId }, {
        onConflict: "user_id,producto_id",
        ignoreDuplicates: true,
      });

    /**
     * ⚠️ Un `producto_id` que no existe choca contra la clave foránea (23503). No es
     * un fallo del servidor: es que el navegador traía un id de un producto borrado.
     * Se traga en silencio porque el cliente no puede hacer nada al respecto y su
     * lista local ya se limpia sola al pintar (los ids sin producto no salen).
     */
    if (error && error.code !== "23503") {
      throw new InternalServerErrorException("No se pudo guardar en favoritos");
    }
  }

  /** Quitar. Quitar algo que no estaba tampoco es un error. */
  async quitar(userId: string, productoId: string): Promise<void> {
    const { error } = await this.supabase
      .from("favoritos")
      .delete()
      .eq("user_id", userId)
      .eq("producto_id", productoId);

    if (error) throw new InternalServerErrorException("No se pudo quitar de favoritos");
  }

  /**
   * Al iniciar sesión: los favoritos que traía el invitado **se SUMAN** a los que ya
   * hubiera en la cuenta.
   *
   * ⚠️⚠️ SE UNEN, NO SE REEMPLAZAN, y en las dos direcciones. Reemplazar en
   * cualquiera de los dos sentidos borra algo que alguien guardó a propósito: si
   * mandan los del invitado, se pierde lo guardado desde otro dispositivo; si mandan
   * los de la cuenta, se pierde lo que acaba de guardar antes de entrar — y eso es
   * lo peor, porque acaba de pasar y lo está mirando.
   *
   * Es la misma decisión que `fusionarCarrito`, que también suma cantidades en vez
   * de quedarse con un carrito y tirar el otro.
   *
   * Devuelve la lista ya unida, para que el navegador se quede con la verdad
   * completa sin tener que preguntar otra vez.
   */
  async fusionar(userId: string, productoIds: string[]): Promise<string[]> {
    if (productoIds.length > 0) {
      // Sin duplicados dentro de la propia lista: un `upsert` con dos filas iguales
      // en el mismo lote falla («ON CONFLICT no puede afectar dos veces a la fila»),
      // y esa lista viene de un navegador.
      const unicos = [...new Set(productoIds)].slice(0, TOPE_FAVORITOS);

      /**
       * ⚠️⚠️ SE COMPRUEBA QUÉ PRODUCTOS EXISTEN ANTES DE INSERTAR, y esa consulta de
       * más no es prudencia decorativa: **un `upsert` por lotes es UNA sentencia**.
       * Si un solo id apuntara a un producto borrado, la clave foránea tumbaría el
       * lote ENTERO y el cliente perdería todos sus favoritos al iniciar sesión, sin
       * ver ningún error. Justo en el momento en que confía en que se están
       * guardando.
       *
       * Un id muerto en esa lista no es raro: sale del `localStorage` de un
       * navegador que puede llevar meses ahí.
       */
      const { data: existentes, error: errorProductos } = await this.supabase
        .from("productos")
        .select("id")
        .in("id", unicos);

      if (errorProductos) {
        throw new InternalServerErrorException("No se pudieron fusionar los favoritos");
      }

      const vivos = ((existentes as Array<{ id: string }>) ?? []).map((p) => p.id);

      if (vivos.length > 0) {
        const { error } = await this.supabase
          .from("favoritos")
          .upsert(
            vivos.map((producto_id) => ({ user_id: userId, producto_id })),
            { onConflict: "user_id,producto_id", ignoreDuplicates: true },
          );

        if (error) {
          throw new InternalServerErrorException("No se pudieron fusionar los favoritos");
        }
      }
    }

    return this.listar(userId);
  }
}
