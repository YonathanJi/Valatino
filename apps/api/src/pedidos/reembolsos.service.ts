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
  /** El porte cobrado, que está DENTRO de `total` (080). 0 si no se cobró. */
  coste_envio: number | null;
  /**
   * En qué reembolso se devolvió ya el porte, o `null` si todavía no se ha
   * devuelto (080).
   *
   * ⚠️⚠️ ES EL GUARDIA CONTRA DEVOLVER EL PORTE DOS VECES, y se lee aquí para
   * poder negarse ANTES de mandar dinero a Stripe. La base tiene el suyo —el
   * `where envio_devuelto_en_refund is null` de la 084— pero ese llega tarde: si
   * solo estuviera ahí, el porte se le habría cobrado ya al negocio y la RPC se
   * limitaría a no apuntarlo, dejando dinero fuera sin rectificativa que lo
   * declare. Los dos hacen falta: este para no cobrar, y el de la base para que
   * dos peticiones simultáneas no se cuelen las dos.
   */
  envio_devuelto_en_refund: string | null;
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
    // ⚠️ `importeCents` ya NO se acumula en el bucle: lo da la base al final. Ver el
    // comentario de la llamada a `importe_a_devolver` más abajo.
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

      unidades += pedida.cantidad;
      lineas.push({ pedido_item_id: item.id, cantidad: pedida.cantidad });
      resumen.push(`${pedida.cantidad} × ${item.nombre_producto}`);
    }

    if (!lineas.length) {
      throw new BadRequestException("Elige al menos una unidad para devolver");
    }

    /**
     * ⚠️⚠️ EL DINERO NO SE CALCULA AQUÍ: LO DA LA BASE. Aquí había
     * `pedida.cantidad * cents(item.precio_unitario)`, o sea PVP DE CATÁLOGO. Con un
     * cupón (083) eso devuelve MÁS de lo que el cliente pagó, y no es un descuadre de
     * informe: es dinero real saliendo por la pasarela. Art. 107 RDL 1/2007 obliga a
     * devolver «todos los pagos recibidos», que con cupón es lo efectivamente
     * cobrado.
     *
     * ⭐ `importe_a_devolver` (083 §6) es el ÚNICO sitio que sabe valorar una
     * devolución, y de ahí leen también los dos escritores de `reembolso_lineas`. Si
     * esto lo calculara aparte, la ficha del cliente y el documento fiscal se
     * contradirían sobre el mismo dinero: la lección de la 074.
     *
     * ⭐ Y SIGUE SIENDO CIERTO QUE EL PRECIO NO VIENE DEL NAVEGADOR. El panel manda
     * qué línea y cuántas unidades; lo que valen lo dice la base. Solo cambia QUIÉN
     * lo calcula, no de dónde sale.
     *
     * ⚠️⚠️ NO HAY FALLBACK AL BRUTO, y es deliberado. Si la RPC falla, el panel no
     * devuelve. El signo del fallo se razona, no se hereda: en `costeEnvio` el fallo
     * barato es dejar de cobrar un porte y se cae a 0, pero aquí caer al bruto sería
     * devolver de más con el dinero ya fuera. Un fallo de la base que bloquea las
     * devoluciones es el comportamiento correcto.
     */
    const { data: valorado, error: errValor } = await this.supabase.rpc("importe_a_devolver", {
      p_pedido_id: pedidoId,
      p_lineas: lineas,
    });

    if (errValor || !valorado) {
      throw new InternalServerErrorException(
        "No se pudo calcular el importe a devolver. No se devuelve nada hasta saber cuánto.",
      );
    }

    // Entero por entero: sumar euros en coma flotante y redondear después arrastra
    // el error de 0,1 × 3 = 0,30000000000000004.
    const importeCents = (valorado as { importe: string | number }[]).reduce(
      (a, f) => a + cents(Number(f.importe)),
      0,
    );

    /**
     * ⚠️ Con netos esto ya no significa «no has elegido nada» —eso lo caza el
     * `lineas.length` de arriba— sino que lo elegido no vale nada: un cupón que
     * cubrió esas unidades por completo. Stripe no acepta un reembolso de 0, así que
     * hay que decirlo, y decir POR QUÉ.
     */
    if (importeCents <= 0) {
      throw new BadRequestException(
        "Esas unidades no tienen importe que devolver: el descuento del pedido las cubrió por completo",
      );
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

    /**
     * ⚠️ El porte no se suma a un importe escrito a mano (084). Quien teclea una
     * cifra ya está diciendo el total que quiere devolver, y añadirle el porte
     * encima cobraría de más sin que lo hubiera pedido nadie. Con artículos sí se
     * combina, porque ahí el importe lo calcula el servidor.
     */
    if (dto.devolver_envio && dto.importe !== undefined) {
      throw new BadRequestException(
        "Con un importe escrito a mano no se puede marcar además el envío: incluye en el importe lo que quieras devolver, porte incluido",
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

    /**
     * ⬇️ EL PORTE (084). Los dos «no» van ANTES de Stripe, que es lo que importa:
     * negarse cuando el dinero ya ha salido no sirve de nada.
     *
     * ⚠️ El segundo es el guardia contra devolverlo dos veces. La base tiene el
     * suyo —`envio_devuelto_en_refund is null`— pero ese solo evita apuntarlo mal;
     * el cobro ya se habría hecho. Ver `PedidoParaReembolso.envio_devuelto_en_refund`.
     */
    const devolverEnvio = dto.devolver_envio === true;
    const envioCents = devolverEnvio ? cents(Number(pedido.coste_envio ?? 0)) : 0;

    if (devolverEnvio) {
      if (envioCents <= 0) {
        throw new BadRequestException(
          "Este pedido no pagó gastos de envío, así que no hay porte que devolver",
        );
      }
      if (pedido.envio_devuelto_en_refund) {
        throw new ConflictException(
          "Los gastos de envío de este pedido ya se devolvieron en una devolución anterior",
        );
      }
    }

    // Cuatro formas de decir cuánto, por orden de precisión:
    //   · artículos elegidos → lo dicen los precios de `pedido_items`
    //   · un importe suelto  → lo dice quien lo escribe
    //   · solo el porte      → lo dice `pedidos.coste_envio` (084)
    //   · nada               → todo lo que quede pendiente
    //
    // ⚠️ El porte se SUMA a los artículos cuando van juntos, y es la única
    // combinación posible: con `importe` está prohibido más arriba, y «nada» ya
    // devuelve el pedido entero con el porte dentro.
    const seleccion = dto.lineas ? await this.validarSeleccion(pedidoId, dto.lineas) : null;
    const importeCents = seleccion
      ? seleccion.importeCents + envioCents
      : dto.importe !== undefined
        ? cents(dto.importe)
        : devolverEnvio
          ? envioCents
          : restanteCents;

    if (importeCents > restanteCents) {
      throw new BadRequestException(
        seleccion
          ? `Esos artículos${devolverEnvio ? " y el envío" : ""} suman ${(importeCents / 100).toFixed(2)} € y de este pedido solo quedan ${(restanteCents / 100).toFixed(2)} € por devolver`
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
      // ⚠️ El `:envio` no es redundante aunque el porte ya cambie `importeCents`:
      // devolver un artículo de 3,40 € y devolver un porte de 3,40 € sobre el mismo
      // punto de partida darían la MISMA clave, y Stripe reutilizaría el primer
      // reembolso sin cobrar el segundo — con el panel diciendo que sí se cobró.
      // Es el mismo razonamiento que la huella de las líneas de aquí al lado.
      idempotencyKey: `reembolso:${pedidoId}:${yaCents}:${importeCents}${
        seleccion ? `:${huellaLineas(seleccion.lineas)}` : ""
      }${devolverEnvio ? ":envio" : ""}`,
      metadata: {
        pedido_id: pedidoId,
        numero_pedido: pedido.numero_pedido ?? "",
        solicitado_por: solicitadoPor,
        ...(seleccion ? { articulos: seleccion.resumen.slice(0, 500) } : {}),
        ...(devolverEnvio ? { envio_devuelto: (envioCents / 100).toFixed(2) } : {}),
        ...(dto.motivo ? { motivo: dto.motivo } : {}),
      },
    });

    // A partir de aquí el dinero YA salió: nada de lo que sigue puede lanzar,
    // o el panel mostraría un error sobre un reembolso que sí se hizo. Se
    // registra el fallo y el webhook charge.refunded acaba de cuadrarlo.
    const acumuladoCents = yaCents + importeCents;
    const esTotal = acumuladoCents >= totalCents;
    let stockRepuesto = false;

    let envioDevuelto = false;

    if (seleccion || devolverEnvio) {
      /**
       * Las líneas y el cierre del pedido van en la misma llamada, y por dentro
       * en la misma transacción y en este orden. Si se marcara REEMBOLSADO
       * antes de apuntar las líneas, `reembolsar_pedido_total` no las vería y
       * repondría su stock por segunda vez. Ver el apartado 2 de la 044.
       *
       * ⚠️⚠️ Y EL PORTE VA POR AQUÍ TAMBIÉN, INCLUSO SIN ARTÍCULOS (084), y no por
       * una llamada aparte. El motivo está en la cabecera de la migración y es la
       * decisión de diseño de todo esto: el trigger que emite la rectificativa es
       * DIFERIDO, así que el sellado del porte tiene que ocurrir en la MISMA
       * transacción que las líneas y antes de que el trigger corra. Una segunda
       * llamada llegaría tarde y la rectificativa saldría sin la línea del envío
       * — con el dinero ya devuelto y sin documento que lo declare.
       */
      const resultado = await this.registrarLineas(
        pedidoId,
        seleccion,
        dto.reponer_stock ?? false,
        refund.id,
        esTotal,
        devolverEnvio,
        actorId,
      );
      stockRepuesto = resultado.repuesto;
      envioDevuelto = resultado.envioDevuelto;
    } else if (esTotal) {
      const cerro = await this.marcarReembolsadoYReponerStock(pedidoId, actorId);
      stockRepuesto = cerro;
      /**
       * El cierre devuelve el porte él solo, si el pedido lo llevaba y no estaba ya
       * devuelto: lo hace `reembolsar_pedido_total` desde la 080. Aquí solo se
       * refleja para poder contarlo en pantalla.
       *
       * ⚠️ Y va condicionado a que la RPC **haya actuado**. `cerro = false` significa
       * que el pedido ya estaba REEMBOLSADO —el webhook llegó primero— y entonces el
       * porte lo devolvió ese otro camino, no este. Decir que fue este haría que el
       * panel anunciara «incluye 3,40 € de envío» sobre una devolución que no lo
       * incluía.
       */
      envioDevuelto =
        cerro && Number(pedido.coste_envio ?? 0) > 0 && !pedido.envio_devuelto_en_refund;
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
          // la caja de galletas». Y con el porte lo dice también, que si no la
          // ficha enseña un importe mayor que la suma de los artículos y parece
          // un error de cálculo.
          ...(seleccion || devolverEnvio
            ? {
                detalle: `reembolso.backoffice · ${[
                  seleccion?.resumen,
                  devolverEnvio ? `envío ${(envioCents / 100).toFixed(2)} €` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}`,
              }
            : {}),
          /**
           * ⚠️⚠️ LO DEVUELTO AHORA, no el acumulado que va a la transacción. La
           * transacción lleva el acumulado a propósito (`totalesReembolsados`
           * saca el total tomando el máximo de esa columna); la línea de tiempo
           * cuenta lo que acaba de pasar.
           *
           * El caso real que lo destapó, del 2026-08-14: una segunda devolución
           * de 2,40 € sobre un pedido que ya llevaba 0,62 € escribió «Devolución
           * de 3,02 € · 3 × Galleta Festival Sabor Chocolate». Las tres galletas
           * costaban 2,40 €, y su propia factura rectificativa decía −2,40 €. La
           * ficha y el documento fiscal se contradecían sobre el mismo dinero.
           */
          importe: importeCents / 100,
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
      `Reembolso de ${(importeCents / 100).toFixed(2)} € en pedido ${pedido.numero_pedido ?? pedidoId} por ${solicitadoPor} (acumulado ${(acumuladoCents / 100).toFixed(2)} €${esTotal ? ", total" : ", parcial"}${envioDevuelto ? `, incluye ${(envioCents / 100).toFixed(2)} € de envío` : ""})`,
    );

    return {
      pedido_id: pedidoId,
      importe: importeCents / 100,
      total_reembolsado: acumuladoCents / 100,
      es_total: esTotal,
      estado: esTotal ? "REEMBOLSADO" : pedido.estado,
      stock_repuesto: stockRepuesto,
      ...(seleccion ? { unidades_devueltas: seleccion.unidades } : {}),
      // Solo cuando de verdad se devolvió: `envioDevuelto` sale de lo que dijo la
      // base, no de lo que se pidió. Ver el aviso de `registrarLineas`.
      ...(envioDevuelto ? { envio_devuelto: true } : {}),
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
    /** `null` cuando la devolución es SOLO del porte y no hay artículos (084). */
    seleccion: SeleccionValidada | null,
    reponerStock: boolean,
    refundId: string,
    marcarTotal: boolean,
    devolverEnvio: boolean,
    actorId?: string,
  ): Promise<{ repuesto: boolean; envioDevuelto: boolean }> {
    const { data, error } = await this.supabase.rpc("registrar_reembolso_lineas", {
      p_pedido_id: pedidoId,
      // Array vacío y no `null` en la devolución de solo porte: la RPC ya hace
      // `coalesce(p_lineas, '[]')`, pero mandarlo explícito dice que no hay
      // artículos a propósito, no que se nos olvidaron.
      p_lineas: seleccion?.lineas ?? [],
      p_reponer_stock: reponerStock,
      p_refund_id: refundId,
      p_marcar_total: marcarTotal,
      p_actor_id: actorId ?? null,
      p_devolver_envio: devolverEnvio,
    });

    if (error) {
      this.logger.error(
        `Reembolso ${refundId} cobrado pero no se apuntó (pedido ${pedidoId}): ${error.message}. ` +
          "El dinero sí se devolvió; el stock de esas unidades habrá que ajustarlo desde Inventario" +
          (devolverEnvio
            ? ", y el porte se cobró SIN sellar: revisa si falta su rectificativa."
            : "."),
      );
      return { repuesto: false, envioDevuelto: false };
    }

    const r = (data ?? {}) as {
      registradas?: number;
      pedidas?: number;
      importe?: number | string;
      repuesto?: boolean;
      envio_devuelto?: boolean;
    };

    // La RPC recorta a lo que de verdad quedaba en vez de abortar (el dinero ya
    // salió). Que recorte significa que se ha cobrado más de lo que consta
    // devuelto en artículos, y eso hay que poder verlo sin adivinarlo.
    if (seleccion && (r.registradas ?? 0) < (r.pedidas ?? 0)) {
      this.logger.error(
        `Reembolso ${refundId}: se cobraron ${(seleccion.importeCents / 100).toFixed(2)} € ` +
          `pero solo se apuntaron ${Number(r.importe ?? 0).toFixed(2)} € en artículos ` +
          `(${r.registradas ?? 0} de ${r.pedidas ?? 0} líneas, pedido ${pedidoId}). ` +
          "Otra devolución se llevó esas unidades mientras esta iba a Stripe.",
      );
    }

    /**
     * ⚠️⚠️ SE PIDIÓ DEVOLVER EL PORTE Y LA BASE DICE QUE NO LO SELLÓ ELLA. Solo
     * puede pasar por una cosa: otra devolución se lo llevó entre la comprobación
     * de `reembolsar` y esta llamada, y el `where envio_devuelto_en_refund is null`
     * de la 084 hizo su trabajo. Eso significa que el porte se ha COBRADO DOS
     * VECES —una por cada petición— y solo una tiene rectificativa.
     *
     * No se puede arreglar aquí (el dinero ya salió las dos veces), pero tiene que
     * salir en el log como lo que es: dinero de más fuera de la caja. Se revisa
     * contra Stripe y se corrige con un cargo o dejándolo como atención al cliente.
     */
    if (devolverEnvio && r.envio_devuelto !== true) {
      this.logger.error(
        `Reembolso ${refundId}: se cobró el porte del pedido ${pedidoId} pero la base no lo selló ` +
          "porque ya estaba devuelto. Dos devoluciones simultáneas se lo han llevado las dos: " +
          "hay un porte cobrado de más y sin rectificativa. Revisar en Stripe.",
      );
    }

    return { repuesto: r.repuesto === true, envioDevuelto: r.envio_devuelto === true };
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
      .select(
        "id, estado, total, metodo_pago, referencia_pago, numero_pedido, coste_envio, envio_devuelto_en_refund",
      )
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
        /**
         * ⚠️ ESTAS DOS FALTABAN TAMBIÉN AQUÍ, y no solo en la confirmación. El
         * correo de devolución pinta las mismas líneas y el mismo «Total», así que
         * arrastraba el mismo descuadre: el porte desde la 080 y el descuento
         * desde la 083. Y en este correo duele más, porque es el que se lee con la
         * calculadora en la mano para comprobar si lo devuelto es lo que toca.
         */
        costeEnvio: Number(pedido.coste_envio ?? 0),
        descuento: Number(pedido.descuento ?? 0),
        descuentoCodigo: pedido.descuento_codigo,
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
