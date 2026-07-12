import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { PedidoEstado } from "@valatino/types";

export interface DireccionSnapshotPedido {
  nombre_destinatario: string;
  linea1: string;
  linea2?: string | null;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais?: string;
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

// Códigos de método de pago para el número de pedido (01 stripe, 02 paypal;
// reservados 03+ para futuros métodos). "00" = desconocido.
const CODIGOS_METODO_PAGO: Record<string, string> = {
  stripe: "01",
  paypal: "02",
};

@Injectable()
export class InventarioService {
  private readonly logger = new Logger(InventarioService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Número de pedido legible: AAMMDD + código de método de pago + 4 dígitos
   * aleatorios. Ej.: 260712016478 → 12/07/2026, stripe (01), sufijo 6478.
   */
  private generarNumeroPedido(metodoPago: string): string {
    const ahora = new Date();
    const aa = String(ahora.getFullYear() % 100).padStart(2, "0");
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const dd = String(ahora.getDate()).padStart(2, "0");
    const codigo = CODIGOS_METODO_PAGO[metodoPago] ?? "00";
    const sufijo = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    return `${aa}${mm}${dd}${codigo}${sufijo}`;
  }

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

  async confirmarVentaYCrearPedido(dto: CrearPedidoDto): Promise<string> {
    // 1. Obtener ítems del carrito. Se localiza por el usuario AUTENTICADO
    //    en el checkout (no por el dueño final del pedido: un invitado cuyo
    //    email pertenece a una cuenta compró con el carrito de su sesión).
    //    El carrito de invitado se filtra con user_id IS NULL: la misma
    //    sesión puede tener además un carrito de usuario de un login previo.
    const carritoQuery = dto.usuarioAutenticado
      ? this.supabase.from("carritos").select("id").eq("user_id", dto.usuarioAutenticado).maybeSingle()
      : this.supabase
          .from("carritos")
          .select("id")
          .eq("session_id", dto.sessionId)
          .is("user_id", null)
          .maybeSingle();

    const { data: carrito, error: carritoError } = await carritoQuery;
    if (!carrito) {
      this.logger.error(
        `Carrito no encontrado al confirmar pago (session ${dto.sessionId}, auth ${dto.usuarioAutenticado ?? "-"})${carritoError ? `: ${carritoError.message}` : ""}`,
      );
      throw new UnprocessableEntityException("Carrito no encontrado al confirmar pago");
    }

    const carritoId = (carrito as { id: string }).id;

    const { data: items } = await this.supabase
      .from("carrito_items")
      .select(`
        cantidad,
        precio_unitario,
        producto:productos ( id, nombre, precio )
      `)
      .eq("carrito_id", carritoId);

    if (!items || (items as unknown[]).length === 0) {
      this.logger.error(
        `Carrito vacío al confirmar pago (carrito ${carritoId}, session ${dto.sessionId}, auth ${dto.usuarioAutenticado ?? "-"})`,
      );
      throw new UnprocessableEntityException("Carrito vacío al confirmar pago");
    }

    type ItemConProducto = {
      cantidad: number;
      precio_unitario: number;
      producto: { id: string; nombre: string; precio: number } | Array<{ id: string; nombre: string; precio: number }>;
    };

    const itemsTyped = items as unknown as ItemConProducto[];
    const itemsFlatten = itemsTyped.map((i) => {
      const prod = Array.isArray(i.producto) ? i.producto[0]! : i.producto;
      return {
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        producto: prod,
      };
    });
    const total = itemsFlatten.reduce(
      (acc, i) => acc + Number(i.precio_unitario) * i.cantidad,
      0,
    );

    // 2. Snapshot de dirección: si viene un id de dirección guardada, copiar
    //    sus campos al pedido (protege el histórico ante ediciones/borrados)
    let snapshot = dto.direccionSnapshot ?? null;
    if (!snapshot && dto.direccionEnvioId) {
      const { data: direccion } = await this.supabase
        .from("direcciones_envio")
        .select("nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais")
        .eq("id", dto.direccionEnvioId)
        .maybeSingle();

      if (direccion) snapshot = direccion as DireccionSnapshotPedido;
    }

    // 3. Crear el pedido. El numero_pedido lleva un sufijo aleatorio de 4
    //    dígitos con índice único: ante una colisión (23505) se reintenta
    //    con un sufijo nuevo.
    let pedidoId: string | null = null;

    for (let intento = 0; intento < 5; intento++) {
      const { data: pedido, error: pedidoError } = await this.supabase
        .from("pedidos")
        .insert({
          numero_pedido: this.generarNumeroPedido(dto.metodoPago),
          user_id: dto.userId || null,
          estado: "PROCESANDO",
          total,
          metodo_pago: dto.metodoPago,
          referencia_pago: dto.referenciaPago,
          direccion_envio_id: dto.direccionEnvioId || null,
          email_cliente: dto.emailCliente?.toLowerCase() || null,
          documento_cliente: dto.documentoCliente || null,
          envio_nombre: snapshot?.nombre_destinatario ?? null,
          envio_linea1: snapshot?.linea1 ?? null,
          envio_linea2: snapshot?.linea2 ?? null,
          envio_ciudad: snapshot?.ciudad ?? null,
          envio_codigo_postal: snapshot?.codigo_postal ?? null,
          envio_provincia: snapshot?.provincia ?? null,
          envio_pais: snapshot?.pais ?? null,
        })
        .select("id")
        .single();

      if (pedido) {
        pedidoId = (pedido as { id: string }).id;
        break;
      }

      if (pedidoError?.code === "23505" && pedidoError.message.includes("numero_pedido")) {
        this.logger.warn(`Colisión de numero_pedido (intento ${intento + 1}); se reintenta`);
        continue;
      }

      this.logger.error(`Error al crear pedido (ref ${dto.referenciaPago}): ${pedidoError?.message}`);
      throw new UnprocessableEntityException("Error al crear el pedido");
    }

    if (!pedidoId) {
      this.logger.error(`No se pudo generar numero_pedido único (ref ${dto.referenciaPago})`);
      throw new UnprocessableEntityException("Error al crear el pedido");
    }

    // 4. Crear pedido_items (snapshot histórico)
    const pedidoItems = itemsFlatten.map((i) => ({
      pedido_id: pedidoId,
      producto_id: i.producto.id,
      nombre_producto: i.producto.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    }));

    const { error: itemsError } = await this.supabase.from("pedido_items").insert(pedidoItems);
    if (itemsError) {
      this.logger.error(`Error al crear pedido_items del pedido ${pedidoId}: ${itemsError.message}`);
      throw new UnprocessableEntityException("Error al registrar los ítems del pedido");
    }

    // 5. Confirmar stock: eliminar reservas SOLO de los productos de este
    //    pedido (no barrer toda la sesión: podría haber reservas de otros
    //    intentos de checkout aún vigentes)
    // Las reservas se crearon en el checkout con el usuario autenticado (o
    // la sesión de invitado), no con el dueño final del pedido.
    const { error: confirmarError } = await this.supabase.rpc("confirmar_stock", {
      p_session_id: dto.sessionId,
      p_user_id: dto.usuarioAutenticado ?? null,
      p_producto_ids: itemsFlatten.map((i) => i.producto.id),
    });

    if (confirmarError) {
      this.logger.error(`Error al confirmar stock del pedido ${pedidoId}: ${confirmarError.message}`);
    }

    // 6. Vaciar el carrito
    await this.supabase.from("carrito_items").delete().eq("carrito_id", carritoId);

    return pedidoId;
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

  async registrarTransaccion(
    pedidoId: string,
    proveedor: "stripe" | "paypal",
    eventoId: string,
    tipoEvento: string,
    estado: string,
    importe: number,
    payloadRaw: object,
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
   * Busca un pedido por id (utilidad para verificación post-pago).
   */
  async findPedidoPorReferencia(referenciaPago: string): Promise<{ id: string; estado: string } | null> {
    const { data } = await this.supabase
      .from("pedidos")
      .select("id, estado")
      .eq("referencia_pago", referenciaPago)
      .maybeSingle();

    if (!data) return null;
    return data as { id: string; estado: string };
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
