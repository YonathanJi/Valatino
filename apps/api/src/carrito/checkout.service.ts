import { Inject, Injectable, ConflictException, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { ReservaCheckoutResponse } from "@valatino/types";

interface ReservarCarritoResult {
  ok: boolean;
  sin_stock?: string[];
  reservas?: Array<{ productoId: string; cantidad: number; expiresAt: string }>;
  expiresAt?: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Reserva el stock del carrito completo con una sola RPC transaccional:
   * libera las reservas previas de la sesión, comprueba TODO el stock y crea
   * las nuevas — todo o nada, sin rollbacks a mano.
   *
   * La concurrencia (doble montaje de React, doble clic, varias instancias de
   * la API) la serializa un advisory lock por sesión en la propia BD, no un Map
   * en memoria del proceso: así el servicio escala en horizontal (Principio V).
   */
  async reservar(sessionId: string, userId?: string): Promise<ReservaCheckoutResponse> {
    const { data, error } = await this.supabase.rpc("reservar_carrito", {
      p_session_id: sessionId,
      p_user_id: userId ?? null,
    });

    if (error) {
      // P0002 / P0003: carrito inexistente o vacío — el mensaje de la RPC ya es
      // accionable para el cliente.
      if (error.code === "P0002" || error.code === "P0003") {
        throw new ConflictException(error.message);
      }
      this.logger.error(`Error al reservar el carrito (sesión ${sessionId}): ${error.message}`);
      throw new ConflictException("No se pudo reservar el stock del carrito");
    }

    const resultado = data as ReservarCarritoResult;

    if (!resultado.ok) {
      throw new ConflictException({
        message: "Stock insuficiente para uno o más productos",
        productos_sin_stock: resultado.sin_stock ?? [],
      });
    }

    return {
      reservas: resultado.reservas ?? [],
      expiresAt: resultado.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }
}
