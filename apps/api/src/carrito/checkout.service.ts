import { Injectable, ConflictException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "@nestjs/config";
import type { ReservaCheckoutResponse } from "@valatino/types";

@Injectable()
export class CheckoutService {
  private readonly supabase: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.supabase = createClient(
      config.getOrThrow("SUPABASE_URL"),
      config.getOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }

  async reservar(
    sessionId: string,
    userId?: string,
  ): Promise<ReservaCheckoutResponse> {
    // Obtener ítems del carrito activo
    const carritoQuery = userId
      ? this.supabase.from("carritos").select("id").eq("user_id", userId).single()
      : this.supabase.from("carritos").select("id").eq("session_id", sessionId).is("user_id", null).single();

    const { data: carrito, error: carritoError } = await carritoQuery;
    if (carritoError || !carrito) {
      throw new ConflictException("Carrito no encontrado");
    }

    const carritoId = (carrito as { id: string }).id;

    const { data: items, error: itemsError } = await this.supabase
      .from("carrito_items")
      .select("producto_id, cantidad")
      .eq("carrito_id", carritoId);

    if (itemsError || !items || (items as unknown[]).length === 0) {
      throw new ConflictException("El carrito está vacío");
    }

    const productosSinStock: string[] = [];
    const reservasCreadas: Array<{
      reservaId: string;
      productoId: string;
      cantidad: number;
      expiresAt: string;
    }> = [];
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    for (const item of items as Array<{ producto_id: string; cantidad: number }>) {
      // RPC atómica: verifica y reserva stock con lock pesimista.
      // Devuelve el UUID de la reserva creada, o NULL si no hay stock.
      const { data: reservaId, error: rpcError } = await this.supabase.rpc(
        "reservar_stock",
        {
          p_producto_id: item.producto_id,
          p_cantidad: item.cantidad,
          p_session_id: sessionId,
          p_user_id: userId ?? null,
        },
      );

      if (rpcError || !reservaId) {
        productosSinStock.push(item.producto_id);
      } else {
        reservasCreadas.push({
          reservaId: reservaId as string,
          productoId: item.producto_id,
          cantidad: item.cantidad,
          expiresAt,
        });
      }
    }

    // Si algún producto falló, liberar exactamente las reservas creadas
    // en esta operación (por id, sin tocar otras reservas de la sesión)
    if (productosSinStock.length > 0) {
      for (const r of reservasCreadas) {
        await this.supabase.from("stock_reservas").delete().eq("id", r.reservaId);

        await this.supabase.rpc("liberar_reserva", {
          p_producto_id: r.productoId,
          p_cantidad: r.cantidad,
        });
      }

      throw new ConflictException({
        message: "Stock insuficiente para uno o más productos",
        productos_sin_stock: productosSinStock,
      });
    }

    return {
      reservas: reservasCreadas.map(({ productoId, cantidad, expiresAt: exp }) => ({
        productoId,
        cantidad,
        expiresAt: exp,
      })),
      expiresAt,
    };
  }
}
