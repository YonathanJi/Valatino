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
  ciudad!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigo_postal!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provincia!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;
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
