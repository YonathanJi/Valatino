import { ArrayUnique, IsArray, IsIn } from "class-validator";
import { STAFF_MODULOS, type StaffModulo } from "@valatino/types";

export class UpdateModulosDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(STAFF_MODULOS as StaffModulo[], {
    each: true,
    message: `cada módulo debe ser uno de: ${STAFF_MODULOS.join(", ")}`,
  })
  modulos!: StaffModulo[];
}
