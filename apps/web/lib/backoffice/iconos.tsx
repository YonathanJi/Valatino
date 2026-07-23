import {
  LayoutDashboard,
  ShoppingCart,
  Store,
  Boxes,
  ShoppingBag,
  Truck,
  Users,
  UserCircle,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import type { StaffModulo } from "@valatino/types";

/** Etiquetas de módulo (sin emoji; el icono va aparte). */
export const MODULO_LABELS: Record<StaffModulo, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  catalogo: "Catálogo",
  inventario: "Inventario",
  compras: "Compras",
  gestion_humana: "Gestión Humana",
};

/** Icono Lucide por módulo (chips y checkboxes de la gestión de usuarios). */
export const MODULO_ICONOS: Record<StaffModulo, LucideIcon> = {
  dashboard: LayoutDashboard,
  pedidos: ShoppingCart,
  catalogo: Store,
  inventario: Boxes,
  compras: ShoppingBag,
  gestion_humana: Briefcase,
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
  usuarios: Users,
  perfil: UserCircle,
  gestion_humana: Briefcase,
};
