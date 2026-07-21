"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarNavItem {
  href: string;
  label: string;
  /** Subenlaces visibles solo cuando la ruta actual está dentro del módulo */
  children?: { href: string; label: string }[];
}

export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();

  const linkCls = (activo: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
      activo ? "bg-muted font-medium" : "hover:bg-muted"
    }`;

  return (
    <>
      {items.map((item) => {
        const dentroDelModulo = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <div key={item.href}>
            <Link href={item.href} className={linkCls(dentroDelModulo && item.href === pathname)}>
              {item.label}
            </Link>
            {item.children && dentroDelModulo && (
              <div className="mt-1 space-y-1">
                {item.children.map((child) => {
                  const activo =
                    pathname === child.href || pathname.startsWith(`${child.href}/`);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`${linkCls(activo)} ml-4 pl-4 border-l text-xs`}
                    >
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
