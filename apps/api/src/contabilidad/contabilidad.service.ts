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
import type { LiquidacionIva } from "@valatino/types";

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
