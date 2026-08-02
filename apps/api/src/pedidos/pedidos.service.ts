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
import type {
  NivelPermiso,
  PaginatedResponse,
  Pedido,
  ArticuloDevuelto,
  HitoPedido,
  PedidoClienteDetalle,
  PedidoDeCliente,
  PedidoDetalle,
  PedidoEstado,
  PedidoEvento,
  PedidoItem,
  TipoHito,
} from "@valatino/types";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";
import { ReembolsosService } from "./reembolsos.service";
import { TransferenciaService } from "./transferencia.service";
import { CalificacionesService } from "../calificaciones/calificaciones.service";

/** Lo poco del historial interno que se lee para el seguimiento del cliente. */
interface EventoParaSeguimiento {
  tipo: string;
  estado_nuevo: PedidoEstado | null;
  created_at: string;
}

/**
 * Cómo se le cuenta cada estado al cliente. Los textos son los de la tienda, no
 * los del panel: aquí no se dice «PROCESANDO», se dice qué está pasando.
 *
 * PENDIENTE_PAGO no está: un pedido que nunca llegó a pagarse no es un paso del
 * que informar, es ruido.
 */
const HITO_POR_ESTADO: Partial<Record<PedidoEstado, { tipo: TipoHito; titulo: string }>> = {
  PROCESANDO: { tipo: "preparacion", titulo: "Pago confirmado. Estamos preparando tu pedido" },
  ENVIADO: { tipo: "envio", titulo: "Tu pedido va en camino" },
  ENTREGADO: { tipo: "entrega", titulo: "Pedido entregado" },
  CANCELADO: { tipo: "cancelacion", titulo: "Pedido cancelado" },
  REEMBOLSADO: { tipo: "devolucion", titulo: "Pedido reembolsado por completo" },
};

/**
 * Traduce el historial interno a lo que se le puede enseñar a quien compró.
 *
 * Se queda fuera todo lo que es de puertas adentro: quién movió el pedido, los
 * correos que se le enviaron (ya los tiene en su buzón), los avisos de la
 * pasarela y los textos de máquina. La consulta que alimenta esto ni siquiera
 * pide las columnas de autor — lo que no se lee no se puede filtrar mal.
 */
