import { ArrayUnique, IsArray, IsEmail, IsIn, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { STAFF_MODULOS, type StaffModulo } from "@valatino/types";

/** TI provisiona la cuenta de acceso de un empleado ya creado por RRHH. */
export class ProvisionarCuentaDto {
  @IsUUID("4", { message: "empleadoId debe ser un UUID válido" })
  empleadoId!: string;

  @IsEmail({}, { message: "email debe ser un correo válido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "password debe tener al menos 8 caracteres" })
  @MaxLength(72)
  password!: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_MODULOS as StaffModulo[], {
    each: true,
    message: `cada módulo debe ser uno de: ${STAFF_MODULOS.join(", ")}`,
  })
  modulos!: StaffModulo[];
}
