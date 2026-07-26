import { PermisoModuloDto, PermisosArray } from "./permiso-modulo.dto";

export class UpdateModulosDto {
  // Se llama `permisos` y no `modulos` a propósito: con forbidNonWhitelisted
  // activo, un cliente sin actualizar que mande el `modulos: string[]` viejo
  // recibe un 400 explícito en vez de que alguien lo interprete a medias.
  @PermisosArray()
  permisos!: PermisoModuloDto[];
}
