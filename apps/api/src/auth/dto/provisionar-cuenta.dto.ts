import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { PermisoModuloDto, PermisosArray } from "./permiso-modulo.dto";

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

  // Llegan ya rellenos con la plantilla del cargo (la manda el propio listado
  // de empleados pendientes), pero TI puede ajustarlos antes de guardar. El
  // backend tiene así un solo camino: los permisos siempre vienen en el cuerpo.
  @PermisosArray()
  permisos!: PermisoModuloDto[];
}
