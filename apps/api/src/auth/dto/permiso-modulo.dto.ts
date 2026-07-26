import { ArrayUnique, IsArray, IsIn, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { NIVELES_PERMISO, STAFF_MODULOS } from "@valatino/types";
import type { NivelPermiso, StaffModulo } from "@valatino/types";

/** Un módulo con el alcance con que se otorga. */
export class PermisoModuloDto {
  @IsIn(STAFF_MODULOS as StaffModulo[], {
    message: `modulo debe ser uno de: ${STAFF_MODULOS.join(", ")}`,
  })
  modulo!: StaffModulo;

  @IsIn(NIVELES_PERMISO as NivelPermiso[], {
    message: `nivel debe ser uno de: ${NIVELES_PERMISO.join(", ")}`,
  })
  nivel!: NivelPermiso;
}

/**
 * Decoradores del array de permisos, compartidos por los DTOs que lo aceptan.
 *
 * Los tres importan, y dos de ellos fallan en silencio si se olvidan:
 *
 * - `@Type` es OBLIGATORIO: sin él `@ValidateNested` no valida absolutamente
 *   nada y cualquier objeto pasa el filtro.
 * - `@ArrayUnique` NECESITA el selector. Sin él compara por referencia de
 *   objeto, así que dos entradas del mismo módulo siempre le parecen distintas,
 *   llegan a la base de datos y revientan contra la clave primaria: un 500
 *   donde debería haber un 400.
 */
export function PermisosArray(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    IsArray()(target, propertyKey);
    ValidateNested({ each: true })(target, propertyKey);
    Type(() => PermisoModuloDto)(target, propertyKey);
    ArrayUnique((p: PermisoModuloDto) => p.modulo, {
      message: "no se puede otorgar el mismo módulo dos veces",
    })(target, propertyKey);
  };
}
