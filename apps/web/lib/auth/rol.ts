"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@valatino/types";

/**
 * Rol del usuario desde la tabla user_roles (fuente de verdad en BD, nunca
 * user_metadata que es mutable por el propio usuario). Único punto de
 * consulta del rol en cliente — el equivalente server-side es
 * lib/auth/staff.ts (getStaffAcceso).
 */
export async function obtenerRol(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRole | undefined> {
  const { data } = await supabase
    .from("user_roles")
    .select("roles(nombre)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (data as { roles?: { nombre?: string } } | null)?.roles?.nombre as
    | UserRole
    | undefined;
}

export function esRolStaff(role: string | null | undefined): boolean {
  return role === "admin" || role === "asesor";
}
