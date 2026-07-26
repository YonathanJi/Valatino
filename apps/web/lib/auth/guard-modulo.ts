import { redirect } from "next/navigation";
import { esStaff, getStaffAcceso, puede, type StaffAcceso } from "./staff";
import type { NivelPermiso, StaffModulo } from "@valatino/types";

/**
 * Guarda de entrada de un módulo del backoffice, para el layout de su ruta.
 *
 * Los siete layouts repetían el mismo bloque de tres líneas. Esto es solo el
 * cierre visible: la API vuelve a comprobar el permiso en cada petición, así
 * que saltarse la pantalla no da acceso a nada.
 */
export async function exigirModulo(
  modulo: StaffModulo,
  nivel: NivelPermiso = "lectura",
): Promise<StaffAcceso> {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso) || !puede(acceso, modulo, nivel)) redirect("/backoffice");

  return acceso;
}
