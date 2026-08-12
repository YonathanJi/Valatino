import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { DescuadreStock, EstadoMantenimiento, ResultadoLimpieza } from "@valatino/types";

/**
 * El antes y el después de que la tienda venda de verdad (migración 064).
 *
 * Mientras se está probando hace falta poder crear ventas, mirarlas y borrarlas
 * para volver a empezar. Eso funcionaba haciéndolo a mano con SQL, con dos
 * problemas: la lista de tablas hay que acordarse de mantenerla —desde la 062
 * hay una más, `pedido_iva`— y el stock quedaba descontado por ventas que ya no
 * existían.
 *
 * ⚠️⚠️ Y el problema de fondo, que es el que da nombre a este servicio: **ese
 * hábito deja de ser legal en cuanto se emita la primera factura**. Una serie de
 * facturación tiene que ser correlativa y sin huecos, y borrarla para empezar de
 * nuevo es destruir registros contables. Por eso lo que se construye aquí no es
 * una limpieza: es un interruptor de un solo sentido con una limpieza detrás.
 */
@Injectable()
export class MantenimientoService {
  private readonly logger = new Logger(MantenimientoService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * En qué modo está la tienda y qué se perdería al limpiar.
   *
   * Los descuadres van aquí y no en una pantalla aparte porque es justo antes de
   * limpiar cuando importan: si el inventario ya no cuadra, conviene saber por
   * qué antes de recalcularlo.
   */
  async estado(): Promise<EstadoMantenimiento> {
    const [{ data: ajustes }, { count }, descuadres] = await Promise.all([
      this.supabase.from("ajustes_tienda").select("arranque_fiscal_el").maybeSingle(),
      this.supabase.from("pedidos").select("id", { count: "exact", head: true }),
      this.comprobarStock(),
    ]);

    const arranque =
      (ajustes as { arranque_fiscal_el: string | null } | null)?.arranque_fiscal_el ?? null;

    return {
      en_pruebas: arranque === null,
      arranque_fiscal_el: arranque,
      pedidos: count ?? 0,
      descuadres,
    };
  }

  /** Productos cuyo stock no coincide con la suma de sus movimientos. */
  async comprobarStock(): Promise<DescuadreStock[]> {
    const { data, error } = await this.supabase.rpc("comprobar_stock");

    if (error) {
      this.logger.error(`No se pudo comprobar el stock: ${error.message}`);
      throw new BadRequestException("No se pudo comprobar el stock");
    }

    return ((data ?? []) as Array<DescuadreStock & { descuadre: number }>).map((d) => ({
      producto_id: d.producto_id,
      nombre: d.nombre,
      stock_hoy: d.stock_hoy,
      deducido: d.deducido,
      stock_hoy_menos_deducido: d.descuadre,
    }));
  }

  /**
   * Deja la tienda como recién montada: fuera pedidos, carritos, reservas y
   * direcciones; dentro catálogo, compras, proveedores, cargos y ajustes.
   *
   * ⚠️ El guardia vive en la BD y no aquí. Que la comprobación esté en la RPC
   * y no en este método es lo que hace que también proteja al editor SQL, a un
   * script y a cualquier endpoint que se escriba mañana — es la lección de la
   * 055: una restricción que depende de que la aplicación se acuerde no es una
   * restricción.
   */
  async limpiarDatosDePrueba(actorId?: string): Promise<ResultadoLimpieza> {
    const { data, error } = await this.supabase.rpc("limpiar_datos_de_prueba", {
      p_actor_id: actorId ?? null,
    });

    if (error) {
      this.logger.error(`No se pudo limpiar: ${error.message}`);
      // La RPC explica con nombre y fecha por qué se niega tras el arranque
      // fiscal, y ese mensaje es exactamente lo que hay que leer en pantalla.
      throw new BadRequestException(
        error.code === "P0001" ? error.message : "No se pudieron borrar los datos de prueba",
      );
    }

    this.logger.warn(
      `Datos de prueba borrados${actorId ? ` por ${actorId}` : ""}: ` +
        `${(data as ResultadoLimpieza).pedidos_borrados} pedido(s)`,
    );

    return data as ResultadoLimpieza;
  }

  /**
   * Marca que las ventas empiezan a contar. **No tiene vuelta atrás desde el
   * panel**, y es a propósito: si se pudiera desmarcar, no protegería de nada.
   *
   * Es idempotente y no sobrescribe la fecha: la primera es la que vale, porque
   * es el momento en que las ventas empezaron a ser reales.
   */
  async marcarArranqueFiscal(actorId?: string): Promise<{ arranque_fiscal_el: string }> {
    const { data, error } = await this.supabase.rpc("marcar_arranque_fiscal", {
      p_actor_id: actorId ?? null,
    });

    if (error) {
      this.logger.error(`No se pudo marcar el arranque fiscal: ${error.message}`);
      throw new BadRequestException("No se pudo marcar el arranque fiscal");
    }

    this.logger.warn(`ARRANQUE FISCAL marcado${actorId ? ` por ${actorId}` : ""}: ${data}`);

    return { arranque_fiscal_el: data as string };
  }
}