export function construirSeguimiento(
  eventos: EventoParaSeguimiento[],
  devueltos: ArticuloDevuelto[],
  totalDevuelto: number,
  pedidoCreadoEl: string,
): HitoPedido[] {
  const hitos: HitoPedido[] = [];

  for (const e of eventos) {
    if (e.tipo !== "estado" || !e.estado_nuevo) continue;
    const plantilla = HITO_POR_ESTADO[e.estado_nuevo];
    if (!plantilla) continue;
    hitos.push({ ...plantilla, detalle: null, importe: null, fecha: e.created_at });
  }

  // Respaldo para los pedidos anteriores al historial (migración 039): sin
  // eventos, el seguimiento saldría vacío y parecería que no ha pasado nada.
  if (hitos.length === 0) {
    hitos.push({
      tipo: "pedido",
      titulo: "Pedido realizado",
      detalle: null,
      importe: null,
      fecha: pedidoCreadoEl,
    });
  }

  /*
   * Las devoluciones NO se sacan de los eventos, y es a propósito: allí el
   * importe es el ACUMULADO devuelto hasta ese momento (lo necesita el cálculo
   * de cuánto queda), así que una segunda devolución de 10 € figura como 10,50.
   * Mostrárselo al cliente junto al artículo que se le devolvió sería contarle
   * mal su dinero. Aquí el importe sale de las líneas, que llevan lo de cada una.
   *
   * Se agrupan por fecha porque todas las líneas de una misma devolución se
   * insertan en la misma transacción, y `now()` es constante dentro de ella:
   * misma marca de tiempo equivale a mismo reembolso, sin exponer su id.
   */
  const porDevolucion = new Map<string, ArticuloDevuelto[]>();
  for (const a of devueltos) {
    porDevolucion.set(a.fecha, [...(porDevolucion.get(a.fecha) ?? []), a]);
  }

  let contabilizado = 0;
  for (const [fecha, articulos] of porDevolucion) {
    const importe = articulos.reduce((s, a) => s + a.importe, 0);
    contabilizado += importe;
    hitos.push({
      tipo: "devolucion",
      titulo: "Devolución tramitada",
      detalle: articulos
        .map((a) => (a.cantidad > 1 ? `${a.nombre_producto} × ${a.cantidad}` : a.nombre_producto))
        .join(", "),
      importe,
      fecha,
    });
  }

  // Dinero devuelto que no consta de ningún artículo (devolución por importe, o
  // hecha desde el panel de Stripe). Se cuenta igual: el cliente lo va a ver en
  // su banco y no encontrarlo aquí es peor que no dar el detalle.
  const suelto = Math.round((totalDevuelto - contabilizado) * 100) / 100;
  if (suelto > 0) {
    const ultimoReembolso = [...eventos].reverse().find((e) => e.tipo === "reembolso");
    hitos.push({
      tipo: "devolucion",
      titulo: "Devolución tramitada",
      detalle: null,
      importe: suelto,
      fecha: ultimoReembolso?.created_at ?? pedidoCreadoEl,
    });
  }

  return hitos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
}

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly inventario: InventarioService,
    private readonly email: EmailService,
    private readonly reembolsos: ReembolsosService,
    private readonly transferencia: TransferenciaService,
    private readonly calificaciones: CalificacionesService,
  ) {}

  /**
   * Los pedidos del cliente, con lo que se le haya devuelto.
   *
   * El reembolso va aquí y no en una llamada aparte porque **un reembolso
   * parcial no cambia el estado del pedido** —sigue en ENVIADO o ENTREGADO, que
   * es lo correcto—: sin esto, el cliente no tiene ninguna forma de enterarse de
   * que se le ha abonado dinero. El estado solo cuenta el reembolso total.
   */
  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<PedidoDeCliente>> {
    const offset = (page - 1) * limit;
    const { data, count, error } = await this.supabase
      .from("pedidos")
      .select("*, pedido_items(*), direcciones_envio(*), transacciones_pago(estado)", {
        count: "exact",
      })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los pedidos");

    const pedidos = (data as Array<Pedido & { transacciones_pago?: { estado: string }[] }>)
      // Fuera los intentos que nunca llegaron a ser una compra.
      //
      // Elegir «transferencia» crea un pedido en PENDIENTE_PAGO, y si el
      // cliente cambia de idea y paga con tarjeta ese pedido se cancela solo
      // (047). Enseñárselo es contarle como pedido algo que solo fue un paso de
      // su propio checkout — y con el mismo importe que el que sí pagó, parece
      // un cobro doble que falló.
      //
      // La condición es «cancelado Y sin ningún pago»: un pedido que se cobró y
      // se canceló después SÍ se muestra, porque ahí hubo dinero de por medio y
      // el cliente tiene todo el derecho a verlo.
      .filter(
        (p) =>
          p.estado !== "CANCELADO" ||
          (p.transacciones_pago ?? []).some((t) => t.estado === "exitoso"),
      )
      .map(({ transacciones_pago: _sinExponer, ...p }) => p as Pedido);

    const ocultados = (data?.length ?? 0) - pedidos.length;

    // Dos consultas para toda la página, no dos por pedido.
    const ids = pedidos.map((p) => p.id);
    const [totales, articulos] = await Promise.all([
      this.reembolsos.totalesReembolsados(ids),
      this.reembolsos.articulosDevueltos(ids),
    ]);

    return {
      data: pedidos.map((p) => ({
        ...p,
        total_reembolsado: totales.get(p.id) ?? 0,
        articulos_devueltos: articulos.get(p.id) ?? [],
      })),
      // Descontando lo ocultado en esta página, para que el contador no prometa
      // pedidos que no se ven. Con varias páginas el número sigue siendo
      // aproximado; con `limit=50` y los pedidos que tiene un cliente, en la
      // práctica no hay segunda página.
      total: Math.max((count ?? 0) - ocultados, pedidos.length),
      page,
      limit,
    };
  }

  async findOneByUser(pedidoId: string, userId: string): Promise<PedidoClienteDetalle> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("*, pedido_items(*), direcciones_envio(*)")
      .eq("id", pedidoId)
      .single();

    if (error || !data) throw new NotFoundException("Pedido no encontrado");

    const pedido = data as Pedido;
    if (pedido.user_id !== userId) {
      throw new ForbiddenException("No tienes acceso a este pedido");
    }

    // Después de comprobar de quién es el pedido, nunca antes: leer lo devuelto
    // de un pedido ajeno y descartarlo al fallar el guard sigue siendo leerlo.
    const [totales, articulos, { data: eventos }] = await Promise.all([
      this.reembolsos.totalesReembolsados([pedidoId]),
      this.reembolsos.articulosDevueltos([pedidoId]),
      this.supabase
        .from("pedido_eventos")
        .select("tipo, estado_nuevo, created_at")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: true }),
    ]);

    const devueltos = articulos.get(pedidoId) ?? [];
    const totalDevuelto = totales.get(pedidoId) ?? 0;

    // Solo mientras el pedido de verdad espera un ingreso. Enseñar el IBAN de
    // uno ya pagado invitaría a pagarlo dos veces.
    const esperaTransferencia =
      pedido.metodo_pago === "transferencia" && pedido.estado === "PENDIENTE_PAGO";

    return {
      ...pedido,
      total_reembolsado: totalDevuelto,
      articulos_devueltos: devueltos,
      seguimiento: construirSeguimiento(
        (eventos ?? []) as EventoParaSeguimiento[],
        devueltos,
        totalDevuelto,
        pedido.created_at,
      ),
      instrucciones_pago: esperaTransferencia
        ? await this.transferencia.instrucciones(pedidoId).catch(() => null)
        : null,
    };
  }

  async findAll(
    page = 1,
    limit = 20,
    estado?: string,
    desde?: string,
    hasta?: string,
    /**
     * Incluir los pedidos que nunca llegaron a pagarse y quedaron cancelados al
     * cambiar el cliente de forma de pago. Por defecto **no**: son un paso del
     * checkout ajeno, no trabajo del equipo, y duplican la lista cada vez que
     * alguien se lo piensa mejor. Se pueden ver con el interruptor del panel,
     * porque la traza tiene que seguir a mano si alguien pregunta por un ingreso.
     */
    incluirIntentos = false,
  ): Promise<PaginatedResponse<unknown>> {
    const offset = (page - 1) * limit;

    let qb = this.supabase
      .from("pedidos")
      .select("*, pedido_items(*), transacciones_pago(estado)", { count: "exact" });

    if (estado) qb = qb.eq("estado", estado);
    if (desde) qb = qb.gte("created_at", desde);
    if (hasta) qb = qb.lte("created_at", hasta);

    const { data, count, error } = await qb
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los pedidos");

    const crudos = (data ?? []) as Array<{
      id: string;
      estado: string;
      numero_pedido: string | null;
      reemplazado_por: string | null;
      transacciones_pago?: { estado: string }[];
    }>;

    const visibles = incluirIntentos
      ? crudos
      : crudos.filter(
          (p) =>
            p.estado !== "CANCELADO" ||
            (p.transacciones_pago ?? []).some((t) => t.estado === "exitoso"),
        );

    // Lo ya devuelto de cada pedido, en UNA consulta para toda la página: el
    // panel necesita saber cuánto queda por reembolsar y consultarlo fila a
    // fila serían 20 viajes extra.
    const reembolsados = await this.reembolsos.totalesReembolsados(visibles.map((p) => p.id));

    /*
     * Los dos pedidos del mismo carrito, enlazados en las dos direcciones: el
     * cancelado dice quién ocupó su lugar y el pagado a quién sustituye. Es la
     * alternativa a fusionarlos, que sería reescribir un documento comercial —
     * el cancelado tuvo número propio y ese número se le dio al cliente como
     * concepto de la transferencia.
     */
    const numeroPorId = new Map(crudos.map((p) => [p.id, p.numero_pedido]));
    const sustituyeA = new Map<string, string | null>();
    for (const p of crudos) {
      if (p.reemplazado_por) sustituyeA.set(p.reemplazado_por, p.numero_pedido);
    }

    return {
      data: visibles.map(({ transacciones_pago: _sinExponer, ...p }) => ({
        ...p,
        total_reembolsado: reembolsados.get(p.id) ?? 0,
        reemplazado_por_numero: p.reemplazado_por
          ? (numeroPorId.get(p.reemplazado_por) ?? null)
          : null,
        sustituye_a_numero: sustituyeA.get(p.id) ?? null,
      })),
      total: Math.max((count ?? 0) - (crudos.length - visibles.length), visibles.length),
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
   *
   * Incluye `token_calificacion` porque acredita lo mismo: quien llega aquí con
   * la referencia correcta es quien pagó, y es a quien se le puede preguntar qué
   * tal fue. Reutilizar esta puerta evita inventar un segundo mecanismo para
   * identificar a un comprador que no tiene cuenta.
   */
  async findResumenPorReferencia(referencia: string): Promise<{
    numero_pedido: string | null;
    estado: string;
    token_calificacion: string;
  } | null> {
    const { data } = await this.supabase
      .from("pedidos")
      .select("numero_pedido, estado, token_calificacion")
      .eq("referencia_pago", referencia)
      .maybeSingle();

    return (
      (data as {
        numero_pedido: string | null;
        estado: string;
        token_calificacion: string;
      } | null) ?? null
    );
  }

  /**
   * Ficha completa para el panel: el pedido con sus líneas y todo lo que le ha
   * pasado. El historial lo ve cualquiera con lectura en el módulo — la idea es
   * justamente que el equipo entero sepa quién tocó qué.
   */
  async findOneDetalle(pedidoId: string): Promise<PedidoDetalle> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("*, pedido_items(*)")
      .eq("id", pedidoId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException("No se pudo cargar el pedido");
    if (!data) throw new NotFoundException("Pedido no encontrado");

    const { pedido_items: items = [], ...pedido } = data as Record<string, unknown> & {
      pedido_items?: unknown[];
    };

    const [{ data: eventos, error: errorEventos }, reembolsados, calificacion, reembolsoLineas] =
      await Promise.all([
        this.supabase
          .from("pedido_eventos")
          .select("*")
          .eq("pedido_id", pedidoId)
          .order("created_at", { ascending: true }),
        this.reembolsos.totalesReembolsados([pedidoId]),
        // La opinión del cliente se lee aquí y no en una llamada aparte: en la
        // ficha tiene contexto (quién lo tocó, cuánto tardó, qué opinó), y es
        // donde de verdad se puede hacer algo con ella.
        this.calificaciones.porPedido(pedidoId),
        // Qué artículos se han devuelto ya. Lo usa la ficha para marcarlos y el
        // modal de reembolso para no volver a ofrecer lo que ya no queda.
        this.reembolsos.lineasDevueltas(pedidoId),
      ]);

    if (errorEventos) throw new InternalServerErrorException("No se pudo cargar el historial");

    return {
      pedido: { ...pedido, total_reembolsado: reembolsados.get(pedidoId) ?? 0 } as Pedido,
      items: items as PedidoItem[],
      eventos: (eventos ?? []) as PedidoEvento[],
      calificacion,
      reembolso_lineas: reembolsoLineas,
    };
  }

  async updateEstado(
    pedidoId: string,
    nuevoEstado: PedidoEstado,
    nivelUsuario: NivelPermiso,
    actorId?: string,
  ) {
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

    // Por RPC y no con un update suelto: así el cambio y su registro en el
    // historial ocurren en la misma transacción, y es la RPC la que sabe pasarle
    // al trigger quién lo está haciendo.
    const { data: updated, error: updateError } = await this.supabase.rpc("cambiar_estado_pedido", {
      p_pedido_id: pedidoId,
      p_estado: nuevoEstado,
      p_actor_id: actorId ?? null,
    });

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
