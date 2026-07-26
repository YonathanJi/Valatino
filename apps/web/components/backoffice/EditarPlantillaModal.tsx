"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { SelectorPermisos } from "@components/backoffice/SelectorPermisos";
import { NIVEL_LABELS } from "@valatino/types";
import type {
  CargoConPlantilla,
  EmpleadoAfectado,
  MotivoOmision,
  PermisoModulo,
  ResultadoReaplicar,
} from "@valatino/types";
import { MODULO_LABELS } from "@lib/backoffice/iconos";

const MOTIVOS: Record<MotivoOmision, string> = {
  sin_cuenta: "todavía no tiene cuenta",
  es_admin: "es súper admin y no se toca",
  inactivo: "está dado de baja",
};

interface EditarPlantillaModalProps {
  cargo: CargoConPlantilla;
  puedeEditar: boolean;
  onClose: () => void;
  onGuardado: () => void;
}

export function EditarPlantillaModal({
  cargo,
  puedeEditar,
  onClose,
  onGuardado,
}: EditarPlantillaModalProps) {
  const [permisos, setPermisos] = useState<PermisoModulo[]>(cargo.permisos);
  const [guardando, setGuardando] = useState(false);

  // Segundo paso: la confirmación de reaplicar, con el diff a la vista.
  const [afectados, setAfectados] = useState<EmpleadoAfectado[] | null>(null);
  const [cargandoAfectados, setCargandoAfectados] = useState(false);
  const [reaplicando, setReaplicando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await apiFetch(`/admin/ti/cargos/${cargo.id}/plantilla`, {
        method: "PUT",
        body: JSON.stringify({ permisos }),
      });
      toast.success("Plantilla guardada");
      onGuardado();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la plantilla");
    } finally {
      setGuardando(false);
    }
  };

  const verAfectados = async () => {
    setCargandoAfectados(true);
    try {
      const datos = await apiFetch<{ total: number; empleados: EmpleadoAfectado[] }>(
        `/admin/ti/cargos/${cargo.id}/afectados`,
      );
      setAfectados(datos.empleados);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo calcular a quién afecta");
    } finally {
      setCargandoAfectados(false);
    }
  };

  const reaplicar = async (incluirme = false) => {
    setReaplicando(true);
    try {
      const r = await apiFetch<ResultadoReaplicar>(`/admin/ti/cargos/${cargo.id}/reaplicar`, {
        method: "POST",
        body: JSON.stringify(incluirme ? { incluirme: true } : {}),
      });
      toast.success(
        r.aplicados === 1
          ? "Plantilla aplicada a 1 persona"
          : `Plantilla aplicada a ${r.aplicados} personas`,
      );
      setAfectados(null);
      onGuardado();
    } catch (err) {
      // El backend obliga a confirmar si quien reaplica ocupa el propio cargo.
      if (err instanceof ApiError && err.message.includes("incluirme")) {
        if (window.confirm(`${err.message}\n\n¿Continuar de todas formas?`)) {
          setReaplicando(false);
          return void reaplicar(true);
        }
      } else {
        toast.error(err instanceof ApiError ? err.message : "No se pudo reaplicar");
      }
    } finally {
      setReaplicando(false);
    }
  };

  const aplicables = afectados?.filter((e) => e.omitido_por === null) ?? [];
  const divergentes = aplicables.filter((e) => e.divergente);
  const omitidos = afectados?.filter((e) => e.omitido_por !== null) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{cargo.nombre}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cargo.codigo} · {cargo.empleados_activos}{" "}
              {cargo.empleados_activos === 1 ? "persona" : "personas"} en plantilla
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {afectados === null ? (
          <>
            <SelectorPermisos
              valor={permisos}
              onChange={setPermisos}
              disabled={!puedeEditar || guardando}
            />

            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Guardar la plantilla <strong>no cambia los permisos de nadie</strong>: es el molde
              para las cuentas que se creen a partir de ahora. Para llevarla a quien ya tiene
              cuenta, usa «Aplicar al equipo».
            </p>

            {!puedeEditar && (
              <p className="text-xs text-amber-700">
                Necesitas control total en TI para modificar plantillas.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!puedeEditar || cargandoAfectados || cargo.empleados_activos === 0}
                onClick={() => void verAfectados()}
              >
                {cargandoAfectados ? "Calculando…" : "Aplicar al equipo…"}
              </Button>
              <Button type="button" disabled={!puedeEditar || guardando} onClick={() => void guardar()}>
                {guardando ? "Guardando…" : "Guardar plantilla"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                Se aplicará a {aplicables.length}{" "}
                {aplicables.length === 1 ? "persona" : "personas"}
              </h3>

              {divergentes.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>
                    <strong>
                      {divergentes.length} de {aplicables.length}
                    </strong>{" "}
                    {divergentes.length === 1 ? "tiene permisos" : "tienen permisos"} distintos de
                    la plantilla y se van a sobrescribir. Esta acción reemplaza, no suma.
                  </p>
                </div>
              )}

              <ul className="divide-y rounded-lg border text-sm">
                {aplicables.map((e) => (
                  <li key={e.empleado_id} className="px-3 py-2">
                    <p className="font-medium">
                      {e.nombre}
                      {e.divergente && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          cambia
                        </span>
                      )}
                    </p>
                    {e.cambios.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {e.cambios.map((c) => (
                          <li key={c.modulo}>
                            {MODULO_LABELS[c.modulo]}:{" "}
                            {c.de ? NIVEL_LABELS[c.de] : "sin acceso"} →{" "}
                            <strong>{c.a ? NIVEL_LABELS[c.a] : "sin acceso"}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {omitidos.map((e) => (
                  <li key={e.empleado_id} className="px-3 py-2 text-muted-foreground">
                    <span className="line-through">{e.nombre}</span>{" "}
                    <span className="text-xs">— se omite: {MOTIVOS[e.omitido_por!]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAfectados(null)}>
                Volver
              </Button>
              <Button
                type="button"
                disabled={reaplicando || aplicables.length === 0}
                onClick={() => void reaplicar()}
              >
                {reaplicando ? "Aplicando…" : `Aplicar a ${aplicables.length}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
