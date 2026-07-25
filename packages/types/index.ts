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
export type StaffModulo =
  | "pedidos"
  | "catalogo"
  | "inventario"
  | "dashboard"
  | "compras"
  | "clientes"
  | "gestion_humana"
  | "ti";

export const STAFF_MODULOS: readonly StaffModulo[] = [
  "pedidos",
  "catalogo",
  "inventario",
  "dashboard",
  "compras",
  "clientes",
  "gestion_humana",
  "ti",
];

/**
 * Categorías fijas del catálogo (selector del backoffice + validación API).
 * Salsas y Licores estaban en los datos desde el seed pero faltaban aquí, así
 * que el selector no las ofrecía y @IsIn rechazaba el PATCH: esos productos no
 * se podían editar sin cambiarles la categoría.
 */
export const CATEGORIAS_PRODUCTO = [
  "Dulces",
  "Galletas",
  "Bebidas",
  "Snacks",
  "Café",
  "Salsas",
  "Licores",
  "Despensa",
] as const;

export type CategoriaProducto = (typeof CATEGORIAS_PRODUCTO)[number];

export type PedidoEstado =
  | "PENDIENTE_PAGO"
  | "PROCESANDO"
  | "ENVIADO"
  | "ENTREGADO"
  | "CANCELADO"
  | "REEMBOLSADO";

export const PEDIDO_ESTADOS: readonly PedidoEstado[] = [
  "PENDIENTE_PAGO",
  "PROCESANDO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
  "REEMBOLSADO",
];

/** Etiqueta legible de cada estado (misma en storefront y backoffice) */
export const PEDIDO_ESTADO_LABELS: Record<PedidoEstado, string> = {
  PENDIENTE_PAGO: "Pendiente de pago",
  PROCESANDO: "Procesando",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
  REEMBOLSADO: "Reembolsado",
};

/**
 * Máquina de estados del pedido. Fuente ÚNICA: la API la usa para autorizar la
 * transición y el backoffice para ofrecer solo las que van a funcionar. Estaba
 * duplicada a mano en EstadoSelector y ya había divergido (le faltaba
 * REEMBOLSADO y ofrecía CANCELADO a los asesores, que no pueden ejecutarlo).
 *
 * REEMBOLSADO no aparece como destino a propósito: no es un estado que se
 * teclee, es la consecuencia de haber devuelto el dinero. Se alcanza por
 * POST /admin/pedidos/:id/reembolso (que cobra en Stripe) o por el webhook
 * charge.refunded si el reembolso se hizo desde el panel de Stripe. Cuando
 * estaba aquí, elegirlo en el desplegable marcaba el pedido como reembolsado
 * sin mover un euro.
 */
export const TRANSICIONES_PEDIDO: Record<PedidoEstado, PedidoEstado[]> = {
  PENDIENTE_PAGO: ["PROCESANDO", "CANCELADO"],
  PROCESANDO: ["ENVIADO", "CANCELADO"],
  ENVIADO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADO: [],
  REEMBOLSADO: [],
};

/**
 * El asesor solo avanza el envío: cancelar queda para el admin (y reembolsar
 * ya no es una transición para nadie). Solo se listan los estados en los que
 * difiere del admin, para que añadir una transición nueva no obligue a
 * recordar tocar las dos tablas.
 */
export const TRANSICIONES_PEDIDO_ASESOR: Record<PedidoEstado, PedidoEstado[]> = {
  ...TRANSICIONES_PEDIDO,
  PENDIENTE_PAGO: ["PROCESANDO"],
  PROCESANDO: ["ENVIADO"],
};

/**
 * Estados en los que el dinero está cobrado y por tanto se puede devolver.
 * PENDIENTE_PAGO no tiene cobro y CANCELADO/REEMBOLSADO ya no tienen nada
 * pendiente de devolver.
 */
export const ESTADOS_REEMBOLSABLES: readonly PedidoEstado[] = [
  "PROCESANDO",
  "ENVIADO",
  "ENTREGADO",
];

export function transicionesPermitidas(
  estado: PedidoEstado,
  rol: "admin" | "asesor",
): PedidoEstado[] {
  const tabla = rol === "admin" ? TRANSICIONES_PEDIDO : TRANSICIONES_PEDIDO_ASESOR;
  return tabla[estado] ?? [];
}

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

/**
 * Cliente de la tienda tal y como lo lista el backoffice.
 *
 * `nombre` y `documento` pueden venir del pedido más reciente en lugar del
 * perfil: el registro es por OTP y solo captura el email, así que `profiles`
 * suele tenerlos vacíos.
 *
 * `tiene_cuenta = false` es quien compró como invitado y nunca se registró: no
 * tiene `user_id`, se identifica por email y no admite edición ni borrado.
 */
export interface Cliente {
  user_id: string | null;
  email: string;
  nombre: string | null;
  telefono: string | null;
  documento: string | null;
  tiene_cuenta: boolean;
  cliente_desde: string;
  pedidos: number;
  total_gastado: number;
  ultimo_pedido: string | null;
}

/** Ficha de un cliente con cuenta: sus datos, pedidos y direcciones guardadas */
export interface ClienteDetalle {
  cliente: Cliente;
  pedidos: Pedido[];
  direcciones: DireccionEnvio[];
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
  /**
   * Importe ya devuelto al cliente, acumulado. Lo calcula la API a partir de
   * transacciones_pago; no es una columna de `pedidos`. Ausente en los
   * listados del storefront.
   */
  total_reembolsado?: number;
}

