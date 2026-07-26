import { IsArray, IsBoolean, IsOptional, IsUUID } from "class-validator";
import { PermisoModuloDto, PermisosArray } from "../../auth/dto/permiso-modulo.dto";

export class GuardarPlantillaDto {
  @PermisosArray()
  permisos!: PermisoModuloDto[];
}

export class ReaplicarDto {
  /** Reaplicar solo a estas personas; si no viene, a todas las del cargo. */
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true, message: "cada user_id debe ser un UUID válido" })
  user_ids?: string[];

  /**
   * Confirmación explícita cuando el propio editor ocupa el cargo. Sin esto,
   * quien edita la plantilla de su cargo se cambiaría los permisos a sí mismo
   * sin enterarse.
   */
  @IsOptional()
  @IsBoolean()
  incluirme?: boolean;
}
