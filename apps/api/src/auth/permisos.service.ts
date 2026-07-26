import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { StaffModulo } from "@valatino/types";

/**
 * Único punto de escritura de los permisos del staff.
 *
 * Vive aparte del controlador porque lo van a necesitar dos caminos: la gestión
 * de cuentas (TI → Usuarios) y la reaplicación de plantillas por cargo. Tener
 * dos copias de "cómo se guardan los permisos" es justo el tipo de duplicado
 * que acaba divergiendo.
 */
@Injectable()
export class PermisosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async reemplazar(userId: string, modulos: StaffModulo[], otorgadoPor: string): Promise<void> {
    // TODO(fase 6): pasar a la RPC reemplazar_staff_modulos para que el borrado
    // y el alta ocurran en una sola transacción.
    const { error: deleteError } = await this.supabase
      .from("staff_modulos")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw new InternalServerErrorException("No se pudieron limpiar los módulos");

    if (modulos.length === 0) return;

    const { error: insertError } = await this.supabase
      .from("staff_modulos")
      .insert(modulos.map((modulo) => ({ user_id: userId, modulo, otorgado_por: otorgadoPor })));
    if (insertError) throw new InternalServerErrorException("No se pudieron guardar los módulos");
  }
}
