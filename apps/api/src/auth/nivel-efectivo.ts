import { nivelDe } from "@valatino/types";
import type { JwtPayload, NivelPermiso, StaffModulo } from "@valatino/types";

/**
 * Nivel real de alguien en un módulo, contando que el admin es `total` en todo
 * sin tener filas en staff_modulos.
 *
 * El guard resuelve el permiso grueso de la ruta; esto hace falta cuando la
 * decisión depende del contenido de la petición y no puede expresarse con
 * metadata estática: qué transiciones de estado ofrecer, o si `soloActivos=false`
 * puede listar borradores.
 */
export function nivelEfectivo(
  user: JwtPayload | undefined,
  modulo: StaffModulo,
): NivelPermiso | null {
  if (!user) return null;
  if (user.role === "admin") return "total";
  if (user.role !== "asesor") return null;
  return nivelDe(user.modulos, modulo);
}
