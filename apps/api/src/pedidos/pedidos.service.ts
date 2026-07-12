import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { PaginatedResponse, PedidoEstado } from "@valatino/types";

const TRANSICIONES_VALIDAS: Record<PedidoEstado, PedidoEstado[]> = {
  PENDIENTE_PAGO: ["PROCESANDO", "CANCELADO"],
  PROCESANDO: ["ENVIADO", "CANCELADO", "REEMBOLSADO"],
  ENVIADO: ["ENTREGADO", "REEMBOLSADO"],
  ENTREGADO: ["REEMBOLSADO"],
  CANCELADO: [],
  REEMBOLSADO: [],
};

// El Asesor no puede cancelar ni reembolsar: solo avanzar el envío
const TRANSICIONES_ASESOR: Record<PedidoEstado, PedidoEstado[]> = {
  ...TRANSICIONES_VALIDAS,
  PROCESANDO: ["ENVIADO"],
  ENVIADO: ["ENTREGADO"],
  ENTREGADO: [],
};

@Injectable()
export class PedidosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findByUser(userId: string, page = 1, limit = 20): Promise<PaginatedResponse<unknown>> {
    const offset = (page - 1) * limit;
    const { data, count, error } = await this.supabase
      .from("pedidos")
      .select("*, pedido_items(*), direcciones_envio(*)", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los pedidos");
    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async findOneByUser(pedidoId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("*, pedido_items(*), direcciones_envio(*)")
      .eq("id", pedidoId)
      .single();

    if (error || !data) throw new NotFoundException("Pedido no encontrado");

    const pedido = data as { user_id: string };
    if (pedido.user_id !== userId) {
      throw new ForbiddenException("No tienes acceso a este pedido");
    }

    return data;
  }

  async findAll(
    page = 1,
    limit = 20,
    estado?: string,
    desde?: string,
    hasta?: string,
  ): Promise<PaginatedResponse<unknown>> {
    const offset = (page - 1) * limit;

    let qb = this.supabase
      .from("pedidos")
      .select("*, pedido_items(*)", { count: "exact" });

    if (estado) qb = qb.eq("estado", estado);
    if (desde) qb = qb.gte("created_at", desde);
    if (hasta) qb = qb.lte("created_at", hasta);

    const { data, count, error } = await qb
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los pedidos");
    return { data: data ?? [], total: count ?? 0, page, limit };
  }

  async vincularPorEmail(userId: string): Promise<{ vinculados: number }> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return { vinculados: 0 };

    const p = profile as { email: string | null };
    if (!p.email) return { vinculados: 0 };

    // Los emails se persisten normalizados a minúsculas (migración 017)
    const { count } = await this.supabase
      .from("pedidos")
      .update({ user_id: userId, updated_at: new Date().toISOString() }, { count: "exact" })
      .is("user_id", null)
      .eq("email_cliente", p.email.toLowerCase());

    return { vinculados: count ?? 0 };
  }

  /**
   * Resumen mínimo del pedido por referencia de pago (payment_intent de
   * Stripe o capture_id de PayPal). Público: la referencia solo la conoce
   * quien realizó el pago, y solo se expone número de pedido y estado.
   */
  async findResumenPorReferencia(
    referencia: string,
  ): Promise<{ numero_pedido: string | null; estado: string } | null> {
    const { data } = await this.supabase
      .from("pedidos")
      .select("numero_pedido, estado")
      .eq("referencia_pago", referencia)
      .maybeSingle();

    return (data as { numero_pedido: string | null; estado: string } | null) ?? null;
  }

  async updateEstado(
    pedidoId: string,
    nuevoEstado: PedidoEstado,
    rolUsuario: "admin" | "asesor",
  ) {
    const { data: pedido, error } = await this.supabase
      .from("pedidos")
      .select("estado")
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) throw new NotFoundException("Pedido no encontrado");

    const estadoActual = (pedido as { estado: PedidoEstado }).estado;
    const transicionesPermitidas =
      rolUsuario === "admin" ? TRANSICIONES_VALIDAS : TRANSICIONES_ASESOR;

    if (!(transicionesPermitidas[estadoActual] ?? []).includes(nuevoEstado)) {
      throw new ForbiddenException(
        `Transición ${estadoActual} → ${nuevoEstado} no está permitida para el rol ${rolUsuario}`,
      );
    }

    const { data: updated, error: updateError } = await this.supabase
      .from("pedidos")
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq("id", pedidoId)
      .select()
      .single();

    if (updateError) throw new InternalServerErrorException("No se pudo actualizar el pedido");
    return updated;
  }
}
