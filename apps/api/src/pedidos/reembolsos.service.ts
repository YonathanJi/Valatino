import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { StripeService } from "../pagos/stripe.service";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";
import { ESTADOS_REEMBOLSABLES } from "@valatino/types";
import type { PedidoEstado, ResultadoReembolso } from "@valatino/types";
import type { CrearReembolsoDto } from "./dto/crear-reembolso.dto";

/**
 * Estados de transacciones_pago que representan dinero devuelto.
 * Ver la nota sobre importes acumulados en `totalesReembolsados`.
 */
const ESTADOS_REEMBOLSO = ["reembolsado", "reembolsado_parcial"];

/** Redondeo a céntimos: comparar euros en coma flotante da falsos negativos. */
const cents = (n: number): number => Math.round(n * 100);

interface PedidoParaReembolso {
  id: string;
  estado: PedidoEstado;
  total: number;
  metodo_pago: string;
  referencia_pago: string | null;
  numero_pedido: string | null;
}

/**
 * Devoluciones de dinero iniciadas desde el backoffice.
 *
 * El reembolso se cobra primero en Stripe y solo después se toca la base de
 * datos: si Stripe falla no queda un pedido marcado como reembolsado sin
 * dinero devuelto, que es exactamente lo que hacía el desplegable de estados
 * antes de existir este servicio.
 */
@Injectable()
export class ReembolsosService {
  private readonly logger = new Logger(ReembolsosService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly stripe: StripeService,
    private readonly inventario: InventarioService,
    private readonly email: EmailService,
  ) {}

  /**
   * Importe ya devuelto de cada pedido, indexado por id.
   *
   * OJO — es un MAX, no un SUM, y es deliberado: cada fila de reembolso guarda
   * el **acumulado** devuelto hasta ese momento, no el incremento. El motivo es
   * que el mismo reembolso se registra dos veces por caminos distintos (el
   * panel al pedirlo, y el webhook charge.refunded cuando Stripe lo confirma),
   * con evento_id distinto, así que la restricción de unicidad no los deduplica.
   * Sumar contaría el doble; quedarse con el máximo es idempotente.
   *
   * `charge.amount_refunded` de Stripe ya es acumulado, de ahí el criterio.
   */
  async totalesReembolsados(pedidoIds: string[]): Promise<Map<string, number>> {
    const totales = new Map<string, number>();
    if (pedidoIds.length === 0) return totales;

    const { data, error } = await this.supabase
      .from("transacciones_pago")
      .select("pedido_id, importe")
      .in("pedido_id", pedidoIds)
      .in("estado", ESTADOS_REEMBOLSO);

    if (error) {
      this.logger.error(`No se pudieron leer los reembolsos: ${error.message}`);
      return totales;
    }

    for (const fila of (data as Array<{ pedido_id: string; importe: string | number }>) ?? []) {
      const importe = Number(fila.importe);
      if (importe > (totales.get(fila.pedido_id) ?? 0)) {
        totales.set(fila.pedido_id, importe);
      }
    }

    return totales;
  }

  async totalReembolsado(pedidoId: string): Promise<number> {
    return (await this.totalesReembolsados([pedidoId])).get(pedidoId) ?? 0;
  }

