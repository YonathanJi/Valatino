import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { AjustesEnvio } from "@valatino/types";

/**
 * La tarifa de envío, para el panel (migración 080 §1).
 *
 * ⚠️⚠️ ESTE SERVICIO NO CALCULA NADA. Lee y escribe dos números; quién decide si
 * un carrito paga porte —y cuánto— es `coste_envio_de` en la base de datos, y
 * tiene que seguir siendo el único sitio: ese importe se le COBRA al cliente
 * (`carrito.total` → Stripe) y se le FACTURA (`confirmar_venta` → `pedidos`). La
 * misma regla en dos sitios es cobrar uno y facturar otro el día que difieran,
 * que es lo que costó la 074 con el formato del número de factura.
 *
 * Vive en TI y no en Pedidos por lo mismo que el IBAN: es configuración del
 * negocio, no trabajo del día a día.
 */
@Injectable()
export class EnvioService {
  private readonly logger = new Logger(EnvioService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async ajustes(): Promise<AjustesEnvio> {
    const { data, error } = await this.supabase
      .from("ajustes_tienda")
      .select("envio_coste, envio_gratis_desde, updated_at")
      .maybeSingle();

    if (error) {
      this.logger.error(`No se pudo leer la tarifa de envío: ${error.message}`);
      throw new BadRequestException("No se pudo leer la tarifa de envío");
    }

    const fila = (data ?? {}) as {
      envio_coste?: string | number | null;
      envio_gratis_desde?: string | number | null;
      updated_at?: string | null;
    };

    const coste = Number(fila.envio_coste ?? 0);

    return {
      coste,
      gratis_desde: fila.envio_gratis_desde === null || fila.envio_gratis_desde === undefined
        ? null
        : Number(fila.envio_gratis_desde),
      // Lo que la tienda hace HOY, dicho sin que haya que deducirlo de los dos
      // números: es la pregunta que se viene a contestar a esta pantalla.
      cobra_envio: coste > 0,
      actualizado_el: fila.updated_at ?? null,
    };
  }

  /**
   * Guarda la tarifa.
   *
   * ⚠️ No hay ninguna comprobación de coherencia entre `coste` y `gratis_desde`
   * porque no hay ninguna combinación incoherente: con `coste = 0` el umbral no
   * hace nada (ya es gratis) y eso no es un error, es la tienda de siempre con un
   * umbral escrito de antemano para cuando se active el porte.
   */
  async guardar(
    datos: { coste: number; gratis_desde?: number | null },
    actorId?: string,
  ): Promise<AjustesEnvio> {
    const { error } = await this.supabase
      .from("ajustes_tienda")
      .update({
        envio_coste: datos.coste,
        envio_gratis_desde: datos.gratis_desde ?? null,
        actualizado_por: actorId ?? null,
      })
      .eq("id", true);

    if (error) {
      this.logger.error(`No se pudo guardar la tarifa de envío: ${error.message}`);
      throw new BadRequestException("No se pudo guardar la tarifa de envío");
    }

    /**
     * ⚠️ Se registra ALTO, y no es ruido: esto cambia lo que paga cada cliente
     * que compre a partir de ahora. Un cambio de tarifa que nadie recuerda haber
     * hecho es la explicación de la mitad de los «¿por qué me han cobrado esto?».
     *
     * Los checkouts que ya estén en marcha NO se ven afectados: su porte quedó
     * congelado en `checkout_datos` al crear el pago (080 §2).
     */
    this.logger.warn(
      `Tarifa de envío actualizada a ${datos.coste} €` +
        (datos.gratis_desde ? `, gratis desde ${datos.gratis_desde} €` : ", sin umbral de gratuidad") +
        (actorId ? ` por ${actorId}` : ""),
    );

    return this.ajustes();
  }
}
