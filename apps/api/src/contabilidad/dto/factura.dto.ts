import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { EsNif } from "../../common/validators/es-nif.validator";

/** Cinco cifras y nada más, igual que el CHECK de la base (migración 071). */
const CODIGO_POSTAL_ES = /^\d{5}$/;

/**
 * Los datos fiscales del negocio, tal como se editan en TI → Ajustes.
 *
 * ⚠️ Los cinco son obligatorios AQUÍ aunque en la base sean NULL-ables, y no es
 * contradictorio: la base los deja vacíos porque nacen vacíos y porque el
 * guardia de verdad es `emisor_fiscal()`, que devuelve NULL mientras falte algo.
 * Pero **guardar la mitad** desde el formulario no tiene ningún sentido: dejaría
 * el negocio sin poder facturar y con la sensación de haberlo configurado.
 */
export class GuardarEmisorDto {
  @IsString()
  @EsNif()
  nif!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  direccion!: string;

  @IsString()
  @Matches(CODIGO_POSTAL_ES, { message: "El código postal debe tener 5 cifras" })
  codigoPostal!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ciudad!: string;

  /**
   * Opcional a propósito: el código postal ya determina la provincia, y exigir
   * un campo más solo añade una casilla donde atascarse. Igual que en la RPC.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;
}

/**
 * La factura completa que pide un cliente, con SUS datos fiscales.
 *
 * ⚠️⚠️ Estos datos NO se derivan del pedido, y es deliberado:
 *
 *   · `documento_cliente` es el DNI que se pidió en el checkout, y puede no ser
 *     el NIF que va en la factura — pensar en el CIF de una empresa.
 *   · la dirección guardada es la de **envío**, que no tiene por qué ser el
 *     domicilio fiscal.
 *
 * La pantalla prerrellena para ahorrar teclas; quien pide la factura confirma.
 */
export class EmitirFacturaCompletaDto {
  @IsUUID()
  pedidoId!: string;

  @IsString()
  @EsNif()
  nif!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  direccion!: string;

  @IsString()
  @Matches(CODIGO_POSTAL_ES, { message: "El código postal debe tener 5 cifras" })
  codigoPostal!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ciudad!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;
}
