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
import type { CodigoDescuento } from "@valatino/types";
import type { CrearCodigoDescuentoDto, EditarCodigoDescuentoDto } from "./dto/codigo-descuento.dto";

/**
 * Los códigos de descuento, para el panel de TI (083).
 *
 * ⚠️⚠️ ESTE SERVICIO NO DECIDE SI UN CÓDIGO VALE. Lee y escribe filas; quién puede
 * usar un código, si está vigente y cuánto descuenta lo dice
 * `codigo_descuento_aplicable` en la base, y tiene que seguir siendo el único sitio:
 * ese importe se le COBRA al cliente (`carrito.total` → Stripe) y se le FACTURA
 * (`confirmar_venta` → `pedidos`). La misma regla en dos sitios es cobrar uno y
 * facturar otro el día que difieran, que es lo que costó la 074.
 *
 * Vive en TI por lo mismo que el IBAN y la tarifa de envío: es configuración del
 * negocio, no trabajo del día a día.
 */
@Injectable()
export class CodigosService {
  private readonly logger = new Logger(CodigosService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  private static readonly COLUMNAS =
    "id, codigo, tipo, porcentaje, descripcion, minimo_articulos, usos_maximos, usos, " +
    "valido_desde, valido_hasta, activo, created_at";

  /** De la fila de la base al tipo del panel. Un solo sitio que traduce. */
  private aCodigo(f: Record<string, unknown>): CodigoDescuento {
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

    return {
      id: String(f.id),
      codigo: String(f.codigo),
      tipo: f.tipo as CodigoDescuento["tipo"],
      // ⚠️ `numeric` de Postgres llega como STRING por PostgREST. Sin este Number
      // el porcentaje viajaría como "20.00" y la pantalla lo pintaría con comillas.
      porcentaje: num(f.porcentaje),
      descripcion: (f.descripcion as string | null) ?? null,
      minimoArticulos: num(f.minimo_articulos),
      usosMaximos: f.usos_maximos === null ? null : Number(f.usos_maximos),
      usos: Number(f.usos ?? 0),
      validoDesde: (f.valido_desde as string | null) ?? null,
      validoHasta: (f.valido_hasta as string | null) ?? null,
      activo: Boolean(f.activo),
      createdAt: String(f.created_at),
    };
  }

  async listar(): Promise<CodigoDescuento[]> {
    const { data, error } = await this.supabase
      .from("codigos_descuento")
      .select(CodigosService.COLUMNAS)
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error(`No se pudieron leer los códigos: ${error.message}`);
      throw new BadRequestException("No se pudieron leer los códigos de descuento");
    }

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((f) => this.aCodigo(f));
  }

  async crear(dto: CrearCodigoDescuentoDto, actorId: string): Promise<CodigoDescuento> {
    /**
     * ⚠️ La coherencia tipo/porcentaje la garantiza el CHECK
     * `codigos_descuento_porcentaje_solo_su_tipo`. Esto se comprueba aquí ADEMÁS para
     * dar un mensaje que se entienda: el error del CHECK dice el nombre de la
     * constraint, y quien crea un código no tiene por qué saber leer eso.
     */
    if (dto.tipo === "porcentaje" && (dto.porcentaje === null || dto.porcentaje === undefined)) {
      throw new BadRequestException("Un código de porcentaje necesita su porcentaje");
    }
    if (dto.tipo === "envio_gratis" && dto.porcentaje !== null && dto.porcentaje !== undefined) {
      throw new BadRequestException(
        "Un código de envío gratis no lleva porcentaje: no descuenta de la mercancía, quita el porte",
      );
    }
    if (dto.valido_desde && dto.valido_hasta && dto.valido_hasta <= dto.valido_desde) {
      throw new BadRequestException("«Válido hasta» tiene que ser posterior a «válido desde»");
    }

    const { data, error } = await this.supabase
      .from("codigos_descuento")
      .insert({
        // Se guarda tal como se escribió: la unicidad la lleva el índice sobre
        // `upper(btrim(codigo))`, así que no hace falta normalizar aquí — y no
        // normalizar conserva la forma en que se va a difundir.
        codigo: dto.codigo.trim(),
        tipo: dto.tipo,
        porcentaje: dto.porcentaje ?? null,
        descripcion: dto.descripcion?.trim() || null,
        minimo_articulos: dto.minimo_articulos ?? null,
        usos_maximos: dto.usos_maximos ?? null,
        valido_desde: dto.valido_desde ?? null,
        valido_hasta: dto.valido_hasta ?? null,
        creado_por: actorId,
      })
      .select(CodigosService.COLUMNAS)
      .single();

    if (error) {
      // 23505: el índice único sobre `upper(btrim(codigo))`. Es el caso normal —
      // alguien reutiliza un nombre— y merece su mensaje, no un 400 genérico.
      if (error.code === "23505") {
        throw new ConflictException(`Ya existe un código «${dto.codigo.trim()}»`);
      }
      this.logger.error(`No se pudo crear el código: ${error.message}`);
      throw new BadRequestException("No se pudo crear el código de descuento");
    }

    return this.aCodigo(data as unknown as Record<string, unknown>);
  }

