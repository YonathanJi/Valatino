import { exigirModulo } from "@lib/auth/guard-modulo";

/**
 * Dar de alta a un empleado exige `gestion_humana:edicion`, no solo el módulo.
 *
 * El layout de `gestion-humana` pide `lectura`, así que sin esto quien solo
 * consulta la plantilla llegaba por URL al formulario de alta.
 */
export default async function NuevoEmpleadoLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("gestion_humana", "edicion");
  return <>{children}</>;
}
