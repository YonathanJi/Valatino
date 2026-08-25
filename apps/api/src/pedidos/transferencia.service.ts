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
import { EmailService } from "../email/email.service";
import { InventarioService } from "../inventario/inventario.service";
import { formatearIban, ibanValido, normalizarIban } from "@valatino/types";
import type {
  AjustesTransferencia,
  DisponibilidadTransferencia,
  InstruccionesTransferencia,
} from "@valatino/types";

/** La cuenta a la que se pide transferir, venga del panel o del entorno. */
interface CuentaCobro {
  iban: string;
  titular: string;
  banco: string | null;
  diasPlazo: number;
}

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

  /** Respaldo por entorno, para cuando la tabla de ajustes está vacía. */
  private readonly porEntorno: CuentaCobro;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly email: EmailService,
    private readonly inventario: InventarioService,
    config: ConfigService,
  ) {
    this.porEntorno = {
      iban: normalizarIban(config.get<string>("TRANSFERENCIA_IBAN") ?? ""),
      titular: (config.get<string>("TRANSFERENCIA_TITULAR") ?? "").trim(),
      banco: (config.get<string>("TRANSFERENCIA_BANCO") ?? "").trim() || null,
      diasPlazo: Number(config.get<string>("TRANSFERENCIA_DIAS_PLAZO") ?? 3) || 3,
    };
  }

  /**
   * La cuenta de cobro: primero la del panel, y si no hay, la del entorno.
   *
   * Nació solo por entorno (045) y se movió a la base de datos (046) porque un
   * IBAN de cobro **no es un secreto** —se le enseña a cada cliente que compra—
   * sino un dato del negocio, y tenerlo en Render obligaba a entrar allí y
   * esperar un redespliegue para cambiar de cuenta. El respaldo por entorno se
   * conserva para no romper a quien ya lo tuviera puesto así.
   *
   * Se lee en cada uso en vez de cachearse: cambiar la cuenta desde el panel
   * tiene que surtir efecto en el pedido siguiente, no cuando se reinicie la
   * API. Son dos consultas por checkout, no vale la pena optimizarlo.
   */
  private async cuenta(): Promise<CuentaCobro> {
    const { data, error } = await this.supabase
      .from("ajustes_tienda")
      .select(
        "transferencia_iban, transferencia_titular, transferencia_banco, transferencia_dias_plazo",
      )
      .maybeSingle();

    if (error) {
      this.logger.error(
        `No se pudieron leer los ajustes de la tienda: ${error.message}. Se usa el respaldo por entorno.`,
      );
      return this.porEntorno;
    }

    const fila = data as {
      transferencia_iban: string | null;
      transferencia_titular: string | null;
      transferencia_banco: string | null;
      transferencia_dias_plazo: number | null;
    } | null;

    const iban = normalizarIban(fila?.transferencia_iban ?? "");
    const titular = (fila?.transferencia_titular ?? "").trim();

    // La fila existe siempre (la crea la migración), así que «no configurado»
    // es que esté vacía, no que falte.
    if (!iban || !titular) return this.porEntorno;

    return {
      iban,
      titular,
      banco: (fila?.transferencia_banco ?? "").trim() || null,
      diasPlazo: fila?.transferencia_dias_plazo ?? 3,
    };
  }

  /**
   * Sin cuenta configurada la opción no se ofrece. Es deliberado que el método
   * se apague solo en vez de fallar al final: enseñar «paga por transferencia»
   * y luego no poder decir a dónde deja al cliente con un pedido y sin salida.
   *
   * Un IBAN que no pasa su dígito de control cuenta como no configurado: mandar
   * a la gente a transferir a una cuenta con una errata es peor que no ofrecer
   * el método.
   */
  private utilizable(c: CuentaCobro): boolean {
    return c.iban.length > 0 && c.titular.length > 0 && ibanValido(c.iban);
  }

  async disponibilidad(): Promise<DisponibilidadTransferencia> {
    const c = await this.cuenta();
    return { disponible: this.utilizable(c), dias_plazo: c.diasPlazo };
  }

  /**
   * Los ajustes tal como se editan en el panel (TI → Ajustes).
   *
   * `origen` importa: si la cuenta viene del entorno, cambiarla aquí no surtirá
   * efecto hasta vaciar aquellas variables, y quien lo edita tiene que saberlo
   * en vez de descubrirlo guardando y viendo que no cambia nada.
   */
  async ajustes(): Promise<AjustesTransferencia> {
    const { data } = await this.supabase
      .from("ajustes_tienda")
      .select(
        "transferencia_iban, transferencia_titular, transferencia_banco, transferencia_dias_plazo, updated_at",
      )
      .maybeSingle();

    const fila = (data ?? {}) as Record<string, string | number | null>;
    const ibanGuardado = normalizarIban(String(fila["transferencia_iban"] ?? ""));
    const enUso = await this.cuenta();

    return {
      iban: ibanGuardado ? formatearIban(ibanGuardado) : "",
      titular: String(fila["transferencia_titular"] ?? ""),
      banco: String(fila["transferencia_banco"] ?? ""),
      dias_plazo: Number(fila["transferencia_dias_plazo"] ?? 3),
      disponible: this.utilizable(enUso),
      origen: ibanGuardado ? "panel" : this.porEntorno.iban ? "entorno" : "sin_configurar",
      actualizado_el: (fila["updated_at"] as string) ?? null,
    };
  }

  /** Guarda la cuenta de cobro. El IBAN se valida antes: ver `ibanValido`. */
  async guardarAjustes(
    datos: { iban: string; titular: string; banco?: string; dias_plazo?: number },
    actorId?: string,
  ): Promise<AjustesTransferencia> {
    const iban = normalizarIban(datos.iban);

    // Vaciar los dos campos apaga el método a propósito; es una forma legítima
    // de dejar de aceptar transferencias sin tocar nada más.
    const apagando = !iban && !datos.titular.trim();

    if (!apagando) {
      if (!ibanValido(iban)) {
        throw new BadRequestException(
          "Ese IBAN no es correcto: no cuadra su dígito de control. Revísalo, porque un IBAN " +
            "con una errata manda a los clientes a transferir a una cuenta que no existe.",
        );
      }
      if (!datos.titular.trim()) {
        throw new BadRequestException("Falta el titular de la cuenta");
      }
    }

    const { error } = await this.supabase
      .from("ajustes_tienda")
      .update({
        transferencia_iban: iban || null,
        transferencia_titular: datos.titular.trim() || null,
        transferencia_banco: datos.banco?.trim() || null,
        transferencia_dias_plazo: datos.dias_plazo ?? 3,
        actualizado_por: actorId ?? null,
      })
      .eq("id", true);

    if (error) {
      this.logger.error(`No se pudieron guardar los ajustes: ${error.message}`);
      throw new BadRequestException("No se pudieron guardar los ajustes");
    }

    this.logger.log(
      apagando
        ? `Pago por transferencia desactivado desde el panel${actorId ? ` por ${actorId}` : ""}`
        : `Cuenta de cobro actualizada desde el panel${actorId ? ` por ${actorId}` : ""}`,
    );

    return this.ajustes();
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
    const cuenta = await this.cuenta();
    if (!this.utilizable(cuenta)) {
      throw new BadRequestException(
        "El pago por transferencia no está disponible ahora mismo. Prueba con tarjeta o Bizum.",
      );
    }

    const { data, error } = await this.supabase.rpc("crear_pedido_transferencia", {
      p_session_id: params.sessionId,
      p_usuario_autenticado: params.usuarioAutenticado ?? null,
      p_user_id: params.userId ?? null,
      p_clave_idempotencia: params.claveIdempotencia,
      p_dias_plazo: cuenta.diasPlazo,
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

    const instrucciones = await this.instrucciones(data as string);

    // Sin await: SMTP tarda segundos y el cliente está esperando su IBAN en
    // pantalla. Es el correo más importante de la tienda —es el único que se
    // necesita para PODER pagar—, pero también lo tiene delante en ese momento;
    // si el envío falla, queda en el log y las instrucciones siguen en su ficha
    // de «Mis pedidos».
    void this.avisarComoPagar(instrucciones, params.email);

    return instrucciones;
  }

  /** El correo con el IBAN y el concepto. Nunca propaga. */
  private async avisarComoPagar(
    instrucciones: InstruccionesTransferencia,
    emailDelDto?: string,
  ): Promise<void> {
    try {
      // El correo del pedido, no el del DTO: para un cliente con cuenta el DTO
      // puede no traerlo, y el pedido siempre tiene a quién avisar (lo garantiza
      // `pedidos_localizable_check`).
      const { data } = await this.supabase
        .from("pedidos")
        .select("email_cliente")
        .eq("id", instrucciones.pedido_id)
        .maybeSingle();

      const destino = (data as { email_cliente: string | null } | null)?.email_cliente ?? emailDelDto;
      if (!destino) {
        this.logger.warn(
          `Pedido ${instrucciones.numero_pedido} por transferencia sin correo: no se pueden enviar las instrucciones`,
        );
        return;
      }

      await this.email.enviarInstruccionesTransferencia({
        pedidoId: instrucciones.pedido_id,
        numeroPedido: instrucciones.numero_pedido,
        email: destino,
        importe: instrucciones.importe,
        iban: instrucciones.iban,
        titular: instrucciones.titular,
        banco: instrucciones.banco,
        concepto: instrucciones.concepto,
        venceEl: instrucciones.vence_el,
      });
    } catch (err) {
      this.logger.error(
        `No se pudieron enviar las instrucciones de pago del pedido ${instrucciones.numero_pedido}: ${(err as Error).message}`,
      );
    }
  }

  /** Los datos de pago de un pedido que está esperando su transferencia. */
  async instrucciones(pedidoId: string): Promise<InstruccionesTransferencia> {
    const cuenta = await this.cuenta();
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
      iban: formatearIban(cuenta.iban),
      titular: cuenta.titular,
      banco: cuenta.banco,
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

    // El cliente transfirió y hasta ahora no recibía nada: el pedido pasaba a
    // PROCESANDO por RPC, que no dispara el aviso de cambio de estado. Se le
    // manda la confirmación de siempre, la misma que recibe quien paga con
    // tarjeta, para que sepa que su dinero llegó.
    if (r.confirmado === true) {
      void this.avisarPagoRecibido(pedidoId);
    }

    return {
      confirmado: r.confirmado === true,
      estado: r.estado ?? "PENDIENTE_PAGO",
      sin_reserva: r.sin_reserva ?? 0,
    };
  }

  /** «Hemos recibido tu transferencia». Nunca propaga: el dinero ya está. */
  private async avisarPagoRecibido(pedidoId: string): Promise<void> {
    try {
      const pedido = await this.inventario.getPedidoConItems(pedidoId);
      if (!pedido?.email_cliente) return;

      await this.email.enviarConfirmacionPedido({
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido,
        email: pedido.email_cliente,
        items: pedido.items,
        /**
         * ⚠️ LAS TRES, y aquí es donde MÁS importa de los cuatro correos: este
         * lleva el IBAN y el importe que el cliente va a TECLEAR en su banco. Sin
         * el porte (080) y sin el descuento (083), las líneas no sumaban el total y
         * quien intentara cuadrar la transferencia con el detalle no podía —y si se
         * fía de la resta, ingresa una cifra que no es la del pedido.
         */
        costeEnvio: Number(pedido.coste_envio ?? 0),
        descuento: Number(pedido.descuento ?? 0),
        descuentoCodigo: pedido.descuento_codigo,
        total: Number(pedido.total),
        metodoPago: "transferencia",
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
        estado: "PROCESANDO",
        fecha: new Date(pedido.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar del pago recibido (pedido ${pedidoId}): ${(err as Error).message}`,
      );
    }
  }
}