  async reembolsar(
    pedidoId: string,
    dto: CrearReembolsoDto,
    solicitadoPor: string,
  ): Promise<ResultadoReembolso> {
    const pedido = await this.cargarPedido(pedidoId);

    if (!ESTADOS_REEMBOLSABLES.includes(pedido.estado)) {
      throw new BadRequestException(
        pedido.estado === "REEMBOLSADO"
          ? "Este pedido ya está reembolsado por completo"
          : `Un pedido en estado ${pedido.estado} no tiene un cobro que devolver`,
      );
    }

    if (pedido.metodo_pago !== "stripe") {
      throw new BadRequestException(
        "Este pedido se pagó con PayPal: la devolución hay que hacerla desde el panel de PayPal. " +
          "Al hacerlo, el webhook actualizará el pedido y avisará al cliente automáticamente.",
      );
    }

    if (!pedido.referencia_pago) {
      throw new BadRequestException(
        "El pedido no tiene referencia de pago de Stripe, así que no se puede devolver por aquí",
      );
    }

    const totalCents = cents(Number(pedido.total));
    const yaCents = cents(await this.totalReembolsado(pedidoId));
    const restanteCents = totalCents - yaCents;

    if (restanteCents <= 0) {
      throw new ConflictException("Ya se ha devuelto el importe completo de este pedido");
    }

    // Sin importe = "devuélvelo todo": lo que quede pendiente, calculado aquí.
    const importeCents = dto.importe === undefined ? restanteCents : cents(dto.importe);

    if (importeCents > restanteCents) {
      throw new BadRequestException(
        `Solo quedan ${(restanteCents / 100).toFixed(2)} € por devolver de este pedido`,
      );
    }

    const refund = await this.stripe.crearReembolso({
      paymentIntentId: pedido.referencia_pago,
      importeCents,
      // Mismo pedido + mismo punto de partida + mismo importe = misma clave, así
      // que un doble clic reutiliza el reembolso en vez de duplicarlo. Dos
      // devoluciones parciales iguales pero consecutivas sí se cobran las dos,
      // porque la segunda arranca con otro `yaCents`.
      idempotencyKey: `reembolso:${pedidoId}:${yaCents}:${importeCents}`,
      metadata: {
        pedido_id: pedidoId,
        numero_pedido: pedido.numero_pedido ?? "",
        solicitado_por: solicitadoPor,
        ...(dto.motivo ? { motivo: dto.motivo } : {}),
      },
    });

    // A partir de aquí el dinero YA salió: nada de lo que sigue puede lanzar,
    // o el panel mostraría un error sobre un reembolso que sí se hizo. Se
    // registra el fallo y el webhook charge.refunded acaba de cuadrarlo.
    const acumuladoCents = yaCents + importeCents;
    const esTotal = acumuladoCents >= totalCents;
    let stockRepuesto = false;

    if (esTotal) {
      stockRepuesto = await this.marcarReembolsadoYReponerStock(pedidoId);
    }

    try {
      await this.inventario.registrarTransaccion(
        pedidoId,
        "stripe",
        refund.id,
        "reembolso.backoffice",
        esTotal ? "reembolsado" : "reembolsado_parcial",
        acumuladoCents / 100,
        { refund: refund as unknown as object, motivo: dto.motivo, solicitado_por: solicitadoPor },
      );
    } catch (err) {
      this.logger.error(
        `Reembolso ${refund.id} cobrado en Stripe pero no registrado (pedido ${pedidoId}): ${(err as Error).message}`,
      );
    }

    // Sin await: SMTP tarda segundos y el panel no debe esperarlos.
    void this.avisarCliente(pedidoId, acumuladoCents / 100);

    this.logger.log(
      `Reembolso de ${(importeCents / 100).toFixed(2)} € en pedido ${pedido.numero_pedido ?? pedidoId} por ${solicitadoPor} (acumulado ${(acumuladoCents / 100).toFixed(2)} €${esTotal ? ", total" : ", parcial"})`,
    );

    return {
      pedido_id: pedidoId,
      importe: importeCents / 100,
      total_reembolsado: acumuladoCents / 100,
      es_total: esTotal,
      estado: esTotal ? "REEMBOLSADO" : pedido.estado,
      stock_repuesto: stockRepuesto,
    };
  }

  /**
   * Marca REEMBOLSADO y repone stock en una sola transacción (migración 037).
   * Devuelve si actuó: `false` significa que ya estaba reembolsado, no un fallo.
   */
  async marcarReembolsadoYReponerStock(pedidoId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("reembolsar_pedido_total", {
      p_pedido_id: pedidoId,
    });

    if (error) {
      this.logger.error(
        `No se pudo marcar REEMBOLSADO el pedido ${pedidoId}: ${error.message}. ` +
          "El dinero sí se devolvió; el webhook charge.refunded lo reintentará.",
      );
      return false;
    }

    return data === true;
  }

  private async cargarPedido(pedidoId: string): Promise<PedidoParaReembolso> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("id, estado, total, metodo_pago, referencia_pago, numero_pedido")
      .eq("id", pedidoId)
      .maybeSingle();

    if (error || !data) throw new NotFoundException("Pedido no encontrado");
    return data as PedidoParaReembolso;
  }

  /** Email de devolución, con el importe. Nunca propaga: el dinero ya salió. */
  private async avisarCliente(pedidoId: string, importeAcumulado: number): Promise<void> {
    try {
      const pedido = await this.inventario.getPedidoConItems(pedidoId);
      if (!pedido?.email_cliente) return;

      await this.email.enviarReembolso({
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
        esReembolso: true,
        importeReembolsado: importeAcumulado,
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar del reembolso al cliente (pedido ${pedidoId}): ${(err as Error).message}`,
      );
    }
  }
}
