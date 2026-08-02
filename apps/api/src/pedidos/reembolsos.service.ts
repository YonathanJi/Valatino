import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { StripeService } from "../pagos/stripe.service";
import { InventarioService } from "../inventario/inventario.service";
import { EmailService } from "../email/email.service";
import { createHash } from "node:crypto";
import { ESTADOS_REEMBOLSABLES } from "@valatino/types";
import type {
  ArticuloDevuelto,
  LineaReembolso,
  PedidoEstado,
  ReembolsoLinea,
  ResultadoReembolso,
} from "@valatino/types";
import type { CrearReembolsoDto, LineaReembolsoDto } from "./dto/crear-reembolso.dto";

/**
 * Estados de transacciones_pago que representan dinero devuelto.
 * Ver la nota sobre importes acumulados en `totalesReembolsados`.
 */
const ESTADOS_REEMBOLSO = ["reembolsado", "reembolsado_parcial"];

/** Redondeo a céntimos: comparar euros en coma flotante da falsos negativos. */
const cents = (n: number): number => Math.round(n * 100);

/**
 * Huella corta de una selección de artículos, para la clave de idempotencia de
 * Stripe. Se ordena antes de resumir: el mismo conjunto de líneas en distinto
 * orden es la misma devolución y debe dar la misma clave.
 */
function huellaLineas(lineas: LineaReembolso[]): string {
  const canonico = lineas
    .map((l) => `${l.pedido_item_id}:${l.cantidad}`)
    .sort()
    .join("|");
  return createHash("sha1").update(canonico).digest("hex").slice(0, 12);
}

interface PedidoParaReembolso {
  id: string;
  estado: PedidoEstado;
  total: number;
  metodo_pago: string;
  referencia_pago: string | null;
  numero_pedido: string | null;
}

interface ItemDelPedido {
  id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

/** Una selección de artículos ya contrastada contra lo que consta comprado. */
interface SeleccionValidada {
  lineas: LineaReembolso[];
  importeCents: number;
  unidades: number;
  /** «1 × Galleta Limón, 2 × Pony Malta», para el historial y para Stripe. */
  resumen: string;
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

  /**
   * Los artículos ya devueltos de un pedido. La ficha los usa para mostrar qué
   * se devolvió y el panel para no volver a ofrecer lo que ya no queda.
   */
  async lineasDevueltas(pedidoId: string): Promise<ReembolsoLinea[]> {
    const { data, error } = await this.supabase
      .from("reembolso_lineas")
      .select("pedido_item_id, cantidad, importe, repuesto_al_stock, created_at")
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: true });

    if (error) {
      this.logger.error(`No se pudieron leer los artículos devueltos: ${error.message}`);
      return [];
    }

