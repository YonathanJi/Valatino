// packages/types/index.ts
// Tipos compartidos del dominio — match con respuestas de Supabase (snake_case)
// NOTA: no re-exportar nada de @prisma/client aquí — la web importa VALORES de
// este paquete (p.ej. STAFF_MODULOS) y arrastraría @prisma/client al bundle,
// rompiendo el build de Next (@prisma/client no está instalado en apps/web).

// ============================================================
// Tipos de dominio (snake_case = formato de respuesta de API)
// ============================================================

export type UserRole = "admin" | "asesor" | "cliente";

/** Módulos del backoffice asignables a asesores (admin tiene todos implícitamente) */
export type StaffModulo = "pedidos" | "catalogo" | "inventario";

export const STAFF_MODULOS: readonly StaffModulo[] = ["pedidos", "catalogo", "inventario"];

export type PedidoEstado =
  | "PENDIENTE_PAGO"
  | "PROCESANDO"
  | "ENVIADO"
  | "ENTREGADO"
  | "CANCELADO"
  | "REEMBOLSADO";

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenes: string[];
  categoria: string;
  stock_disponible: number;
  stock_reservado: number;
  activo: boolean;
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  nombre: string | null;
  telefono: string | null;
  documento: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
}

export interface UserRol {
  user_id: string;
  role_id: string;
  asignado_por: string | null;
  created_at: string;
  roles?: Rol;
}

export interface DireccionEnvio {
  id: string;
  user_id: string;
  nombre_destinatario: string;
  linea1: string;
  linea2: string | null;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais: string;
  es_predeterminada: boolean;
  created_at: string;
}

export interface Pedido {
  id: string;
  /** Número legible: AAMMDD + código método de pago (01 stripe, 02 paypal) + 4 dígitos aleatorios */
  numero_pedido: string;
  user_id: string | null;
  estado: PedidoEstado;
  total: number;
  metodo_pago: string;
  referencia_pago: string | null;
  direccion_envio_id: string | null;
  email_cliente: string | null;
  documento_cliente: string | null;
  envio_nombre: string | null;
  envio_linea1: string | null;
  envio_linea2: string | null;
  envio_ciudad: string | null;
  envio_codigo_postal: string | null;
  envio_provincia: string | null;
  envio_pais: string | null;
  created_at: string;
  updated_at: string;
  pedido_items?: PedidoItem[];
}

/** Snapshot de dirección para checkout de invitados (sin cuenta) */
export interface DireccionSnapshot {
  nombre_destinatario: string;
  linea1: string;
  linea2?: string | null;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais?: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Módulos otorgados (solo asesores; admin tiene acceso implícito a todos) */
  modulos?: StaffModulo[];
  session_id?: string;
  iat: number;
  exp: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface CarritoConItems {
  id: string;
  items: CarritoItemDetalle[];
  total: number;
}

export interface CarritoItemDetalle {
  id: string;
  productoId: string;
  nombre: string;
  imagenes: string[];
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface ReservaCheckout {
  productoId: string;
  cantidad: number;
  expiresAt: string;
}

export interface ReservaCheckoutResponse {
  reservas: ReservaCheckout[];
  expiresAt: string;
}
