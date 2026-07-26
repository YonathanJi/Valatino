import { NIVEL_LABELS } from "@valatino/types";
import type { PermisoModulo } from "@valatino/types";
import { MODULO_ICONOS, MODULO_LABELS, NIVEL_CLASES } from "@lib/backoffice/iconos";

/**
 * Un módulo otorgado, con el alcance a la vista. El nivel se muestra siempre:
 * saber que alguien «tiene Pedidos» ya no dice nada por sí solo.
 */
export function ChipPermiso({ permiso }: { permiso: PermisoModulo }) {
  const Icono = MODULO_ICONOS[permiso.modulo];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${NIVEL_CLASES[permiso.nivel]}`}
    >
      {Icono ? <Icono className="h-3.5 w-3.5" aria-hidden /> : null}
      {MODULO_LABELS[permiso.modulo] ?? permiso.modulo}
      <span className="opacity-70">·</span>
      {NIVEL_LABELS[permiso.nivel]}
    </span>
  );
}

/** Lista de chips con su vacío: «sin acceso» es información, no un hueco. */
export function ListaPermisos({
  permisos,
  vacio = "Sin acceso a ningún módulo",
}: {
  permisos: PermisoModulo[];
  vacio?: string;
}) {
  if (permisos.length === 0) {
    return <span className="text-xs text-muted-foreground">{vacio}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {permisos.map((p) => (
        <ChipPermiso key={p.modulo} permiso={p} />
      ))}
    </div>
  );
}
