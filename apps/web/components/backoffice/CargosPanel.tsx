"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Pencil } from "lucide-react";
import { apiFetch } from "@lib/api/client";
import { PageHeader } from "@components/backoffice/PageHeader";
import { ListaPermisos } from "@components/backoffice/ChipPermiso";
import { EditarPlantillaModal } from "@components/backoffice/EditarPlantillaModal";
import { usePuede } from "@components/backoffice/PermisosProvider";
import type { CargoConPlantilla } from "@valatino/types";

export function CargosPanel() {
  // Ver plantillas basta con lectura en TI; modificarlas cambia el acceso al
  // sistema, así que exige control total.
  const puedeEditar = usePuede("ti", "total");
  const [cargos, setCargos] = useState<CargoConPlantilla[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editando, setEditando] = useState<CargoConPlantilla | null>(null);

  const cargar = async () => {
    try {
      setCargos(await apiFetch<CargoConPlantilla[]>("/admin/ti/cargos"));
    } catch {
      // el layout ya protege la ruta
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Cargos"
        description="Qué accesos lleva cada cargo. Se copian al crear la cuenta de quien lo ocupa."
      />

      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Los cargos los crea <strong>Gestión Humana</strong>; aquí se decide qué puede hacer cada
        uno. Así, dar de alta a diez asesores comerciales es una sola configuración en vez de diez.
      </p>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : cargos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay cargos. Se crean desde Gestión Humana.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Cargo</th>
                  <th className="px-4 py-3 text-left font-medium">Accesos de la plantilla</th>
                  <th className="px-4 py-3 text-left font-medium">Personas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cargos.map((c) => (
                  <tr key={c.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.nombre}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.codigo}</p>
                      {!c.activo && (
                        <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ListaPermisos permisos={c.permisos} vacio="Sin plantilla definida" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {c.empleados_activos}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditando(c)}
                        title={puedeEditar ? "Editar plantilla" : "Ver plantilla"}
                        aria-label={`${puedeEditar ? "Editar" : "Ver"} la plantilla de ${c.nombre}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <EditarPlantillaModal
          cargo={editando}
          puedeEditar={puedeEditar}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