/** Resultado de devolver dinero de un pedido (POST /admin/pedidos/:id/reembolso) */
export interface ResultadoReembolso {
  pedido_id: string;
  /** Lo devuelto en esta operación */
  importe: number;
  /** Lo devuelto en total, contando reembolsos anteriores */
  total_reembolsado: number;
  /** Si con esto se ha devuelto el pedido completo */
  es_total: boolean;
  estado: PedidoEstado;
  /** Unidades repuestas al inventario (solo en reembolso total) */
  stock_repuesto: boolean;
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

// ============================================================
// Dashboard gerencial (backoffice, solo admin)
// ============================================================

export interface DashboardVentaDia {
  /** Fecha en formato YYYY-MM-DD */
  fecha: string;
  ingresos: number;
  pedidos: number;
}

export interface DashboardTopProducto {
  nombre: string;
  unidades: number;
  ingresos: number;
}

export interface DashboardEstadoCount {
  estado: PedidoEstado;
  cantidad: number;
}

export interface DashboardStockBajo {
  id: string;
  nombre: string;
  stock_disponible: number;
  stock_reservado: number;
}

export interface DashboardGerencial {
  /** Ingresos de pedidos pagados (PROCESANDO/ENVIADO/ENTREGADO) últimos 30 días */
  ingresos30d: number;
  pedidos30d: number;
  ticketMedio30d: number;
  clientesTotal: number;
  /** Serie diaria de los últimos 30 días (incluye días a cero) */
  ventasPorDia: DashboardVentaDia[];
  /** Top 5 por unidades vendidas (últimos 30 días) */
  topProductos: DashboardTopProducto[];
  /** Recuento histórico de pedidos por estado */
  pedidosPorEstado: DashboardEstadoCount[];
  /** Productos activos con 5 o menos unidades disponibles */
  stockBajo: DashboardStockBajo[];
}

// ============================================================
// Compras de mercancía (entrada documentada con factura) y proveedores
// ============================================================

export interface Proveedor {
  id: string;
  /** CIF/NIF normalizado (mayúsculas, sin espacios ni guiones) */
  cif: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Tipos de IVA admitidos en las líneas de compra */
export const IVA_PORCENTAJES = [4, 10, 21] as const;
export type IvaPorcentaje = (typeof IVA_PORCENTAJES)[number];

export interface FacturaCompraItem {
  id: string;
  factura_id: string;
  producto_id: string;
  /** Snapshot del nombre en el momento de registrar la compra */
  nombre_producto: string;
  cantidad: number;
  /** Costo unitario de compra sin IVA (null en compras anteriores a 2026-07-18) */
  costo_unitario: number | null;
  /** Tipo de IVA de la línea: 4, 10 o 21 (null en compras antiguas) */
  iva_pct: number | null;
}

export interface FacturaCompra {
  id: string;
  numero_factura: string | null;
  /** Snapshot del nombre del proveedor (histórico) */
  proveedor: string | null;
  proveedor_id: string | null;
  notas: string | null;
  /** Ruta del PDF en el bucket privado 'facturas' (se consulta vía URL firmada) */
  pdf_path: string;
  total_unidades: number;
  /** Base imponible (sin IVA): Σ cantidad × costo_unitario, calculada en la transacción */
  total: number | null;
  /** Cuota de IVA calculada por línea (null en compras antiguas) */
  total_iva: number | null;
  /** Base + IVA (null en compras antiguas) */
  total_con_iva: number | null;
  creado_por: string | null;
  created_at: string;
  items?: FacturaCompraItem[];
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

// ============================================================
// Gestión Humana (RRHH)
// ============================================================

/** Tipos de contratación (contexto España). Deben coincidir con el CHECK de BD. */
export const TIPOS_CONTRATACION = [
  "Indefinido",
  "Temporal",
  "Prácticas",
  "Formación en alternancia",
  "Fijo discontinuo",
  "Autónomo/Mercantil",
] as const;

export type TipoContratacion = (typeof TIPOS_CONTRATACION)[number];

/** Cargo/rol de RRHH con identificador único (codigo). */
export interface Cargo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
}

export interface Empleado {
  id: string;
  /** Nº correlativo estable e inmutable (BD, identity). */
  numero_empleado: number;
  /** Código legible derivado del número: "EMP-0001". Único e inmutable. */
  codigo_empleado: string;
  /** Cuenta de acceso vinculada. null = pendiente de que TI la provisione. */
  user_id: string | null;
  nombre_completo: string;
  documento: string;
  telefono: string | null;
  correo_personal: string | null;
  correo_empresa: string;
  cargo_id: string;
  tipo_contratacion: TipoContratacion;
  fecha_vinculacion: string;
  fecha_desvinculacion: string | null;
  salario: number | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
  /** Datos del cargo (join de conveniencia en listados/detalle). */
  cargo_codigo?: string;
  cargo_nombre?: string;
}

/** Snapshot mensual del estado de un empleado. */
export interface EmpleadoHistorialMensual {
  id: string;
  empleado_id: string;
  codigo_empleado: string | null;
  anio: number;
  mes: number;
  nombre_completo: string;
  cargo_id: string | null;
  cargo_codigo: string | null;
  cargo_nombre: string | null;
  tipo_contratacion: string | null;
  correo_empresa: string | null;
  salario: number | null;
  activo: boolean;
  fecha_vinculacion: string | null;
  generado_at: string;
}

/** Cuenta de acceso (staff) enlazable a un empleado. */
export interface CuentaVinculable {
  user_id: string;
  email: string | null;
  nombre: string | null;
}
