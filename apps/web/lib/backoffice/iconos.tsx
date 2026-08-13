import {
  Boxes,
  Briefcase,
  Calculator,
  Cpu,
  FileText,
  LayoutDashboard,
  Percent,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  UserCircle,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { NivelPermiso, StaffModulo } from "@valatino/types";

/** Etiquetas de módulo (sin emoji; el icono va aparte). */
export const MODULO_LABELS: Record<StaffModulo, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  catalogo: "Catálogo",
  inventario: "Inventario",
  compras: "Compras",
  clientes: "Clientes",
  contabilidad: "Contabilidad",
  gestion_humana: "Gestión Humana",
  ti: "TI",
};

/** Icono Lucide por módulo (chips y selector de permisos). */
export const MODULO_ICONOS: Record<StaffModulo, LucideIcon> = {
  dashboard: LayoutDashboard,
  pedidos: ShoppingCart,
  catalogo: Store,
  inventario: Boxes,
  compras: ShoppingBag,
  clientes: UsersRound,
  contabilidad: Calculator,
  gestion_humana: Briefcase,
  ti: Cpu,
};

/**
 * Color del chip de nivel. `total` va en ámbar y NO en rojo: el rojo se lee
 * como error o peligro, y aquí lo que se comunica es un privilegio mayor.
 */
export const NIVEL_CLASES: Record<NivelPermiso, string> = {
  lectura: "bg-muted text-muted-foreground",
  edicion: "bg-blue-100 text-blue-700",
  total: "bg-amber-100 text-amber-800",
};

/**
 * Iconos de la navegación lateral, indexados por una clave serializable
 * (el layout es server component y no puede pasar componentes como props).
 */
export const NAV_ICONOS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  pedidos: ShoppingCart,
  catalogo: Store,
  inventario: Boxes,
  compras: ShoppingBag,
  proveedores: Truck,
  clientes: UsersRound,
  contabilidad: Calculator,
  // Submódulos de Contabilidad: la liquidación (modelo 303) y el libro de
  // facturas expedidas.
  iva: Percent,
  facturas: FileText,
  usuarios: Users,
  cargos: ShieldCheck,
  ajustes: Settings,
  perfil: UserCircle,
  gestion_humana: Briefcase,
  ti: Cpu,
};
