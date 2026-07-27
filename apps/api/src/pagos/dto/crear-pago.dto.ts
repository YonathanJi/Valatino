import { Type } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { EsTelefono } from "../../common/validators/es-telefono.validator";
import {
  EsCodigoPostal,
  EsMunicipioDelCP,
} from "../../common/validators/direccion.validators";

export class DireccionSnapshotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_destinatario!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  linea1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linea2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @EsMunicipioDelCP("codigo_postal")
  ciudad!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @EsCodigoPostal()
  codigo_postal!: string;

  /** Se acepta pero se recalcula desde el CP. Ver la nota de `CreateDireccionDto`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;

  /**
   * Teléfono de contacto para la entrega.
   *
   * Opcional a propósito, aunque el checkout lo exija: Vercel y Render
   * despliegan del mismo push y no se puede ordenar API antes que web, así que
   * durante una release conviven las dos combinaciones. Exigirlo aquí haría que
   * un checkout servido desde la versión anterior respondiera 400 al pagar, y
   * eso no es un permiso denegado: es una venta perdida.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @EsTelefono()
  telefono?: string;
}

export class CrearPagoDto {
  /** Dirección guardada (usuarios autenticados) */
  @IsOptional()
  @IsUUID("4")
  direccion_envio_id?: string;

  /** Email de contacto (obligatorio para invitados) */
  @IsOptional()
  @IsEmail({}, { message: "email no tiene un formato válido" })
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;

  /** Dirección inline (checkout de invitados) */
  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionSnapshotDto)
  direccion?: DireccionSnapshotDto;
}
