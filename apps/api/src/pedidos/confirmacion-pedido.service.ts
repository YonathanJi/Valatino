import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";

/**
 * Pago confirmado por un proveedor, ya verificado y normalizado por el
 * webhook correspondiente. Todo lo específico del proveedor (firma, formato
 * del evento) se queda en el controller; a partir de aquí el flujo es único.
 */
export interface PagoConfirmado {
  proveedor: "stripe" | "paypal";
  eventoId: string;
  tipoEvento: string;
  sessionId: string;
  userId?: string;
  emailCliente?: string;
  documentoCliente?: string;
  referenciaPago: string;
  importe: number;
  payloadRaw: object;
}

export interface ReembolsoNotificado {
  proveedor: "stripe" | "paypal";
  eventoId: string;
  tipoEvento: string;
  referenciaPago: string;
  importe: number;
  payloadRaw: object;
}

/**
 * Orquestación única post-pago: crear el pedido, registrar la transacción y
 * enviar el email. Añadir un método de pago nuevo = escribir su webhook que
 * traduzca el evento a PagoConfirmado/ReembolsoNotificado y llame aquí.
 */
@Injectable()
export class ConfirmacionPedidoService {
  private readonly logger = new Logger(ConfirmacionPedidoService.name);

  constructor(
    private readonly inventarioService: InventarioService,
    private readonly emailService: EmailService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async confirmarPago(pago: PagoConfirmado): Promise<string> {
    // Datos completos del checkout (dirección incluida) desde staging
    const checkoutDatos = pago.sessionId
      ? await this.inventarioService.getCheckoutDatos(pago.sessionId)
      : null;

    const emailCliente = (checkoutDatos?.email ?? pago.emailCliente ?? "").toLowerCase();
    const documentoCliente = checkoutDatos?.documento ?? pago.documentoCliente ?? "";

    // Usuario autenticado durante el checkout: localiza carrito y reservas
    const usuarioAutenticado = pago.userId || checkoutDatos?.user_id || undefined;

    // Dueño del pedido: el autenticado, o — invitado con email de una cuenta
    // registrada — el perfil que corresponde a ese email
    let userId = usuarioAutenticado;
    if (!userId && emailCliente) {
      const { data: profile } = await this.supabase
        .from("profiles")
        .select("id")
        .eq("email", emailCliente)
        .maybeSingle();

      if (profile) userId = (profile as { id: string }).id;
    }

    const pedidoId = await this.inventarioService.confirmarVentaYCrearPedido({
      userId,
      usuarioAutenticado,
      sessionId: pago.sessionId,
      metodoPago: pago.proveedor,
      referenciaPago: pago.referenciaPago,
      direccionEnvioId: checkoutDatos?.direccion_envio_id ?? undefined,
      direccionSnapshot: checkoutDatos?.direccion ?? undefined,
      emailCliente: emailCliente || undefined,
      documentoCliente: documentoCliente || undefined,
    });

    await this.inventarioService.registrarTransaccion(
      pedidoId,
      pago.proveedor,
      pago.eventoId,
      pago.tipoEvento,
      "exitoso",
      pago.importe,
      pago.payloadRaw,
    );

    await this.enviarEmailPedido(pedidoId, false);
    return pedidoId;
  }

  /**
   * Reembolso notificado por el proveedor. Devuelve el id del pedido o null si
   * no existe.
   *
   * Solo un reembolso por el importe completo cambia el estado a REEMBOLSADO:
   * uno parcial se registra en transacciones_pago (traza contable) y deja el
   * pedido en su estado, porque el envío sigue su curso. Antes cualquier
   * importe, aunque fuese de 1 €, marcaba el pedido entero como reembolsado.
   */
  async procesarReembolso(reembolso: ReembolsoNotificado): Promise<string | null> {
    const pedido = await this.inventarioService.findPedidoPorReferencia(reembolso.referenciaPago);
    if (!pedido) {
      this.logger.warn(`Reembolso sin pedido asociado (ref ${reembolso.referenciaPago})`);
      return null;
    }

    // Céntimos: evita que 49.99 !== 49.99 por coma flotante
    const esTotal = Math.round(reembolso.importe * 100) >= Math.round(Number(pedido.total) * 100);

    if (esTotal) {
      await this.inventarioService.actualizarEstadoPorReferencia(
        reembolso.referenciaPago,
        "REEMBOLSADO",
      );
    } else {
      this.logger.log(
        `Reembolso parcial de ${reembolso.importe} € sobre ${pedido.total} € (pedido ${pedido.id}): se registra sin cambiar el estado`,
      );
    }

    await this.inventarioService.registrarTransaccion(
      pedido.id,
      reembolso.proveedor,
      reembolso.eventoId,
      reembolso.tipoEvento,
      esTotal ? "reembolsado" : "reembolsado_parcial",
      reembolso.importe,
      reembolso.payloadRaw,
    );

    if (esTotal) await this.enviarEmailPedido(pedido.id, true);
    return pedido.id;
  }

  /** Email transaccional de confirmación o reembolso (no bloqueante). */
  private async enviarEmailPedido(pedidoId: string, esReembolso: boolean): Promise<void> {
    try {
      const pedido = await this.inventarioService.getPedidoConItems(pedidoId);
      if (!pedido || !pedido.email_cliente || pedido.items.length === 0) return;

      const datos = {
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido,
        email: pedido.email_cliente,
        items: pedido.items,
        total: Number(pedido.total),
        metodoPago: pedido.metodo_pago,
        direccionEnvio: pedido.envio_nombre
          ? {
              nombre_destinatario: pedido.envio_nombre,
              linea1: pedido.envio_linea1 ?? "",
              linea2: pedido.envio_linea2,
              ciudad: pedido.envio_ciudad ?? "",
              codigo_postal: pedido.envio_codigo_postal ?? "",
              provincia: pedido.envio_provincia ?? "",
              pais: pedido.envio_pais ?? undefined,
            }
          : null,
        estado: pedido.estado,
        fecha: new Date(pedido.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      };

      if (esReembolso) {
        await this.emailService.enviarReembolso({ ...datos, esReembolso: true });
      } else {
        await this.emailService.enviarConfirmacionPedido(datos);
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar email ${esReembolso ? "de reembolso" : "de confirmación"} (pedido ${pedidoId}): ${(err as Error).message}`,
      );
    }
  }
}
