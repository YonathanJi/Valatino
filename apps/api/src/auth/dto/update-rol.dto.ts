import { ArrayUnique, IsArray, IsIn, IsOptional } from "class-validator";
import { STAFF_MODULOS, type StaffModulo } from "@valatino/types";

const ROLES_STAFF = ["admin", "asesor"];

export class UpdateRolDto {
  @IsIn(ROLES_STAFF, { message: "rol debe ser 'admin' o 'asesor'" })
  rol!: "admin" | "asesor";

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_MODULOS as StaffModulo[], {
    each: true,
    message: `cada módulo debe ser uno de: ${STAFF_MODULOS.join(", ")}`,
  })
  modulos?: StaffModulo[];
}
