import { createSupabaseServerClient } from "@lib/supabase/server";
import { nivelAlcanza, nivelDe } from "@valatino/types";
import type { NivelPermiso, PermisoModulo, StaffModulo, UserRole } from "@valatino/types";

export interface StaffAcceso {
  userId: string;
  email: string | null;
  nombre: string | null;
  role: UserRole | null;
  /** Módulos otorgados con su nivel (solo asesores; el admin es total en todo). */
  permisos: PermisoModulo[];
  /** Cargo de RRHH, para mostrarlo en vez del rol técnico. */
  cargoNombre: string | null;
}

/**
 * Resuelve el acceso del usuario actual server-side.
 * El rol sale de user_roles y los permisos de staff_modulos (nunca de user_metadata).
 */
export async function getStaffAcceso(): Promise<StaffAcceso | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  let permisos: PermisoModulo[] = [];
  if (role === "asesor") {
    const { data } = await supabase.from("staff_modulos").select("modulo, nivel").eq("user_id", user.id);
    permisos = ((data as PermisoModulo[] | null) ?? []).map(({ modulo, nivel }) => ({
      modulo,
      nivel,
    }));
  }

  // Por RPC y no leyendo `empleados`: esa tabla tiene RLS activa y CERO
  // policies, así que con la sesión del usuario devuelve cero filas EN SILENCIO
  // y el cargo saldría siempre vacío sin ningún error que lo delate.
  let cargoNombre: string | null = null;
  if (role === "admin" || role === "asesor") {
    const { data } = await supabase.rpc("mi_cargo");
    cargoNombre = (data as { nombre: string }[] | null)?.[0]?.nombre ?? null;
  }

  const nombre = (user.user_metadata as { nombre?: string } | undefined)?.nombre ?? null;

  return { userId: user.id, email: user.email ?? null, nombre, role, permisos, cargoNombre };
}

export function esStaff(acceso: StaffAcceso | null): acceso is StaffAcceso {
  return acceso?.role === "admin" || acceso?.role === "asesor";
}

/** Nivel real en un módulo; el admin es `total` en todo sin tener filas. */
export function nivelEn(acceso: StaffAcceso, modulo: StaffModulo): NivelPermiso | null {
  if (acceso.role === "admin") return "total";
  if (acceso.role !== "asesor") return null;
  return nivelDe(acceso.permisos, modulo);
}

/** ¿Alcanza para esta acción? Es el equivalente en la web al guard de la API. */
export function puede(acceso: StaffAcceso, modulo: StaffModulo, nivel: NivelPermiso): boolean {
  return nivelAlcanza(nivelEn(acceso, modulo), nivel);
}

/** Ver un módulo en el menú = tener al menos lectura en él. */
export function puedeVerModulo(acceso: StaffAcceso, modulo: StaffModulo): boolean {
  return puede(acceso, modulo, "lectura");
}

/**
 * Cómo se presenta a alguien en el panel. Se muestra su cargo real de RRHH en
 * vez de «Asesor», que es el rol técnico y no dice nada de un Director
 * Comercial. «Personal interno» cubre a quien no tiene ficha de empleado.
 */
export function etiquetaCargo(acceso: StaffAcceso): string {
  if (acceso.role === "admin") return "Súper admin";
  return acceso.cargoNombre ?? "Personal interno";
}
