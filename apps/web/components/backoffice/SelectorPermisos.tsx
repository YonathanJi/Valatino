"use client";

import { NIVEL_LABELS, NIVELES_PERMISO, STAFF_MODULOS } from "@valatino/types";
import type { NivelPermiso, PermisoModulo, StaffModulo } from "@valatino/types";
import { MODULO_ICONOS, MODULO_LABELS } from "@lib/backoffice/iconos";

interface SelectorPermisosProps {
  valor: PermisoModulo[];
  onChange: (permisos: PermisoModulo[]) => void;
  disabled?: boolean;
  /** Plantilla del cargo, si la hay: habilita el botón de restaurarla. */
  plantilla?: PermisoModulo[];
}

const SIN_ACCESO = "";

/**
 * Otorga módulos con su alcance.
 *
 * Un único desplegable de cuatro opciones por módulo en vez de casilla + nivel:
 * elimina el estado imposible «marcado pero sin nivel», y «Sin acceso» es
 * conceptualmente un peldaño más del mismo continuo. Con `<select>` nativo,
 * además, el teclado y el móvil funcionan sin escribir nada.
 */
export function SelectorPermisos({
  valor,
  onChange,
  disabled = false,
  plantilla,
}: SelectorPermisosProps) {
  const nivelDeModulo = (modulo: StaffModulo): NivelPermiso | "" =>
    valor.find((p) => p.modulo === modulo)?.nivel ?? SIN_ACCESO;

  const cambiar = (modulo: StaffModulo, nivel: string) => {
    const resto = valor.filter((p) => p.modulo !== modulo);
    onChange(
      nivel === SIN_ACCESO ? resto : [...resto, { modulo, nivel: nivel as NivelPermiso }],
    );
  };

  const plantillaDistinta =
    plantilla !== undefined &&
    JSON.stringify([...plantilla].sort((a, b) => a.modulo.localeCompare(b.modulo))) !==
      JSON.stringify([...valor].sort((a, b) => a.modulo.localeCompare(b.modulo)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(STAFF_MODULOS.map((modulo) => ({ modulo, nivel: "lectura" })))}
          className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Todo en solo lectura
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Quitar todo
        </button>
        {plantilla !== undefined && (
          <button
            type="button"
            disabled={disabled || !plantillaDistinta}
            onClick={() => onChange(plantilla)}
            className="rounded border px-2 py-1 hover:bg-muted disabled:opacity-50"
            title="Vuelve a los permisos que define el cargo"
          >
            Restaurar plantilla del cargo
          </button>
        )}
      </div>

      <div className="divide-y rounded-lg border">
        {STAFF_MODULOS.map((modulo) => {
          const Icono = MODULO_ICONOS[modulo];
          return (
            <div key={modulo} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                {Icono ? <Icono className="h-4 w-4 text-muted-foreground" aria-hidden /> : null}
                {MODULO_LABELS[modulo]}
              </span>
              <select
                value={nivelDeModulo(modulo)}
                disabled={disabled}
                onChange={(e) => cambiar(modulo, e.target.value)}
                aria-label={`Nivel de acceso en ${MODULO_LABELS[modulo]}`}
                className="rounded border bg-background px-2 py-1 text-sm disabled:opacity-50"
              >
                <option value={SIN_ACCESO}>Sin acceso</option>
                {NIVELES_PERMISO.map((nivel) => (
                  <option key={nivel} value={nivel}>
                    {NIVEL_LABELS[nivel]}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Los niveles son acumulativos: <strong>Control total</strong> incluye edición, y edición
        incluye lectura. En <strong>TI</strong> no existe un punto intermedio seguro —cambiar una
        contraseña ajena es apropiarse de la cuenta—, así que solo son útiles «Solo lectura» (para
        auditar) y «Control total».
      </p>
    </div>
  );
}
