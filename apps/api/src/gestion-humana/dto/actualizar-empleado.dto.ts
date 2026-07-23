import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { TIPOS_CONTRATACION, type TipoContratacion } from "@valatino/types";

export class ActualizarEmpleadoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombreCompleto?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: "correoPersonal debe ser un correo válido" })
  correoPersonal?: string;

  @IsOptional()
  @IsEmail({}, { message: "correoEmpresa debe ser un correo válido" })
  correoEmpresa?: string;

  @IsOptional()
  @IsUUID("4")
  cargoId?: string;

  @IsOptional()
  @IsIn(TIPOS_CONTRATACION as unknown as string[], {
    message: `tipoContratacion debe ser uno de: ${TIPOS_CONTRATACION.join(", ")}`,
  })
  tipoContratacion?: TipoContratacion;

  @IsOptional()
  @IsDateString()
  fechaVinculacion?: string;

  @IsOptional()
  @IsDateString()
  fechaDesvinculacion?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salario?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}
