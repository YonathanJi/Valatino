import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { PermisoModulo } from "@valatino/types";

/**
 * Único punto de escritura de los permisos del staff.
 *
 * Vive aparte del controlador porque lo necesitan dos caminos: la gestión de
 * cuentas (TI → Usuarios) y la reaplicación de plantillas por cargo. Tener dos
 * copias de "cómo se guardan los permisos" es justo el tipo de duplicado que
 * acaba divergiendo.
 */
@Injectable()
export class PermisosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Deja a alguien exactamente con estos permisos y ningún otro.
   *
   * Va por RPC y no por delete + insert desde aquí porque así el borrado y el
   * alta ocurren en la misma transacción: antes, un fallo a mitad dejaba a la
   * persona sin ningún permiso.
   */
  async reemplazar(
    userId: string,
    permisos: PermisoModulo[],
    otorgadoPor: string,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("reemplazar_staff_modulos", {
      p_user_id: userId,
      p_permisos: permisos,
      p_otorgado_por: otorgadoPor,
    });

    if (error) {
      throw new InternalServerErrorException(`No se pudieron guardar los permisos: ${error.message}`);
    }
  }

  /** Permisos actuales de varias personas, indexados por usuario. */
  async porUsuario(userIds: string[]): Promise<Map<string, PermisoModulo[]>> {
    const mapa = new Map<string, PermisoModulo[]>();
    if (userIds.length === 0) return mapa;

    const { data, error } = await this.supabase
      .from("staff_modulos")
      .select("user_id, modulo, nivel")
      .in("user_id", userIds);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los permisos");

    for (const fila of (data ?? []) as ({ user_id: string } & PermisoModulo)[]) {
      const lista = mapa.get(fila.user_id) ?? [];
      lista.push({ modulo: fila.modulo, nivel: fila.nivel });
      mapa.set(fila.user_id, lista);
    }
    return mapa;
  }
}
