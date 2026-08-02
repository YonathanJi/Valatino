import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type {
  DisponibilidadTransferencia,
  InstruccionesTransferencia,
} from "@valatino/types";

/**
 * Pago por transferencia bancaria: el único método asíncrono de la tienda.
 *
 * A diferencia de la tarjeta o Bizum, aquí el pedido nace DEBIENDO dinero y se
 * queda esperando a que alguien del equipo confirme que la transferencia llegó.
 * Todo el trabajo delicado —crear el pedido reteniendo el stock, consumirlo al
 * confirmar y soltarlo si nadie paga— vive en SQL (migración 045), porque es lo
 * único que garantiza que pedido, líneas y stock se muevan a la vez o no se
 * mueva nada.
 */
@Injectable()
export class TransferenciaService {
  private readonly logger = new Logger(TransferenciaService.name);

  private readonly iban: string;
  private readonly titular: string;
  private readonly banco: string | null;
  private readonly diasPlazo: number;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    config: ConfigService,
  ) {
    /*
     * Los datos bancarios son configuración, no código: cambiar de cuenta no
     * puede exigir un despliegue, y el IBAN no tiene por qué quedar escrito en
     * el historial de git de todo el que clone el repositorio.
     *
     * Se normaliza quitando espacios: se teclea «ES48 9490 …» y se compara y
     * guarda sin ellos, igual que se hizo con los teléfonos en la 040.
     */
    this.iban = (config.get<string>("TRANSFERENCIA_IBAN") ?? "").replace(/\s+/g, "").toUpperCase();
    this.titular = (config.get<string>("TRANSFERENCIA_TITULAR") ?? "").trim();
    this.banco = (config.get<string>("TRANSFERENCIA_BANCO") ?? "").trim() || null;
    this.diasPlazo = Number(config.get<string>("TRANSFERENCIA_DIAS_PLAZO") ?? 3) || 3;

    if (!this.disponible()) {
      this.logger.log(
        "Transferencia bancaria desactivada: falta TRANSFERENCIA_IBAN o TRANSFERENCIA_TITULAR",
      );
    }
  }

  /**
   * Sin cuenta configurada la opción no se ofrece. Es deliberado que el método
   * se apague solo en vez de fallar al final: enseñar «paga por transferencia»
   * y luego no poder decir a dónde deja al cliente con un pedido y sin salida.
   */
  private disponible(): boolean {
    return this.iban.length > 0 && this.titular.length > 0;
  }

  disponibilidad(): DisponibilidadTransferencia {
    return { disponible: this.disponible(), dias_plazo: this.diasPlazo };
  }

  /** Agrupado de cuatro en cuatro, que es como se lee y se teclea un IBAN. */
  private ibanLegible(): string {
    return this.iban.replace(/(.{4})/g, "$1 ").trim();
  }

  async crearPedido(params: {
    sessionId: string;
    usuarioAutenticado?: string;
    userId?: string;
    claveIdempotencia: string;
    direccionEnvioId?: string;
    email?: string;
    documento?: string;
    envio?: object | null;
  }): Promise<InstruccionesTransferencia> {
    if (!this.disponible()) {
      throw new BadRequestException(
        "El pago por transferencia no está disponible ahora mismo. Prueba con tarjeta o Bizum.",
      );
    }

    const { data, error } = await this.supabase.rpc("crear_pedido_transferencia", {
      p_session_id: params.sessionId,
      p_usuario_autenticado: params.usuarioAutenticado ?? null,
      p_user_id: params.userId ?? null,
      p_clave_idempotencia: params.claveIdempotencia,
      p_dias_plazo: this.diasPlazo,
      p_direccion_envio_id: params.direccionEnvioId ?? null,
      p_email_cliente: params.email ?? null,
      p_documento_cliente: params.documento ?? null,
      p_envio: params.envio ?? null,
    });

    if (error) {
      // P0003: la reserva del carrito caducó. No es un fallo del sistema y el
      // cliente puede resolverlo él mismo, así que se le dice qué hacer.
      if (error.code === "P0003") {
        throw new BadRequestException(
          "La reserva de tu carrito ha caducado. Vuelve a revisar el carrito e inténtalo de nuevo.",
        );
      }
      this.logger.error(`No se pudo crear el pedido por transferencia: ${error.message}`);
      throw new BadRequestException("No se pudo preparar el pedido. Inténtalo de nuevo.");
    }

    return this.instrucciones(data as string);
  }

  /** Los datos de pago de un pedido que está esperando su transferencia. */
  async instrucciones(pedidoId: string): Promise<InstruccionesTransferencia> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("id, numero_pedido, total, pago_vence_el, metodo_pago, estado")
      .eq("id", pedidoId)
      .maybeSingle();

    if (error || !data) throw new NotFoundException("Pedido no encontrado");

    const pedido = data as {
      id: string;
      numero_pedido: string;
      total: string | number;
      pago_vence_el: string | null;
      metodo_pago: string;
      estado: string;
    };

    return {
      pedido_id: pedido.id,
      numero_pedido: pedido.numero_pedido,
      importe: Number(pedido.total),
      iban: this.ibanLegible(),
      titular: this.titular,
      banco: this.banco,
      // El número de pedido, tal cual: es lo único que casa el ingreso del
      // banco con el pedido.
      concepto: pedido.numero_pedido,
      vence_el: pedido.pago_vence_el ?? "",
    };
  }

  /**
   * Da por recibida la transferencia: el pedido pasa a PROCESANDO y su stock
   * se consume. Lo lanza una persona desde el panel, porque es una persona
   * quien mira el extracto del banco.
   */
  async confirmarPago(
    pedidoId: string,
    actorId?: string,
  ): Promise<{ confirmado: boolean; estado: string; sin_reserva: number }> {
    const { data, error } = await this.supabase.rpc("confirmar_pago_transferencia", {
      p_pedido_id: pedidoId,
      p_actor_id: actorId ?? null,
    });

    if (error) {
      if (error.code === "P0002") throw new NotFoundException("Pedido no encontrado");
      if (error.code === "P0001") {
        throw new BadRequestException("Este pedido no se paga por transferencia");
      }
      this.logger.error(`No se pudo confirmar la transferencia de ${pedidoId}: ${error.message}`);
      throw new BadRequestException("No se pudo confirmar el pago");
    }

    const r = (data ?? {}) as { confirmado?: boolean; estado?: string; sin_reserva?: number };

    // El plazo venció y el cron ya había devuelto las unidades a la venta, así
    // que se han vuelto a descontar sin reserva detrás. Puede haber dejado el
    // inventario por debajo de lo real si alguien compró entretanto.
    if ((r.sin_reserva ?? 0) > 0) {
      this.logger.warn(
        `Pedido ${pedidoId}: la transferencia llegó después de vencer el plazo y su stock ya se había liberado. ` +
          "Se ha descontado del disponible; conviene revisar el inventario de esos productos.",
      );
    }

    return {
      confirmado: r.confirmado === true,
      estado: r.estado ?? "PENDIENTE_PAGO",
      sin_reserva: r.sin_reserva ?? 0,
    };
  }
}
