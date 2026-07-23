"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONOS } from "@lib/backoffice/iconos";

export interface SidebarNavItem {
  href: string;
  label: string;
  /** Clave del icono en NAV_ICONOS (serializable server → client). */
  iconKey?: string;
  /** Subenlaces visibles solo cuando la ruta actual está dentro del módulo */
  children?: { href: string; label: string; iconKey?: string }[];
}

export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  const linkCls = (activo: boolean) =>
    `relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      activo
        ? "bg-white/10 font-medium text-white"
        : "text-zinc-400 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <>
      {items.map((item) => {
        const dentroDelModulo = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const activo = dentroDelModulo && item.href === pathname;
        const Icon = item.iconKey ? NAV_ICONOS[item.iconKey] : null;
        return (
          <div key={item.href}>
            <Link href={item.href} className={linkCls(activo)}>
              {activo && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-orange-400" />
              )}
              {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
              {item.label}
            </Link>
            {item.children && dentroDelModulo && (
              <div className="mt-1 space-y-1">
                {item.children.map((child) => {
                  const childActivo =
                    pathname === child.href || pathname.startsWith(`${child.href}/`);
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
