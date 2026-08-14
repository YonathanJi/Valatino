import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { esMensajeParaElUsuario } from "../common/errores/rpc";
import { ubicacionParaGuardar } from "../common/datos/ubicacion";
import { normalizarNif } from "@valatino/types";
import type {
  AjustesEmisor,
  CadenaFacturas,
  FacturaDelLibro,
  FacturaEmitida,
  LiquidacionIva,
  PedidoFacturable,
  ReceptorFactura,
  ResultadoEmitirPendientes,
} from "@valatino/types";

/** Lo que llega del formulario de Ajustes, en camelCase como el resto de DTO. */
export interface GuardarEmisorDatos {
  nif: string;
  nombre: string;
  direccion: string;
  codigoPostal: string;
  ciudad: string;
  provincia?: string;
}

/**
 * Tope del periodo consultable, en días.
 *
 * No es una restricción fiscal —se puede querer mirar dos ejercicios seguidos—
 * sino un freno: la RPC recorre pedidos, líneas de reembolso y líneas de compra
 * sin paginar, y un rango de veinte años sobre una base grande es una consulta
 * que nadie ha pedido a propósito. Cinco años cubre cualquier revisión real
 * (Hacienda mira cuatro) y deja el error accionable.
 */
const MAX_DIAS_PERIODO = 366 * 5;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Una fecha `YYYY-MM-DD` como instante de medianoche UTC, o `null` si ese día no
 * existe.
 *
 * ⚠️ `Date.parse("2026-02-31T00:00:00Z")` **no** da NaN: V8 lo rueda al 3 de
 * marzo y devuelve un número perfectamente válido. Así que un periodo mal
 * teclado se aceptaría en silencio con otras fechas, y el informe saldría de un
 * trimestre que nadie pidió. La única comprobación que sirve es el viaje de ida
 * y vuelta: construir la fecha y ver si sus componentes son los que se pasaron.
 *
 * Y en UTC, no en hora local: así la resta entre dos fechas es exacta y no la
 * mueven los cambios de horario de verano de por medio.
 */
function mediaNocheUtc(iso: string): number | null {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }

  return fecha.getTime();
}

