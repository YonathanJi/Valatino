import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";
import { ReembolsosService } from "./reembolsos.service";
import { EventosPedidoService } from "../eventos/eventos-pedido.service";
import { etiquetaMetodoPago } from "../email/templates/confirmacion-pedido";

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
  /**
   * Cómo pagó de verdad («card», «bizum»…), tal como lo llama la pasarela.
   * `metodo_pago` guarda solo por dónde pasó el dinero, y desde que Stripe
   * también sirve Bizum eso ya no describe la forma de pago.
   */
  metodoDetalle?: string | null;
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
    private readonly reembolsos: ReembolsosService,
    // Para dejar constancia de un reembolso que no llegó a completarse.
    private readonly eventos: EventosPedidoService,
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

    // Antes del correo: es lo que decide si dirá «Bizum» o «Tarjeta». Nunca
    // propaga — un pedido cobrado no puede fallar por no saber etiquetar la
    // forma de pago.
    if (pago.metodoDetalle) {
      const { error } = await this.supabase.rpc("anotar_metodo_detalle", {
        p_pedido_id: pedidoId,
        p_detalle: pago.metodoDetalle,
      });
      if (error) {
        this.logger.warn(
          `No se pudo anotar la forma de pago del pedido ${pedidoId}: ${error.message}`,
        );
      }
    }

    await this.inventarioService.registrarTransaccion(
      pedidoId,
      pago.proveedor,
      pago.eventoId,
      pago.tipoEvento,
      "exitoso",
      pago.importe,
      pago.payloadRaw,
      { tipo: "pago", origen: "checkout" },
    );

    // Después de anotar el método: la nota dice con qué se pagó al final, y
    // hasta aquí no se sabía.
    await this.anotarPedidoReemplazado(pedidoId, pago.metodoDetalle ?? pago.proveedor);

    await this.enviarEmailPedido(pedidoId, false);
    return pedidoId;
  }

  /**
   * Deja escrito en la línea de tiempo que esta compra venía de otro pedido.
   *
   * Cuando el cliente pide los datos de una transferencia y acaba pagando por
   * otra vía, aquel pedido se cancela (047) y los dos quedan enlazados (049).
   * Pero quien abría el cancelado veía un «Pendiente de pago → Cancelado» a
   * secas, sin motivo. Se anota en los dos lados para que la historia se lea
   * completa desde cualquiera de ellos.
   *
   * Nunca propaga: es una explicación, y un pedido cobrado no puede fallar por
   * no poder contarse bien.
   */
  private async anotarPedidoReemplazado(pedidoId: string, comoPago: string): Promise<void> {
    try {
      const { data } = await this.supabase
        .from("pedidos")
        .select("id, numero_pedido")
        .eq("reemplazado_por", pedidoId);

      const anteriores = (data ?? []) as Array<{ id: string; numero_pedido: string | null }>;
      if (anteriores.length === 0) return;

      const { data: actual } = await this.supabase
        .from("pedidos")
        .select("numero_pedido")
        .eq("id", pedidoId)
        .maybeSingle();

      const numeroActual = (actual as { numero_pedido: string | null } | null)?.numero_pedido ?? "";
      const forma = etiquetaMetodoPago("stripe", comoPago);

      for (const anterior of anteriores) {
        await this.eventos.registrar({
          pedidoId: anterior.id,
          tipo: "nota",
          detalle:
            `El cliente decidió pagar esta compra con ${forma}, así que este pedido se cancela. ` +
            `Continúa en el pedido ${numeroActual}.`,
          origen: "checkout",
        });

        await this.eventos.registrar({
          pedidoId,
          tipo: "nota",
          detalle:
            `Esta compra se inició como pedido ${anterior.numero_pedido ?? "anterior"}, para pagar ` +
            `por transferencia. El cliente cambió a ${forma} y aquel quedó cancelado.`,
          origen: "checkout",
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo anotar el pedido reemplazado de ${pedidoId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Un reembolso que Stripe aceptó pero que después NO llegó a completarse.
   *
   * ⚠️ Existe por Bizum: sus devoluciones son **asíncronas**. Con tarjeta, que
   * Stripe acepte el reembolso equivale a que el dinero sale; con Bizum puede
   * fallar minutos más tarde, y para entonces el panel ya dio la devolución por
   * hecha — repuso el stock, apuntó los artículos, quizá cerró el pedido y
   * avisó al cliente por correo—. Stripe devuelve el importe a nuestro saldo y
   * el cliente se queda sin su dinero.
   *
   * **No se revierte nada automáticamente**, y es deliberado: deshacer el
   * apunte, volver a descontar el stock y reabrir el pedido a ciegas puede
   * empeorarlo si alguien ya actuó sobre él —o si la mercancía ya volvió—. Lo
   * que hace falta es que no pase inadvertido, así que queda en la línea de
   * tiempo del pedido, donde lo va a ver quien lo abra, y en el log como error.
   */
  async procesarReembolsoFallido(datos: {
    referenciaPago: string;
    importe: number;
    motivo: string | null;
  }): Promise<string | null> {
    const pedido = await this.inventarioService.findPedidoPorReferencia(datos.referenciaPago);
    if (!pedido) {
      this.logger.error(
        `Reembolso FALLIDO sin pedido asociado (ref ${datos.referenciaPago}, ${datos.importe} €)`,
      );
      return null;
    }

    this.logger.error(
      `El reembolso de ${datos.importe} € del pedido ${pedido.id} NO se ha completado` +
        `${datos.motivo ? ` (${datos.motivo})` : ""}. El dinero ha vuelto al saldo de Stripe y el cliente NO lo ha recibido: ` +
        "hay que devolvérselo por otra vía. El pedido puede figurar ya como reembolsado.",
    );

    await this.eventos.registrar({
      pedidoId: pedido.id,
      tipo: "reembolso",
      importe: datos.importe,
      detalle:
        `LA DEVOLUCIÓN NO SE COMPLETÓ${datos.motivo ? ` (${datos.motivo})` : ""}. ` +
        "El dinero volvió a nuestro saldo y el cliente no lo ha recibido: hay que devolvérselo por otra vía.",
      origen: "webhook",
    });

    return pedido.id;
  }

  /**
   * Reembolso notificado por el proveedor. Devuelve el id del pedido o null si
   * no existe.
   *
   * `reembolso.importe` es el ACUMULADO devuelto del cargo, no el incremento:
   * así lo informa `charge.amount_refunded` de Stripe.
   *
   * Solo un reembolso por el importe completo cambia el estado a REEMBOLSADO (y
   * repone stock): uno parcial se registra en transacciones_pago (traza
   * contable) y deja el pedido en su estado, porque el envío sigue su curso.
   * Antes cualquier importe, aunque fuese de 1 €, marcaba el pedido entero como
   * reembolsado.
   */
  async procesarReembolso(reembolso: ReembolsoNotificado): Promise<string | null> {
    const pedido = await this.inventarioService.findPedidoPorReferencia(reembolso.referenciaPago);
    if (!pedido) {
      this.logger.warn(`Reembolso sin pedido asociado (ref ${reembolso.referenciaPago})`);
      return null;
    }

    // Céntimos: evita que 49.99 !== 49.99 por coma flotante
    const acumuladoCents = Math.round(reembolso.importe * 100);
    const esTotal = acumuladoCents >= Math.round(Number(pedido.total) * 100);

    /*
     * ¿Nos enteramos ahora del reembolso, o es el eco del que acabamos de lanzar
     * desde el backoffice? Stripe notifica charge.refunded también cuando la
     * devolución la pedimos nosotros, y ese camino ya avisó al cliente. Sin esta
     * comprobación el cliente recibiría dos correos por la misma devolución.
     */
    const yaConocidoCents = Math.round((await this.reembolsos.totalReembolsado(pedido.id)) * 100);
    const esNuevo = acumuladoCents > yaConocidoCents;

    if (esTotal) {
      // Cambia el estado y repone el stock, una sola vez aunque el panel ya lo
      // hubiera hecho (migración 037).
      await this.reembolsos.marcarReembolsadoYReponerStock(pedido.id);
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
      /**
       * Sin actor: esto llega por el aviso de Stripe, no lo pidió nadie desde el
       * panel.
       *
       * ⚠️⚠️ Y SOLO SE ANOTA EN LA LÍNEA DE TIEMPO SI TRAE ALGO NUEVO. Stripe
       * manda `charge.refunded` también cuando la devolución la lanzamos
       * nosotros, y ahí el evento con nombre ya lo dejó `ReembolsosService` al
       * cobrarla — el comentario que había aquí ya lo decía, pero se anotaba
       * igualmente: cada devolución del panel escribía DOS «Devolución» seguidas.
       * Y como el importe de `charge.refunded` es el ACUMULADO del cargo, la
       * segunda contradecía a la primera: «Devolución de 2,40 €» y justo debajo
       * «Devolución de 3,02 €», que se lee como 5,42 € devueltos.
       *
       * La transacción SÍ se guarda siempre: es el registro de lo que dijo
       * Stripe y de ahí sale el total devuelto. Lo que se calla es la línea
       * duplicada de la ficha.
       *
       * ⭐ Y cuando la devolución se hizo desde el panel de Stripe —o el registro
       * del backoffice falló—, esto SÍ es lo único que la cuenta, así que el
       * evento sale, con lo devuelto de nuevo y no con el acumulado.
       */
      esNuevo
        ? {
            tipo: "reembolso",
            origen: "webhook",
            importe: (acumuladoCents - yaConocidoCents) / 100,
          }
        : undefined,
    );

    if (esNuevo) {
      // También en los parciales: a quien le devuelven 10 € de 50 € hay que
      // decírselo, y con el importe.
      await this.enviarEmailPedido(pedido.id, true, reembolso.importe);
    } else {
      this.logger.debug(
        `Reembolso de ${reembolso.importe} € del pedido ${pedido.id} ya conocido; no se reenvía el aviso`,
      );
    }

    return pedido.id;
  }

  /** Email transaccional de confirmación o reembolso (no bloqueante). */
  private async enviarEmailPedido(
    pedidoId: string,
    esReembolso: boolean,
    importeReembolsado?: number,
  ): Promise<void> {
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
        metodoDetalle: pedido.metodo_detalle,
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
        await this.emailService.enviarReembolso({ ...datos, esReembolso: true, importeReembolsado });
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
