import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { IdentidadPublica } from "@valatino/types";

/**
 * Quién vende y cómo se le pregunta (migración 081).
 *
 * ⚠️⚠️ LO QUE DEVUELVE ES PÚBLICO DE VERDAD: sale sin sesión, en el pie de la
 * tienda y en `/aviso-legal`. La frontera de qué es publicable NO está en este
 * fichero, está en la función `identidad_publica()` de la base — que devuelve
 * exactamente los campos que pueden salir a internet y ninguno más.
 *
 * Ese reparto es a propósito: `ajustes_tienda` guarda también el IBAN de cobro y
 * el titular de la cuenta, así que un `select *` escrito con prisa aquí los
 * publicaría. Llamando a la RPC, esa equivocación no es posible: no hay otra cosa
 * que devolver.
 *
 * ⚠️ Por eso mismo, si algún día hace falta un campo público nuevo, se añade a la
 * función de la 081 y NO se cambia esto por una lectura directa de la tabla.
 */
@Injectable()
export class IdentidadService {
  private readonly logger = new Logger(IdentidadService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /** La identidad y los canales, tal y como los ve cualquiera. */
  async publica(): Promise<IdentidadPublica> {
    const { data, error } = await this.supabase.rpc("identidad_publica");

    if (error || !data) {
      /**
       * ⚠️ Un fallo aquí NO puede tumbar la tienda: esto lo pinta el PIE DE
       * PÁGINA, o sea todas las páginas. Se devuelve una identidad vacía —que las
       * pantallas ya saben tratar, porque es el mismo caso que «aún no
       * configurado»— y se registra alto, porque una tienda sin aviso legal
       * incumple la LSSI y nadie lo va a notar mirando.
       */
      this.logger.error(
        `No se pudo leer la identidad pública, la tienda queda sin aviso legal: ${error?.message ?? "sin datos"}`,
      );
      return {
        nombre: null,
        nif: null,
        direccion: null,
        codigo_postal: null,
        ciudad: null,
        provincia: null,
        pais: null,
        email: null,
        whatsapp: null,
        telefono: null,
        identificada: false,
        contactable: false,
      };
    }

    return data as IdentidadPublica;
  }

  /**
   * Guarda los canales de contacto. La identidad (NIF, nombre, domicilio) NO se
   * toca aquí: es la del emisor de las facturas y se edita en su propia pantalla,
   * porque es el mismo dato y tener dos sitios donde cambiarlo es la vía de que
   * la factura diga un NIF y el aviso legal diga otro.
   */
  async guardarContacto(
    datos: { email?: string | null; whatsapp?: string | null; telefono?: string | null },
    actorId?: string,
  ): Promise<IdentidadPublica> {
    const whatsapp = normalizarWhatsapp(datos.whatsapp);

    if (datos.whatsapp?.trim() && !whatsapp) {
      throw new BadRequestException(
        "Ese número de WhatsApp no es válido. Escríbelo con el prefijo del país, por ejemplo 600 11 12 22 o +34 600 11 12 22.",
      );
    }

    const { error } = await this.supabase
      .from("ajustes_tienda")
      .update({
        contacto_email: datos.email?.trim().toLowerCase() || null,
        contacto_whatsapp: whatsapp,
        contacto_telefono: datos.telefono?.trim() || null,
        actualizado_por: actorId ?? null,
      })
      .eq("id", true);

    if (error) {
      this.logger.error(`No se pudieron guardar los canales de contacto: ${error.message}`);
      throw new BadRequestException("No se pudieron guardar los canales de contacto");
    }

    this.logger.warn(
      `Canales de contacto actualizados${actorId ? ` por ${actorId}` : ""}` +
        ` · email ${datos.email?.trim() ? "sí" : "no"}` +
        ` · whatsapp ${whatsapp ? "sí" : "no"}`,
    );

    return this.publica();
  }
}

/**
 * Deja el número como lo quiere `wa.me/<numero>`: solo dígitos y con prefijo de
 * país. Devuelve `null` si no se puede.
 *
 * ⚠️⚠️ ESTO NO ES COSMÉTICA. `wa.me/+34 600 111 222` da un error de WhatsApp que
 * el cliente lee como «este número no existe», y el fallo es del enlace, no del
 * número. Guardar ya normalizado es lo que impide que ese enlace nazca roto.
 *
 * ⚠️ Un número de 9 dígitos que empieza por 6, 7 u 8 se toma por español y se le
 * pone el 34. Es una suposición, y es la correcta para esta tienda: vende solo en
 * España. Cualquier otra longitud tiene que traer su prefijo escrito.
 */
export function normalizarWhatsapp(valor?: string | null): string | null {
  if (!valor) return null;

  // Fuera el `+`, los espacios, los guiones y los paréntesis; y los `00` de
  // marcación internacional a la antigua, que son otro prefijo del mismo país.
  let digitos = valor.replace(/[^\d]/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (!digitos) return null;

  // Móvil o fijo español escrito sin prefijo.
  if (/^[6789]\d{8}$/.test(digitos)) digitos = `34${digitos}`;

  // El mismo rango que el CHECK de la 081 (E.164).
  return /^[1-9]\d{7,14}$/.test(digitos) ? digitos : null;
}