@Injectable()
export class ContabilidadService {
  private readonly logger = new Logger(ContabilidadService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Modelo 303 del periodo: devengado, rectificado por devoluciones, deducible y
   * la diferencia, más los avisos de lo que el informe NO está contando.
   *
   * Todo el cálculo vive en la RPC `liquidacion_iva` (migración 068) y no aquí,
   * por lo mismo que el resto del dinero: la regla de redondeo y el criterio de
   * fecha tienen que estar en UN sitio, y ese sitio es el que también alcanzan
   * el editor SQL y cualquier consulta que se escriba mañana.
   */
  async liquidacionIva(desde: string, hasta: string): Promise<LiquidacionIva> {
    this.validarPeriodo(desde, hasta);

    const { data, error } = await this.supabase.rpc("liquidacion_iva", {
      p_desde: desde,
      p_hasta: hasta,
    });

    if (error) {
      this.logger.error(`Error al calcular la liquidación de IVA: ${error.message}`);
      // Los mensajes de la RPC (periodo al revés, fechas ausentes) son
      // accionables; los del motor no, y hasta ahora en otros módulos salían
      // igual. Mismo criterio que ComprasService.
      if (!esMensajeParaElUsuario(error)) {
        throw new UnprocessableEntityException("No se pudo calcular la liquidación de IVA");
      }
      throw new BadRequestException(error.message);
    }

    return data as LiquidacionIva;
  }

  /**
   * Corrige la fecha de expedición de una factura de compra ya registrada.
   *
   * No toca nada más de la factura: el número es único (054), el total sale de
   * las líneas y las líneas movieron stock. Eso sí sería reescribir la historia.
   */
  async fijarFechaFacturaCompra(facturaId: string, fechaFactura: string): Promise<void> {
    const { error } = await this.supabase.rpc("fijar_fecha_factura_compra", {
      p_factura_id: facturaId,
      p_fecha_factura: fechaFactura,
    });

    if (error) {
      this.logger.error(`Error al fijar la fecha de la factura ${facturaId}: ${error.message}`);
      if (!esMensajeParaElUsuario(error)) {
        throw new UnprocessableEntityException("No se pudo guardar la fecha de la factura");
      }
      throw new BadRequestException(error.message);
    }
  }

  /* ───────────────── Datos fiscales del emisor (migración 071) ─────────────── */

  /**
   * Los datos con los que se firman las facturas, y si ya bastan para emitir.
   *
   * ⚠️ `completo` NO se calcula aquí contando campos: se pregunta a
   * `emisor_fiscal()`, que es quien decide también cuándo una venta emite su
   * factura. Si esta pantalla dijera «completo» con un criterio propio, podría
   * decir que sí mientras las ventas se quedan sin factura — y nadie sabría por
   * qué. Cuesta un viaje más y vale la pena.
   */
  async emisor(): Promise<AjustesEmisor> {
    const [{ data: fila, error }, { data: fiscal }] = await Promise.all([
      this.supabase
        .from("ajustes_tienda")
        .select(
          "emisor_nif, emisor_nombre, emisor_direccion, emisor_codigo_postal, " +
            "emisor_ciudad, emisor_provincia, emisor_pais",
        )
        .maybeSingle(),
      this.supabase.rpc("emisor_fiscal"),
    ]);

    if (error) {
      this.logger.error(`No se pudieron leer los datos del emisor: ${error.message}`);
      throw new UnprocessableEntityException("No se pudieron leer los datos fiscales");
    }

    const f = (fila ?? {}) as Record<string, string | null>;

    return {
      nif: f["emisor_nif"] ?? "",
      nombre: f["emisor_nombre"] ?? "",
      direccion: f["emisor_direccion"] ?? "",
      codigo_postal: f["emisor_codigo_postal"] ?? "",
      ciudad: f["emisor_ciudad"] ?? "",
      provincia: f["emisor_provincia"] ?? "",
      pais: f["emisor_pais"] ?? "ES",
      completo: fiscal !== null,
    };
  }

  /**
   * Guarda los datos fiscales del negocio.
   *
   * El NIF se normaliza antes de guardar —mayúsculas, sin espacios ni guiones—
   * porque el CHECK de la base exige esa forma. Que el usuario tenga que
   * escribirlo en mayúsculas sería pedirle que sepa cómo se guarda el dato.
   *
   * ⚠️ Los campos vacíos se guardan como NULL y no como `''`: una cadena vacía
   * pasa cualquier `is not null` y luego sale impresa como un hueco en la
   * factura. El CHECK `ajustes_emisor_sin_vacios` también lo impide.
   */
  async guardarEmisor(datos: GuardarEmisorDatos, actorId?: string): Promise<AjustesEmisor> {
    const limpio = (v: string | undefined) => {
      const t = (v ?? "").trim();
      return t === "" ? null : t;
    };

    /**
     * ⚠️⚠️ ESTE ES EL SITIO POR DONDE ENTRÓ «españa» COMO POBLACIÓN, y salió
     * impreso en la primera factura real. Antes esto era `limpio(datos.ciudad)`:
     * un `trim()` y adentro, mientras la tienda validaba sus direcciones de envío
     * contra el diccionario del INE desde la 041.
     *
     * Un domicilio fiscal no puede validar menos que una etiqueta de envío. Y la
     * provincia deja de guardarse tal como llega: se DERIVA del código postal,
     * igual que en las direcciones, así que ya no hay forma de escribirla mal.
     */
    const ubicacion = ubicacionParaGuardar(datos.codigoPostal, datos.ciudad);

    const { error } = await this.supabase
      .from("ajustes_tienda")
      .update({
        emisor_nif: datos.nif ? normalizarNif(datos.nif) : null,
        emisor_nombre: limpio(datos.nombre),
        emisor_direccion: limpio(datos.direccion),
        emisor_codigo_postal: ubicacion.codigo_postal,
        emisor_ciudad: ubicacion.ciudad,
        emisor_provincia: ubicacion.provincia,
        actualizado_por: actorId ?? null,
      })
      .eq("id", true);

    if (error) {
      this.logger.error(`No se pudieron guardar los datos del emisor: ${error.message}`);
      throw new BadRequestException("No se pudieron guardar los datos fiscales");
    }

    this.logger.warn(`Datos fiscales del emisor actualizados${actorId ? ` por ${actorId}` : ""}`);

    return this.emisor();
  }

  /* ─────────────────── Facturas emitidas (migraciones 072–073) ────────────── */

  /**
   * El libro de facturas expedidas, de la más reciente a la más antigua.
   *
   * Se lee de la vista `libro_facturas_expedidas` y no de la tabla, porque es la
   * vista la que sabe qué facturas siguen **vigentes**: cuando una completa
   * sustituye a una simplificada las dos existen, y solo una cuenta.
   */
  async listarFacturas(): Promise<FacturaDelLibro[]> {
    const { data, error } = await this.supabase
      .from("libro_facturas_expedidas")
      .select("*")
      .order("orden", { ascending: false });

    if (error) {
      this.logger.error(`No se pudo leer el libro de facturas: ${error.message}`);
      throw new UnprocessableEntityException("No se pudo leer el libro de facturas");
    }

    const facturas = (data ?? []) as FacturaDelLibro[];
    if (facturas.length === 0) return [];

    // El número de pedido en una segunda consulta y no con un `join`: una VISTA
    // no tiene claves ajenas declaradas, así que el cliente de Supabase no puede
    // relacionarla. Añadirlo a la vista costaría otra migración para un dato de
    // presentación; una consulta por `in` no cuesta nada a este volumen.
    const { data: pedidos } = await this.supabase
      .from("pedidos")
      .select("id, numero_pedido")
      .in("id", [...new Set(facturas.map((f) => f.pedido_id))]);

    const numeros = new Map(
      ((pedidos ?? []) as Array<{ id: string; numero_pedido: string }>).map((p) => [
        p.id,
        p.numero_pedido,
      ]),
    );

    return facturas.map((f) => ({ ...f, numero_pedido: numeros.get(f.pedido_id) ?? null }));
  }

  /**
   * Las ventas a las que se les puede emitir la factura completa que pide el
   * cliente: devengadas y sin completa todavía.
   *
   * ⚠️ Las que YA tienen su simplificada siguen en la lista, y es lo correcto:
   * emitir la completa es el canje, el caso normal. Lo que sale de la lista es lo
   * que ya tiene completa, porque un pedido no puede tener dos.
   */
  async pedidosFacturables(): Promise<PedidoFacturable[]> {
    const [{ data: pedidos, error }, { data: facturas }] = await Promise.all([
      this.supabase
        .from("pedidos")
        .select("id, numero_pedido, devengado_el, total, envio_nombre, documento_cliente")
        .not("devengado_el", "is", null)
        .order("devengado_el", { ascending: false }),
      this.supabase.from("facturas_emitidas").select("pedido_id, tipo, numero"),
    ]);

    if (error) {
      this.logger.error(`No se pudieron leer los pedidos facturables: ${error.message}`);
      throw new UnprocessableEntityException("No se pudieron leer los pedidos");
    }

    const emitidas = (facturas ?? []) as Array<{
      pedido_id: string;
      tipo: string;
      numero: string;
    }>;
    const conCompleta = new Set(
      emitidas.filter((f) => f.tipo === "completa").map((f) => f.pedido_id),
    );
    const simplificadas = new Map(
      emitidas.filter((f) => f.tipo === "simplificada").map((f) => [f.pedido_id, f.numero]),
    );

    return (
      (pedidos ?? []) as Array<{
        id: string;
        numero_pedido: string;
        devengado_el: string;
        total: number;
        envio_nombre: string | null;
        documento_cliente: string | null;
      }>
    )
      .filter((p) => !conCompleta.has(p.id))
      .map((p) => ({
        pedido_id: p.id,
        numero_pedido: p.numero_pedido,
        devengado_el: p.devengado_el,
        total: p.total,
        cliente: p.envio_nombre,
        documento_cliente: p.documento_cliente,
        simplificada: simplificadas.get(p.id) ?? null,
      }));
  }

  /**
   * La factura completa que pide un cliente. Sustituye a la simplificada de esa
   * venta.
   *
   * ⚠️ Es idempotente en la BD: dos clics devuelven la MISMA factura en vez de
   * emitir dos. Eso no se resuelve aquí a propósito —un botón deshabilitado no
   * protege de dos pestañas abiertas—, sino con el cerrojo y el índice único de
   * la 072. Es la lección de la 054/055 con las facturas de compra.
   */
  async emitirFacturaCompleta(
    pedidoId: string,
    receptor: ReceptorFactura,
    actorId?: string,
  ): Promise<FacturaEmitida> {
    /**
     * ⚠️ La población del receptor pasa por el mismo diccionario del INE que una
     * dirección de envío, y la provincia se DERIVA del CP.
     *
     * Antes era texto libre con `trim()`, y por eso `VALF202600100` quedó con
     * «Mejorada del campo» en minúscula mientras el pedido de esa misma venta
     * guardaba la forma oficial. Es cosmético hasta que lo miras en un documento
     * contable inmutable, que es donde acaba.
     *
     * ⚠️ Esto NO contradice la regla de la 073 de no sacar los datos del pedido:
     * el domicilio fiscal sigue siendo el que confirma quien pide la factura. Lo
     * que cambia es que ese domicilio tiene que existir.
     */
    const ubicacion = ubicacionParaGuardar(receptor.codigo_postal, receptor.ciudad);

    const { data, error } = await this.supabase.rpc("emitir_factura_completa", {
      p_pedido_id: pedidoId,
      p_receptor: {
        nif: normalizarNif(receptor.nif),
        nombre: receptor.nombre,
        direccion: receptor.direccion,
        codigo_postal: ubicacion.codigo_postal,
        ciudad: ubicacion.ciudad,
        provincia: ubicacion.provincia,
      },
      p_actor_id: actorId ?? null,
    });

    if (error) {
      this.logger.error(`No se pudo emitir la factura del pedido ${pedidoId}: ${error.message}`);
      // La RPC nombra lo que falta y por qué se niega. Ese mensaje es
      // exactamente lo que hay que leer en pantalla.
      if (!esMensajeParaElUsuario(error)) {
        throw new UnprocessableEntityException("No se pudo emitir la factura");
      }
      throw new BadRequestException(error.message);
    }

    if (!data) {
      // Solo pasa si falta el emisor, y para eso la RPC ya lanza. Si llegara
      // aquí, callarlo sería peor: quien pulsó creería que hay factura.
      throw new BadRequestException(
        "No se emitió la factura. Revisa los datos fiscales del negocio en TI → Ajustes.",
      );
    }

    return this.factura(data as string);
  }

  /** Una factura por su id, ya emitida. */
  async factura(id: string): Promise<FacturaEmitida> {
    const { data, error } = await this.supabase
      .from("facturas_emitidas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      this.logger.error(`No se pudo leer la factura ${id}: ${error?.message ?? "no existe"}`);
      throw new UnprocessableEntityException("No se pudo leer la factura");
    }

    return data as FacturaEmitida;
  }

  /**
   * Emite las simplificadas de las ventas ya devengadas que no tienen ninguna.
   *
   * ⚠️ Existe para el arranque: hasta que el emisor esté configurado, las ventas
   * devengan sin poder facturarse. **No es una tarea de rutina** — si hace falta
   * a menudo significa que el trigger no está emitiendo, y eso es un fallo.
   */
  async emitirFacturasPendientes(actorId?: string): Promise<ResultadoEmitirPendientes> {
    const { data, error } = await this.supabase.rpc("emitir_facturas_pendientes", {
      p_actor_id: actorId ?? null,
    });

    if (error) {
      this.logger.error(`No se pudieron emitir las facturas pendientes: ${error.message}`);
      if (!esMensajeParaElUsuario(error)) {
        throw new UnprocessableEntityException("No se pudieron emitir las facturas pendientes");
      }
      throw new BadRequestException(error.message);
    }

    const resultado = data as ResultadoEmitirPendientes;
    this.logger.warn(
      `Facturas pendientes emitidas${actorId ? ` por ${actorId}` : ""}: ` +
        `${resultado.emitidas} emitida(s), ${resultado.saltadas} saltada(s)`,
    );

    return resultado;
  }

  /**
   * Recalcula la cadena de huellas de punta a punta (Verifactu).
   *
   * Sirve para poder demostrar que nadie ha tocado nada: si una factura se
   * modificó por la puerta de atrás, aparece nombrada en `rotas`. Probado
   * deshabilitando el trigger de inmutabilidad y cambiando un total.
   */
  async verificarCadena(): Promise<CadenaFacturas> {
    const { data, error } = await this.supabase.rpc("verificar_cadena_facturas");

    if (error) {
      this.logger.error(`No se pudo verificar la cadena de facturas: ${error.message}`);
      throw new UnprocessableEntityException("No se pudo verificar la cadena de facturas");
    }

    const cadena = data as CadenaFacturas;
    if (!cadena.intacta) {
      this.logger.error(`CADENA DE FACTURAS ROTA en: ${cadena.rotas.join(", ")}`);
    }

    return cadena;
  }

  /**
   * El orden y la amplitud del periodo. La base también lo comprueba —es la que
   * tiene que garantizarlo— pero aquí se caza antes de gastar el viaje, y sobre
   * todo con un mensaje que dice cuántos días se han pedido.
   */
  private validarPeriodo(desde: string, hasta: string): void {
    const inicio = mediaNocheUtc(desde);
    const fin = mediaNocheUtc(hasta);

    if (inicio === null || fin === null) {
      // El regex del DTO deja pasar cosas como 2026-02-31: son diez dígitos con
      // la forma correcta y un día que no existe.
      throw new BadRequestException("Alguna de las fechas del periodo no existe");
    }

    if (fin < inicio) {
      throw new BadRequestException("La fecha de fin no puede ser anterior a la de inicio");
    }

    const dias = Math.round((fin - inicio) / MS_POR_DIA) + 1;
    if (dias > MAX_DIAS_PERIODO) {
      throw new BadRequestException(
        `El periodo no puede pasar de ${MAX_DIAS_PERIODO} días y se han pedido ${dias}. ` +
          "Consúltalo por trimestres o por ejercicios.",
      );
    }
  }
}