  async editar(
    id: string,
    dto: EditarCodigoDescuentoDto,
    actorId: string,
  ): Promise<CodigoDescuento> {
    // Solo lo que viene: un PATCH con `{ activo: false }` no debe borrar las fechas.
    const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.activo !== undefined) cambios.activo = dto.activo;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion?.trim() || null;
    if (dto.minimo_articulos !== undefined) cambios.minimo_articulos = dto.minimo_articulos ?? null;
    if (dto.usos_maximos !== undefined) cambios.usos_maximos = dto.usos_maximos ?? null;
    if (dto.valido_desde !== undefined) cambios.valido_desde = dto.valido_desde ?? null;
    if (dto.valido_hasta !== undefined) cambios.valido_hasta = dto.valido_hasta ?? null;

    if (Object.keys(cambios).length === 1) {
      throw new BadRequestException("No has cambiado nada");
    }

    const { data, error } = await this.supabase
      .from("codigos_descuento")
      .update(cambios)
      .eq("id", id)
      .select(CodigosService.COLUMNAS)
      .maybeSingle();

    if (error) {
      this.logger.error(`No se pudo editar el código ${id}: ${error.message}`);
      throw new BadRequestException("No se pudo editar el código de descuento");
    }
    if (!data) throw new NotFoundException("Ese código no existe");

    this.logger.log(`Código ${id} editado por ${actorId}`);
    return this.aCodigo(data as unknown as Record<string, unknown>);
  }

  /**
   * Borra un código, y SOLO si no se ha usado nunca.
   *
   * ⚠️⚠️ UNO YA USADO NO SE BORRA, SE APAGA. `pedidos.descuento_codigo` guarda el
   * texto del código de cada venta que lo llevó, y esta fila es la que dice QUÉ era
   * ese código: su porcentaje y sus condiciones. Es el «medio de prueba admitido en
   * derecho» que el art. 78.Tres.2 LIVA exige para que el descuento no forme parte de
   * la base imponible. Borrarla deja la venta diciendo «VERANO20» y a nadie pudiendo
   * demostrar qué fue VERANO20.
   *
   * ⚠️ Y no hay FK que lo impida: `descuento_codigo` es TEXT a propósito, para que
   * borrar un código no pueda reescribir la historia de un pedido. Así que la
   * protección tiene que estar AQUÍ, y por eso lleva su test.
   */
  async borrar(id: string): Promise<{ borrado: true }> {
    const { data: actual, error: errLeer } = await this.supabase
      .from("codigos_descuento")
      .select("id, codigo, usos")
      .eq("id", id)
      .maybeSingle();

    if (errLeer) throw new BadRequestException("No se pudo leer el código");
    if (!actual) throw new NotFoundException("Ese código no existe");

    const fila = actual as { codigo: string; usos: number };
    if (Number(fila.usos) > 0) {
      throw new ConflictException(
        `«${fila.codigo}» ya se ha usado ${fila.usos} ${Number(fila.usos) === 1 ? "vez" : "veces"}: ` +
          "no se puede borrar porque es la prueba de qué descuento llevaron esas ventas. Desactívalo.",
      );
    }

    const { error } = await this.supabase.from("codigos_descuento").delete().eq("id", id);
    if (error) throw new BadRequestException("No se pudo borrar el código");

    return { borrado: true };
  }
}