    return ((data ?? []) as ReembolsoLinea[]).map((l) => ({
      ...l,
      importe: Number(l.importe),
    }));
  }

  /**
   * Los artículos devueltos de varios pedidos, con el nombre del producto y
   * **solo lo que se le puede enseñar al cliente**.
   *
   * Aquí se elige campo a campo en vez de devolver la fila entera: la tabla
   * guarda además si la mercancía volvió al almacén, quién tramitó la
   * devolución y el identificador del cobro en Stripe. Nada de eso es asunto de
   * quien compró, y un `select("*")` lo publicaría el día que se añada una
   * columna nueva.
   */
  async articulosDevueltos(pedidoIds: string[]): Promise<Map<string, ArticuloDevuelto[]>> {
    const porPedido = new Map<string, ArticuloDevuelto[]>();
    if (pedidoIds.length === 0) return porPedido;

    const { data, error } = await this.supabase
      .from("reembolso_lineas")
      .select("pedido_id, cantidad, importe, created_at, pedido_items(nombre_producto)")
      .in("pedido_id", pedidoIds)
      .order("created_at", { ascending: true });

    if (error) {
      this.logger.error(`No se pudieron leer los artículos devueltos: ${error.message}`);
      return porPedido;
    }

    for (const fila of (data ?? []) as Array<{
      pedido_id: string;
      cantidad: number;
      importe: string | number;
      created_at: string;
      // PostgREST devuelve objeto con !inner y array sin él, según la relación.
      pedido_items: { nombre_producto: string } | { nombre_producto: string }[] | null;
    }>) {
      const rel = Array.isArray(fila.pedido_items) ? fila.pedido_items[0] : fila.pedido_items;
      const lista = porPedido.get(fila.pedido_id) ?? [];
      lista.push({
        // El artículo pudo borrarse del catálogo; el pedido conserva su nombre,
        // pero si aun así falta es mejor una etiqueta neutra que un hueco.
        nombre_producto: rel?.nombre_producto ?? "Artículo del pedido",
        cantidad: fila.cantidad,
        importe: Number(fila.importe),
        fecha: fila.created_at,
      });
      porPedido.set(fila.pedido_id, lista);
    }

    return porPedido;
  }

  /**
   * Contrasta los artículos elegidos contra lo que consta comprado y lo ya
   * devuelto, y calcula el dinero.
   *
   * **El precio sale de aquí, nunca del navegador.** El panel manda qué línea y
   * cuántas unidades; lo que vale cada una lo dice `pedido_items`, que es lo que
   * se cobró. Lo mismo hace la RPC al registrar, así que un intento de colar un
   * importe propio no tiene por dónde entrar.
   */
  private async validarSeleccion(
    pedidoId: string,
    pedidas: LineaReembolsoDto[],
  ): Promise<SeleccionValidada> {
    const { data, error } = await this.supabase
      .from("pedido_items")
      .select("id, nombre_producto, cantidad, precio_unitario")
      .eq("pedido_id", pedidoId);

    if (error) {
      throw new InternalServerErrorException("No se pudieron leer los artículos del pedido");
    }

    const items = new Map(
      ((data ?? []) as ItemDelPedido[]).map((i) => [i.id, i]),
    );
    const yaDevuelto = new Map<string, number>();
    for (const l of await this.lineasDevueltas(pedidoId)) {
      yaDevuelto.set(l.pedido_item_id, (yaDevuelto.get(l.pedido_item_id) ?? 0) + l.cantidad);
    }

    const vistas = new Set<string>();
    const lineas: LineaReembolso[] = [];
    const resumen: string[] = [];
    let importeCents = 0;
    let unidades = 0;

    for (const pedida of pedidas) {
      const item = items.get(pedida.pedido_item_id);
      // Acotado al pedido en la consulta de arriba, así que "no está" incluye
      // "es de otro pedido". No se distingue a propósito: quien lo intenta no
      // tiene por qué averiguar si ese identificador existe en otra parte.
      if (!item) {
        throw new BadRequestException("Alguno de los artículos no es de este pedido");
      }

      if (vistas.has(item.id)) {
        throw new BadRequestException(
          `«${item.nombre_producto}» viene repetido: indica sus unidades en una sola línea`,
        );
      }
      vistas.add(item.id);

      const disponibles = item.cantidad - (yaDevuelto.get(item.id) ?? 0);
      if (pedida.cantidad > disponibles) {
        throw new BadRequestException(
          disponibles <= 0
            ? `«${item.nombre_producto}» ya se devolvió por completo`
            : `De «${item.nombre_producto}» solo ${disponibles === 1 ? "queda 1 unidad" : `quedan ${disponibles} unidades`} por devolver`,
        );
      }

      // Entero por entero: multiplicar euros en coma flotante y redondear
      // después arrastra el error de 0,1 × 3 = 0,30000000000000004.
      importeCents += pedida.cantidad * cents(Number(item.precio_unitario));
      unidades += pedida.cantidad;
      lineas.push({ pedido_item_id: item.id, cantidad: pedida.cantidad });
      resumen.push(`${pedida.cantidad} × ${item.nombre_producto}`);
    }

    if (importeCents <= 0) {
      throw new BadRequestException("Elige al menos una unidad para devolver");
    }

    return { lineas, importeCents, unidades, resumen: resumen.join(", ") };
  }

  async reembolsar(
    pedidoId: string,
    dto: CrearReembolsoDto,
    solicitadoPor: string,
    /** Id de quien lo pide, para que su nombre quede en el historial. */
    actorId?: string,
  ): Promise<ResultadoReembolso> {
    if (dto.lineas && dto.importe !== undefined) {
      throw new BadRequestException(
        "Indica artículos o un importe, no las dos cosas: el importe de los artículos lo calcula el servidor",
      );
    }

    const pedido = await this.cargarPedido(pedidoId);

    if (!ESTADOS_REEMBOLSABLES.includes(pedido.estado)) {
      throw new BadRequestException(
        pedido.estado === "REEMBOLSADO"
          ? "Este pedido ya está reembolsado por completo"
          : `Un pedido en estado ${pedido.estado} no tiene un cobro que devolver`,
      );
    }

    if (pedido.metodo_pago === "transferencia") {
      // El dinero nunca pasó por Stripe, así que no hay nada que devolver por
      // aquí. Decirlo explícito importa: si cayera en el mensaje de PayPal, se
      // mandaría a alguien a buscar el cobro a un panel donde no está.
      throw new BadRequestException(
        "Este pedido se pagó por transferencia: la devolución hay que hacerla desde el banco, " +
          "a la cuenta desde la que llegó el ingreso. Cuando la hagas, cancela el pedido para " +
          "que sus unidades vuelvan al inventario.",
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

    // Tres formas de decir cuánto, por orden de precisión:
    //   · artículos elegidos → lo dicen los precios de `pedido_items`
    //   · un importe suelto  → lo dice quien lo escribe
    //   · nada               → todo lo que quede pendiente
    const seleccion = dto.lineas ? await this.validarSeleccion(pedidoId, dto.lineas) : null;
    const importeCents = seleccion
      ? seleccion.importeCents
      : dto.importe === undefined
        ? restanteCents
        : cents(dto.importe);

    if (importeCents > restanteCents) {
      throw new BadRequestException(
        seleccion
          ? `Esos artículos suman ${(importeCents / 100).toFixed(2)} € y de este pedido solo quedan ${(restanteCents / 100).toFixed(2)} € por devolver`
          : `Solo quedan ${(restanteCents / 100).toFixed(2)} € por devolver de este pedido`,
      );
    }

    const refund = await this.stripe.crearReembolso({
      paymentIntentId: pedido.referencia_pago,
      importeCents,
      // Mismo pedido + mismo punto de partida + mismo importe = misma clave, así
      // que un doble clic reutiliza el reembolso en vez de duplicarlo. Dos
      // devoluciones parciales iguales pero consecutivas sí se cobran las dos,
      // porque la segunda arranca con otro `yaCents`.
      //
      // Con artículos hace falta además QUÉ artículos: dos líneas distintas del
      // mismo pedido pueden costar lo mismo, y sin esto devolver la primera y
      // luego la segunda daría la misma clave — Stripe devolvería el refund de
      // la primera sin cobrar nada, y el panel diría que la segunda se devolvió.
      idempotencyKey: `reembolso:${pedidoId}:${yaCents}:${importeCents}${
        seleccion ? `:${huellaLineas(seleccion.lineas)}` : ""
      }`,
      metadata: {
        pedido_id: pedidoId,
        numero_pedido: pedido.numero_pedido ?? "",
        solicitado_por: solicitadoPor,
        ...(seleccion ? { articulos: seleccion.resumen.slice(0, 500) } : {}),
        ...(dto.motivo ? { motivo: dto.motivo } : {}),
      },
    });

    // A partir de aquí el dinero YA salió: nada de lo que sigue puede lanzar,
    // o el panel mostraría un error sobre un reembolso que sí se hizo. Se
    // registra el fallo y el webhook charge.refunded acaba de cuadrarlo.
    const acumuladoCents = yaCents + importeCents;
    const esTotal = acumuladoCents >= totalCents;
    let stockRepuesto = false;

    if (seleccion) {
      // Las líneas y el cierre del pedido van en la misma llamada, y por dentro
      // en la misma transacción y en este orden. Si se marcara REEMBOLSADO
      // antes de apuntar las líneas, `reembolsar_pedido_total` no las vería y
      // repondría su stock por segunda vez. Ver el apartado 2 de la 044.
      stockRepuesto = await this.registrarLineas(
        pedidoId,
        seleccion,
        dto.reponer_stock ?? false,
        refund.id,
        esTotal,
        actorId,
      );
    } else if (esTotal) {
      stockRepuesto = await this.marcarReembolsadoYReponerStock(pedidoId, actorId);
    }

    try {
      await this.inventario.registrarTransaccion(
        pedidoId,
        "stripe",
        refund.id,
        "reembolso.backoffice",
        esTotal ? "reembolsado" : "reembolsado_parcial",
        acumuladoCents / 100,
        {
          refund: refund as unknown as object,
          motivo: dto.motivo,
          solicitado_por: solicitadoPor,
          ...(seleccion ? { articulos: seleccion.resumen } : {}),
        },
        {
          tipo: "reembolso",
          actorId,
          origen: "panel",
          // Con artículos, la línea de tiempo dice cuáles en vez de solo el
          // importe: es la diferencia entre «se devolvieron 4 €» y «se devolvió
          // la caja de galletas».
          ...(seleccion ? { detalle: `reembolso.backoffice · ${seleccion.resumen}` } : {}),
        },
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
      ...(seleccion ? { unidades_devueltas: seleccion.unidades } : {}),
    };
  }

  /**
   * Apunta qué artículos se devolvieron y, si el reembolso completa el pedido,
   * lo cierra — todo en una transacción. Devuelve si volvieron unidades al
   * inventario.
   *
   * Nunca lanza: se llama con el dinero ya salido de Stripe, y dejar caer aquí
   * convertiría una devolución hecha en un error en pantalla.
   */
  private async registrarLineas(
    pedidoId: string,
    seleccion: SeleccionValidada,
    reponerStock: boolean,
    refundId: string,
    marcarTotal: boolean,
    actorId?: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("registrar_reembolso_lineas", {
      p_pedido_id: pedidoId,
      p_lineas: seleccion.lineas,
      p_reponer_stock: reponerStock,
      p_refund_id: refundId,
      p_marcar_total: marcarTotal,
      p_actor_id: actorId ?? null,
    });

    if (error) {
      this.logger.error(
        `Reembolso ${refundId} cobrado pero sus artículos no se apuntaron (pedido ${pedidoId}): ${error.message}. ` +
          "El dinero sí se devolvió; el stock de esas unidades habrá que ajustarlo desde Inventario.",
      );
      return false;
    }

    const r = (data ?? {}) as {
      registradas?: number;
      pedidas?: number;
      importe?: number | string;
      repuesto?: boolean;
    };

    // La RPC recorta a lo que de verdad quedaba en vez de abortar (el dinero ya
    // salió). Que recorte significa que se ha cobrado más de lo que consta
    // devuelto en artículos, y eso hay que poder verlo sin adivinarlo.
    if ((r.registradas ?? 0) < (r.pedidas ?? 0)) {
      this.logger.error(
        `Reembolso ${refundId}: se cobraron ${(seleccion.importeCents / 100).toFixed(2)} € ` +
          `pero solo se apuntaron ${Number(r.importe ?? 0).toFixed(2)} € en artículos ` +
          `(${r.registradas ?? 0} de ${r.pedidas ?? 0} líneas, pedido ${pedidoId}). ` +
          "Otra devolución se llevó esas unidades mientras esta iba a Stripe.",
      );
    }

    return r.repuesto === true;
  }

  /**
   * Marca REEMBOLSADO y repone stock en una sola transacción (migración 037).
   * Devuelve si actuó: `false` significa que ya estaba reembolsado, no un fallo.
   */
  async marcarReembolsadoYReponerStock(pedidoId: string, actorId?: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("reembolsar_pedido_total", {
      p_pedido_id: pedidoId,
      // Sin actor cuando llega por el webhook: el historial lo dirá así.
      p_actor_id: actorId ?? null,
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
