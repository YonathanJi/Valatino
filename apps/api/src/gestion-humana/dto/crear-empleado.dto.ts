import {
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

// El empleado se crea SIN cuenta de acceso (RRHH contrata; TI provisiona luego).
export class CrearEmpleadoDto {
  @IsString()
  @MinLength(2, { message: "nombreCompleto debe tener al menos 2 caracteres" })
  @MaxLength(200)
  nombreCompleto!: string;

  @IsString()
  @MinLength(3, { message: "documento debe tener al menos 3 caracteres" })
  @MaxLength(40)
  documento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: "correoPersonal debe ser un correo válido" })
  correoPersonal?: string;

  @IsEmail({}, { message: "correoEmpresa debe ser un correo válido" })
  correoEmpresa!: string;

  @IsUUID("4", { message: "cargoId debe ser un UUID válido" })
  cargoId!: string;

  @IsIn(TIPOS_CONTRATACION as unknown as string[], {
    message: `tipoContratacion debe ser uno de: ${TIPOS_CONTRATACION.join(", ")}`,
  })
  tipoContratacion!: TipoContratacion;

  @IsDateString({}, { message: "fechaVinculacion debe ser una fecha (YYYY-MM-DD)" })
  fechaVinculacion!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "salario debe ser un número (máx. 2 decimales)" })
  @Min(0)
  salario?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}
