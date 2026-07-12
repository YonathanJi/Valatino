import { createSupabaseServerClient } from "@lib/supabase/server";
import type { StaffModulo, UserRole } from "@valatino/types";

export interface StaffAcceso {
  userId: string;
  email: string | null;
  nombre: string | null;
  role: UserRole | null;
  /** Módulos otorgados (solo relevante para asesores; admin ve todo) */
  modulos: StaffModulo[];
}

/**
 * Resuelve el acceso del usuario actual server-side.
 * El rol sale de user_roles y los módulos de staff_modulos (nunca de user_metadata).
 */
export async function getStaffAcceso(): Promise<StaffAcceso | null> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: rolData } = await supabase
    .from("user_roles")
    .select("roles(nombre)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const role =
    ((rolData as { roles?: { nombre?: string } } | null)?.roles?.nombre as UserRole | undefined) ??
    null;

  let modulos: StaffModulo[] = [];
  if (role === "asesor") {
    const { data: modulosData } = await supabase
      .from("staff_modulos")
      .select("modulo")
      .eq("user_id", user.id);

    modulos = ((modulosData as { modulo: StaffModulo }[] | null) ?? []).map((m) => m.modulo);
  }

  const nombre = (user.user_metadata as { nombre?: string } | undefined)?.nombre ?? null;

  return { userId: user.id, email: user.email ?? null, nombre, role, modulos };
}

export function esStaff(acceso: StaffAcceso | null): acceso is StaffAcceso {
  return acceso?.role === "admin" || acceso?.role === "asesor";
}

export function puedeVerModulo(acceso: StaffAcceso, modulo: StaffModulo): boolean {
  if (acceso.role === "admin") return true;
  return acceso.role === "asesor" && acceso.modulos.includes(modulo);
}
