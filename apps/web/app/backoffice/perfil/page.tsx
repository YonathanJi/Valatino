import { etiquetaCargo, getStaffAcceso, esStaff } from "@lib/auth/staff";
import { UserCircle } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { ListaPermisos } from "@components/backoffice/ChipPermiso";

// Perfil del empleado (server component). El layout del backoffice ya
// garantiza que solo llega aquí el staff autenticado.
export default async function PerfilStaffPage() {
  const acceso = await getStaffAcceso();
  if (!esStaff(acceso)) return null; // el layout ya redirige; guard defensivo

  const esAdmin = acceso.role === "admin";

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageHeader icon={UserCircle} title="Mi perfil" description="Tu cuenta y accesos al panel" />

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium truncate">{acceso.nombre ?? "Empleado de Valatino"}</p>
            <p className="text-sm text-muted-foreground truncate">{acceso.email}</p>
          </div>
          {/* El cargo real de RRHH, no el rol técnico: «Asesor» no dice nada de
              un Director Comercial. */}
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shrink-0">
            {etiquetaCargo(acceso)}
          </span>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-2">Acceso al panel</p>
          {esAdmin ? (
            <p className="text-sm">Control total sobre todos los módulos</p>
          ) : (
            <ListaPermisos
              permisos={acceso.permisos}
              vacio="Sin acceso a ningún módulo todavía. Contacta con TI."
            />
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        ¿Necesitas cambiar tu contraseña o tu nivel de acceso? Contacta con TI.
      </p>
    </div>
  );
}
