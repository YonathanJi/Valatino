import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Los canales por los que un cliente puede preguntar antes de comprar
 * (migración 081).
 *
 * ⚠️ Los tres son opcionales por separado, pero **dejar los tres vacíos apaga la
 * página de contacto**, y eso es una decisión con consecuencias: una tienda sin
 * forma de preguntar es una tienda a la que no se le compra. No se prohíbe aquí
 * —hay quien vende solo por WhatsApp y quiere quitar el correo— pero la pantalla
 * avisa.
 *
 * ⚠️⚠️ El WhatsApp NO se valida con expresión regular aquí. Se admite tal como lo
 * teclearía cualquiera («600 11 12 22», «+34 600111222») y lo normaliza el
 * servicio a los dígitos que exige `wa.me`. Validar la forma aquí obligaría al
 * cliente del panel a saber el formato de un enlace de WhatsApp.
 */
export class GuardarAjustesContactoDto {
  /**
   * ⚠️ `IsEmail` y no una regex propia: aquí lo que importa es que la dirección
   * sea escribible. Que EXISTA no lo puede saber ninguna validación — lo sabrá
   * Jonathan cuando se escriba a sí mismo, que es exactamente la prueba que nadie
   * hizo con `soporte@valatino.es` y por eso lleva meses rebotando.
   */
  @IsOptional()
  @IsEmail({}, { message: "Ese correo de contacto no tiene forma de correo" })
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;
}
