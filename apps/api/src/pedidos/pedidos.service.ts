import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { NIVEL_LABELS, transicionesPermitidas } from "@valatino/types";
import type { NivelPermiso, PaginatedResponse, PedidoEstado } from "@valatino/types";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";
import { ReembolsosService } from "./reembolsos.service";

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly inventario: InventarioService,
    private readonly email: EmailService,
    private readonly reembolsos: ReembolsosService,
  ) {}

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

    // Lo ya devuelto de cada pedido, en UNA consulta para toda la página: el
    // panel necesita saber cuánto queda por reembolsar y consultarlo fila a
    // fila serían 20 viajes extra.
    const pedidos = (data ?? []) as Array<{ id: string }>;
    const reembolsados = await this.reembolsos.totalesReembolsados(pedidos.map((p) => p.id));

    return {
      data: pedidos.map((p) => ({ ...p, total_reembolsado: reembolsados.get(p.id) ?? 0 })),
      total: count ?? 0,
      page,
      limit,
    };
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

  async updateEstado(pedidoId: string, nuevoEstado: PedidoEstado, nivelUsuario: NivelPermiso) {
    const { data: pedido, error } = await this.supabase
      .from("pedidos")
      .select("estado")
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) throw new NotFoundException("Pedido no encontrado");

    const estadoActual = (pedido as { estado: PedidoEstado }).estado;

    if (!transicionesPermitidas(estadoActual, nivelUsuario).includes(nuevoEstado)) {
      throw new ForbiddenException(
        `Transición ${estadoActual} → ${nuevoEstado} no está permitida con nivel «${NIVEL_LABELS[nivelUsuario]}» en pedidos`,
      );
    }

    const { data: updated, error: updateError } = await this.supabase
      .from("pedidos")
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq("id", pedidoId)
      .select()
      .single();

    if (updateError) throw new InternalServerErrorException("No se pudo actualizar el pedido");

    // Sin await a propósito: un envío SMTP tarda segundos (y en Render puede
    // agotar los 20 s de timeout). El estado ya está guardado, así que hacer
    // esperar al panel solo conseguiría que pareciera roto. Los fallos quedan
    // en el log, nunca tumban la transición.
    void this.notificarCambioEstado(pedidoId, nuevoEstado);

    return updated;
  }

  /** Avisa al cliente del nuevo estado de su pedido. No propaga errores. */
  private async notificarCambioEstado(
    pedidoId: string,
    nuevoEstado: PedidoEstado,
  ): Promise<void> {
    try {
      const pedido = await this.inventario.getPedidoConItems(pedidoId);
      if (!pedido?.email_cliente) {
        this.logger.debug(`Pedido ${pedidoId} sin email de cliente; no se avisa del cambio`);
        return;
      }

      await this.email.enviarCambioEstado({
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido,
        email: pedido.email_cliente,
        nombre: pedido.envio_nombre,
        estado: nuevoEstado,
        items: pedido.items,
        total: Number(pedido.total),
        fecha: new Date(pedido.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar del cambio a ${nuevoEstado} (pedido ${pedidoId}): ${(err as Error).message}`,
      );
    }
  }
}
