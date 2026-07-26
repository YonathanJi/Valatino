import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { OrigenEvento, TipoEventoPedido } from "@valatino/types";

interface DatosEvento {
  pedidoId: string;
  tipo: TipoEventoPedido;
  detalle?: string | null;
  importe?: number | null;
  /** Quién lo hizo. Sin esto queda como el sistema, que es la verdad del webhook. */
  actorId?: string | null;
  origen?: OrigenEvento;
}

/**
 * Registra en la línea de tiempo del pedido lo que un trigger sobre `pedidos`
 * no puede ver: cobros, devoluciones y correos al cliente.
 *
 * Vive en su propio módulo porque lo necesitan tanto `PedidosModule` como
 * `EmailModule`, y `PedidosModule` ya importa a `EmailModule`: al revés sería
 * una dependencia circular. Mismo motivo por el que `StripeService` se sacó a
 * su propio módulo.
 */
@Injectable()
export class EventosPedidoService {
  private readonly logger = new Logger(EventosPedidoService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Nunca lanza. El historial es una consecuencia del hecho, no el hecho: que
   * falle anotar un correo no puede tumbar el envío, ni que falle anotar un
   * cobro puede tumbar la venta. Los fallos quedan en el log.
   */
  async registrar(datos: DatosEvento): Promise<void> {
    try {
      const { error } = await this.supabase.rpc("registrar_evento_pedido", {
        p_pedido_id: datos.pedidoId,
        p_tipo: datos.tipo,
        p_detalle: datos.detalle ?? null,
        p_importe: datos.importe ?? null,
        p_actor_id: datos.actorId ?? null,
        p_origen: datos.origen ?? (datos.actorId ? "panel" : "sistema"),
      });

      if (error) {
        this.logger.warn(
          `No se pudo registrar el evento ${datos.tipo} del pedido ${datos.pedidoId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo registrar el evento ${datos.tipo} del pedido ${datos.pedidoId}: ${(err as Error).message}`,
      );
    }
  }
}
