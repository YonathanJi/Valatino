import { getStaffAcceso, esStaff } from "@lib/auth/staff";
import { UserCircle } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import type { StaffModulo } from "@valatino/types";

const MODULO_LABELS: Record<StaffModulo, string> = {
  pedidos: "Pedidos",
  catalogo: "Catálogo",
  inventario: "Inventario",
  dashboard: "Dashboard",
  compras: "Compras",
  gestion_humana: "Gestión Humana",
};

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
          <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shrink-0">
            {esAdmin ? "Administrador" : "Asesor"}
          </span>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground mb-2">Acceso al panel</p>
          {esAdmin ? (
            <p className="text-sm">Acceso completo a todos los módulos</p>
          ) : acceso.modulos.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {acceso.modulos.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium"
                >
                  {MODULO_LABELS[m] ?? m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin módulos asignados. Contacta con un administrador.
            </p>
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        ¿Necesitas cambiar tu contraseña o tus módulos de acceso? Contacta con un administrador.
      </p>
    </div>
  );
}
