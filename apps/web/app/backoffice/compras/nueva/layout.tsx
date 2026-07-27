import { exigirModulo } from "@lib/auth/guard-modulo";

/**
 * Registrar una compra exige `compras:edicion`, no solo el módulo.
 *
 * El layout de `compras` pide `lectura`, así que sin esto quien solo consulta
 * llegaba por URL a un formulario de alta entero que acababa en 403 al enviarlo.
 */
export default async function NuevaCompraLayout({ children }: { children: React.ReactNode }) {
  await exigirModulo("compras", "edicion");
  return <>{children}</>;
}
