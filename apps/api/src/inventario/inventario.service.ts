import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { EventosPedidoService } from "../eventos/eventos-pedido.service";
import type { OrigenEvento, TipoEventoPedido } from "@valatino/types";
import type { PedidoEstado } from "@valatino/types";

export interface DireccionSnapshotPedido {
  nombre_destinatario: string;
  linea1: string;
  linea2?: string | null;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais?: string;
  /**
   * Teléfono de contacto de la entrega, normalizado a 9 dígitos. Viaja dentro
   * del snapshot, así que `checkout_datos.direccion` (jsonb) lo lleva sin tocar
   * la tabla y `confirmar_venta` lo copia a `pedidos.envio_telefono`.
   */
  telefono?: string;
}

export interface CrearPedidoDto {
  /**
   * Dueño del pedido. Puede venir de un lookup por email (invitado cuyo
   * email pertenece a una cuenta registrada) — NO sirve para localizar el
   * carrito, porque el invitado compró con el carrito de su sesión.
   */
  userId?: string;
  /**
   * Usuario autenticado DURANTE el checkout (metadata del pago). Determina
   * dónde viven el carrito y las reservas: con sesión iniciada → carrito de
   * usuario; invitado → carrito de sesión (user_id IS NULL).
   */
  usuarioAutenticado?: string;
  sessionId: string;
  metodoPago: "stripe" | "paypal";
  referenciaPago: string;
  direccionEnvioId?: string;
  emailCliente?: string;
  documentoCliente?: string;
  direccionSnapshot?: DireccionSnapshotPedido;
}

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly eventos: EventosPedidoService,
  ) {}

  /**
   * Idempotencia de webhooks: comprueba si un evento del proveedor de pagos
   * ya fue procesado (Stripe/PayPal reintentan webhooks activamente).
   */
  async eventoYaProcesado(eventoId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("transacciones_pago")
      .select("id")
      .eq("evento_id", eventoId)
      .maybeSingle();

    return Boolean(data);
  }

  /**
   * Confirma la venta con la RPC transaccional `confirmar_venta`: pedido +
   * líneas + confirmación de stock + vaciado del carrito, todo o nada.
   *
   * Es idempotente por `referencia_pago` (con índice único en BD y lock por
   * referencia): si el webhook se reintenta, devuelve el pedido ya creado en
   * lugar de duplicarlo. Antes eran 6 llamadas sueltas y un fallo a mitad
   * dejaba pedidos sin líneas o `stock_reservado` inflado.
   */
  async confirmarVentaYCrearPedido(dto: CrearPedidoDto): Promise<string> {
    const { data, error } = await this.supabase.rpc("confirmar_venta", {
      p_session_id: dto.sessionId,
      p_usuario_autenticado: dto.usuarioAutenticado ?? null,
      p_user_id: dto.userId ?? null,
      p_metodo_pago: dto.metodoPago,
      p_referencia_pago: dto.referenciaPago,
      p_direccion_envio_id: dto.direccionEnvioId ?? null,
      p_email_cliente: dto.emailCliente ?? null,
      p_documento_cliente: dto.documentoCliente ?? null,
      p_envio: dto.direccionSnapshot ?? null,
    });

    if (error || !data) {
      this.logger.error(
        `Error al confirmar la venta (ref ${dto.referenciaPago}, sesión ${dto.sessionId}, auth ${dto.usuarioAutenticado ?? "-"}): ${error?.message ?? "sin id de pedido"}`,
      );
      throw new UnprocessableEntityException(
        error?.message ?? "No se pudo registrar el pedido",
      );
    }

    return data as string;
  }

  /**
   * Libera las reservas de stock de una sesión o usuario (pago fallido o
   * cancelado): devuelve las unidades al stock y borra las reservas.
   */
  async liberarReservas(sessionId: string, userId?: string): Promise<void> {
    const filter = userId
      ? this.supabase.from("stock_reservas").select("id, producto_id, cantidad").eq("user_id", userId)
      : this.supabase.from("stock_reservas").select("id, producto_id, cantidad").eq("session_id", sessionId);

    const { data: reservas } = await filter;

    for (const r of (reservas as Array<{ id: string; producto_id: string; cantidad: number }>) ?? []) {
      await this.supabase.rpc("liberar_reserva", {
        p_producto_id: r.producto_id,
        p_cantidad: r.cantidad,
      });
      await this.supabase.from("stock_reservas").delete().eq("id", r.id);
    }
  }

  /**
   * Actualiza el estado de un pedido a partir de la referencia del proveedor
   * de pago (p.ej. reembolsos notificados vía webhook).
   */
  async actualizarEstadoPorReferencia(
    referenciaPago: string,
    estado: PedidoEstado,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("referencia_pago", referenciaPago)
      .select("id")
      .maybeSingle();

    if (error) {
      this.logger.error(`Error al actualizar pedido por referencia ${referenciaPago}: ${error.message}`);
      return null;
    }
    if (!data) {
      this.logger.warn(`No existe pedido con referencia_pago=${referenciaPago}`);
      return null;
    }
    return (data as { id: string }).id;
  }

  /**
   * Único sitio donde se escribe en `transacciones_pago`, así que también es el
   * único donde hay que anotar el movimiento en la línea de tiempo del pedido:
   * puesto aquí no puede desincronizarse con el registro contable.
   */
  async registrarTransaccion(
    pedidoId: string,
    proveedor: "stripe" | "paypal",
    eventoId: string,
    tipoEvento: string,
    estado: string,
    importe: number,
    payloadRaw: object,
    historial?: {
      tipo: TipoEventoPedido;
      actorId?: string | null;
      origen?: OrigenEvento;
      /** Qué contar en la línea de tiempo. Por defecto, el tipo de evento. */
      detalle?: string;
    },
  ): Promise<void> {
    const { error } = await this.supabase.from("transacciones_pago").insert({
      pedido_id: pedidoId,
      proveedor,
      evento_id: eventoId,
      tipo_evento: tipoEvento,
      estado,
      importe,
      moneda: "EUR",
      payload_raw: payloadRaw,
    });

    if (error) {
      // 23505 = unique_violation en evento_id → webhook duplicado concurrente
      if (error.code === "23505") {
        this.logger.warn(`Evento ${eventoId} (${proveedor}) ya registrado; se ignora el duplicado`);
        return;
      }
      this.logger.error(`Error al registrar transacción ${eventoId}: ${error.message}`);
      throw new UnprocessableEntityException("Error al registrar la transacción de pago");
    }

    if (historial) {
      await this.eventos.registrar({
        pedidoId,
        tipo: historial.tipo,
        importe,
        detalle: historial.detalle ?? tipoEvento,
        actorId: historial.actorId,
        origen: historial.origen,
      });
    }
  }

  /**
   * Lee los datos de checkout persistidos por sesión (staging previo al pago).
   */
  async getCheckoutDatos(sessionId: string): Promise<{
    user_id: string | null;
    email: string | null;
    documento: string | null;
    direccion_envio_id: string | null;
    direccion: DireccionSnapshotPedido | null;
  } | null> {
    const { data } = await this.supabase
      .from("checkout_datos")
      .select("user_id, email, documento, direccion_envio_id, direccion")
      .eq("session_id", sessionId)
      .maybeSingle();

    return (data as {
      user_id: string | null;
      email: string | null;
      documento: string | null;
      direccion_envio_id: string | null;
      direccion: DireccionSnapshotPedido | null;
    } | null) ?? null;
  }

  /**
   * Persiste los datos del checkout (email, documento, dirección) por sesión
   * antes de crear la intención de pago. Los webhooks los leen después para
   * construir el pedido sin depender de los límites de metadata del proveedor.
   */
  async guardarCheckoutDatos(params: {
    sessionId: string;
    userId?: string;
    email?: string;
    documento?: string;
    direccionEnvioId?: string;
    direccion?: DireccionSnapshotPedido;
  }): Promise<void> {
    const { error } = await this.supabase.from("checkout_datos").upsert({
      session_id: params.sessionId,
      user_id: params.userId ?? null,
      email: params.email?.toLowerCase() ?? null,
      documento: params.documento ?? null,
      direccion_envio_id: params.direccionEnvioId ?? null,
      direccion: params.direccion ?? null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      this.logger.error(`Error al guardar checkout_datos (${params.sessionId}): ${error.message}`);
      throw new UnprocessableEntityException("No se pudieron guardar los datos del checkout");
    }
  }

  /**
   * Busca un pedido por la referencia del proveedor de pago. El total sirve
   * para distinguir un reembolso parcial de uno completo.
   */
  async findPedidoPorReferencia(
    referenciaPago: string,
  ): Promise<{ id: string; estado: string; total: number } | null> {
    const { data } = await this.supabase
      .from("pedidos")
      .select("id, estado, total")
      .eq("referencia_pago", referenciaPago)
      .maybeSingle();

    if (!data) return null;
    return data as { id: string; estado: string; total: number };
  }

  /**
   * Obtiene un pedido con sus ítems y datos de envío para emails
   * transaccionales (confirmación, reembolso, etc.).
   */
  async getPedidoConItems(
    pedidoId: string,
  ): Promise<{
    id: string;
    numero_pedido: string | null;
    estado: string;
    total: number;
    metodo_pago: "stripe" | "paypal";
    email_cliente: string | null;
    envio_nombre: string | null;
    envio_linea1: string | null;
    envio_linea2: string | null;
    envio_ciudad: string | null;
    envio_codigo_postal: string | null;
    envio_provincia: string | null;
    envio_pais: string | null;
    created_at: string;
    items: Array<{ nombre_producto: string; cantidad: number; precio_unitario: number }>;
  } | null> {
    const { data: pedido } = await this.supabase
      .from("pedidos")
      .select(
        "id, numero_pedido, estado, total, metodo_pago, email_cliente, envio_nombre, envio_linea1, envio_linea2, envio_ciudad, envio_codigo_postal, envio_provincia, envio_pais, created_at",
      )
      .eq("id", pedidoId)
      .maybeSingle();

    if (!pedido) return null;

    const { data: items } = await this.supabase
      .from("pedido_items")
      .select("nombre_producto, cantidad, precio_unitario")
      .eq("pedido_id", pedidoId);

    return {
      ...(pedido as {
        id: string;
        numero_pedido: string | null;
        estado: string;
        total: number;
        metodo_pago: "stripe" | "paypal";
        email_cliente: string | null;
        envio_nombre: string | null;
        envio_linea1: string | null;
        envio_linea2: string | null;
        envio_ciudad: string | null;
        envio_codigo_postal: string | null;
        envio_provincia: string | null;
        envio_pais: string | null;
        created_at: string;
      }),
      items: (items as Array<{ nombre_producto: string; cantidad: number; precio_unitario: number }>) ?? [],
    };
  }
}
