import { ArrayUnique, IsArray, IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { STAFF_MODULOS, type StaffModulo } from "@valatino/types";

export class CreateAsesorDto {
  @IsEmail({}, { message: "email debe ser un correo válido" })
  email!: string;

  @IsString()
  @MinLength(2, { message: "nombre debe tener al menos 2 caracteres" })
  @MaxLength(80)
  nombre!: string;

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
