"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_ICONOS } from "@lib/backoffice/iconos";
import { dentroDelModulo, desplegado } from "@lib/backoffice/navegacion";

export interface SidebarNavItem {
  href: string;
  label: string;
  /** Clave del icono en NAV_ICONOS (serializable server → client). */
  iconKey?: string;
  /** Submódulos del módulo. Se despliegan con la flecha. */
  children?: { href: string; label: string; iconKey?: string }[];
}

/**
 * El menú del panel.
 *
 * ⚠️⚠️ HASTA EL 28/08 LOS SUBMÓDULOS SOLO SE VEÍAN ESTANDO YA DENTRO DEL MÓDULO
 * (`item.children && dentroDelModulo`). Para elegir un submódulo de TI había que
 * entrar en TI primero, o sea **dos navegaciones y la primera a ciegas**: no se sabía
 * qué opciones había hasta llegar. Ahora una flecha los despliega sin moverse de la
 * página.
 *
 * ⭐ EL NOMBRE SIGUE SIENDO ENLACE Y LA FLECHA ES UN BOTÓN APARTE, y eso es deliberado:
 * los módulos tienen su propia página con contenido —`/backoffice/compras` es la lista
 * de compras, no un índice— así que esconderla detrás de un despliegue costaría un
 * clic en lo que más se usa. Con dos destinos: un clic en la flecha para **mirar**, un
 * clic en el nombre para **entrar**.
 *
 * ⚠️ El botón va FUERA del `<Link>`, no dentro. Un elemento interactivo dentro de otro
 * es HTML inválido y los lectores de pantalla no saben qué anunciar.
 *
 * La decisión de abierto/cerrado vive en `@lib/backoffice/navegacion` porque este
 * fichero es un `.tsx` y el runner de la web no tiene `jsdom`: aquí no se puede probar
 * nada. Ver la cabecera de ese módulo.
 */
export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  /**
   * Solo los módulos que la persona ha abierto o cerrado A MANO. Lo que no está aquí
   * sigue a la ruta. Ver `desplegado`: `undefined` es «no me he pronunciado», que no
   * es lo mismo que «cerrado».
   */
  const [forzados, setForzados] = useState<Record<string, boolean>>({});

  const linkCls = (activo: boolean) =>
    `relative flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      activo
        ? "bg-white/10 font-medium text-white"
        : "text-zinc-400 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <>
      {items.map((item) => {
        const dentro = dentroDelModulo(pathname, item.href);
        const activo = dentro && item.href === pathname;
        const Icon = item.iconKey ? NAV_ICONOS[item.iconKey] : null;
        const tieneHijos = Boolean(item.children?.length);
        const abierto = tieneHijos && desplegado(forzados[item.href], dentro);
        const idLista = `submodulos-${item.href.replace(/\//g, "-")}`;

        return (
          <div key={item.href}>
            <div className="flex items-center">
              <Link href={item.href} className={linkCls(activo)}>
                {activo && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-orange-400" />
                )}
                {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
                {item.label}
              </Link>

              {tieneHijos && (
                <button
                  type="button"
                  onClick={() =>
                    setForzados((antes) => ({ ...antes, [item.href]: !abierto }))
                  }
                  aria-expanded={abierto}
                  aria-controls={idLista}
                  aria-label={`${abierto ? "Ocultar" : "Mostrar"} los submódulos de ${item.label}`}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <ChevronRight
                    className={`h-4 w-4 transition-transform duration-150 ${
                      abierto ? "rotate-90" : ""
                    }`}
                  />
                </button>
              )}
            </div>

            {tieneHijos && abierto && (
              <div id={idLista} className="mt-1 space-y-1">
                {item.children?.map((child) => {
                  const childActivo = dentroDelModulo(pathname, child.href);
                  const ChildIcon = child.iconKey ? NAV_ICONOS[child.iconKey] : null;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`ml-4 flex items-center gap-2 rounded-lg border-l border-white/10 px-3 py-1.5 pl-4 text-xs transition-colors ${
                        childActivo
                          ? "font-medium text-white"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {ChildIcon && <ChildIcon className="h-4 w-4 shrink-0" />}
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
