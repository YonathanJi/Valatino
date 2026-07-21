import { redirect } from "next/navigation";
import { getStaffAcceso, esStaff, puedeVerModulo } from "@lib/auth/staff";

/** Enruta al primer módulo visible según los permisos del staff. */
export default async function BackofficeIndexPage() {
  const acceso = await getStaffAcceso();

  if (!acceso) redirect("/admin");
  if (!esStaff(acceso)) redirect("/");

  // El dashboard es la entrada preferente para quien puede verlo (admin siempre)
  if (puedeVerModulo(acceso, "dashboard")) redirect("/backoffice/dashboard");

  if (puedeVerModulo(acceso, "pedidos")) redirect("/backoffice/pedidos");
  if (puedeVerModulo(acceso, "catalogo")) redirect("/backoffice/catalogo");
  if (puedeVerModulo(acceso, "inventario")) redirect("/backoffice/inventario");
  if (puedeVerModulo(acceso, "compras")) redirect("/backoffice/compras");

  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Tu cuenta de asesor no tiene módulos asignados todavía.
      <br />
      Pide a un administrador que te otorgue acceso.
    </div>
  );
}
