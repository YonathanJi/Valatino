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
  | "contabilidad"
  | "gestion_humana"
  | "ti";

export const STAFF_MODULOS: readonly StaffModulo[] = [
  "pedidos",
  "catalogo",
  "inventario",
  "dashboard",
  "compras",
  "clientes",
  "contabilidad",
  "gestion_humana",
  "ti",
];

/**
 * Con cuánto alcance se otorga un módulo. Tener el módulo ya no significa poder
 * hacer todo lo que contiene: un Director Administrativo consulta compras sin
 * poder tocarlas, y reembolsar exige `total` aunque el módulo de pedidos se
 * tenga en `edicion`.
 *
 * - `lectura` — consultar. No escribe en la base de datos ni fuera.
 * - `edicion` — el día a día: crear y modificar. Reversible o corregible.
 * - `total`   — irreversible, destructivo, con efecto económico, o que toca
 *               credenciales y permisos.
 */
export type NivelPermiso = "lectura" | "edicion" | "total";

/** Orden de menor a mayor alcance; es también el orden en que se ofrecen. */
export const NIVELES_PERMISO: readonly NivelPermiso[] = ["lectura", "edicion", "total"];

export const NIVEL_LABELS: Record<NivelPermiso, string> = {
  lectura: "Solo lectura",
  edicion: "Edición",
  total: "Control total",
};

const ORDEN_NIVEL: Record<NivelPermiso, number> = { lectura: 1, edicion: 2, total: 3 };

export interface PermisoModulo {
  modulo: StaffModulo;
  nivel: NivelPermiso;
}

/**
 * ¿El nivel que tiene alguien cubre el que exige una acción? Los niveles son
 * acumulativos: `total` incluye `edicion`, que incluye `lectura`.
 *
 * Ausencia de nivel (no tiene el módulo) es siempre `false`, nunca un permiso
 * por defecto.
 */
export function nivelAlcanza(
  actual: NivelPermiso | null | undefined,
  requerido: NivelPermiso,
): boolean {
  if (actual == null) return false;
  return ORDEN_NIVEL[actual] >= ORDEN_NIVEL[requerido];
}

/** Nivel otorgado en un módulo, o null si no lo tiene. */
export function nivelDe(
  permisos: PermisoModulo[] | undefined,
  modulo: StaffModulo,
): NivelPermiso | null {
  return permisos?.find((p) => p.modulo === modulo)?.nivel ?? null;
}

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
 * Con nivel `edicion` solo se avanza el envío: cancelar exige `total`, igual
 * que reembolsar. Solo se listan los estados en los que difiere de la tabla
 * completa, para que añadir una transición nueva no obligue a recordar tocar
 * las dos.
 */
export const TRANSICIONES_PEDIDO_EDICION: Record<PedidoEstado, PedidoEstado[]> = {
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

/**
 * Transiciones que puede ejecutar quien tiene ese nivel en el módulo `pedidos`.
 *
 * `lectura` devuelve la lista vacía: es un caso que antes no existía —no había
 * forma de ver pedidos sin poder moverlos— y que ahora sí, así que el
 * desplegable de estado tiene que quedarse sin opciones para esas cuentas.
 */
export function transicionesPermitidas(
  estado: PedidoEstado,
  nivel: NivelPermiso,
  /**
   * Cómo se paga el pedido. Solo importa en `transferencia`: ver abajo.
   */
  metodoPago?: string,
): PedidoEstado[] {
  if (nivel === "lectura") return [];

  /*
   * ⚠️ Un pedido por TRANSFERENCIA pendiente de pago no se mueve a mano.
   *
   * El desplegable ofrecía «Pendiente de pago → Procesando», y usarlo pondría
   * el pedido en marcha SIN HABER COBRADO: se saltaría el consumo de la reserva
   * de stock (que seguiría viva hasta vencer, y entonces el cron devolvería
   * unidades de un pedido que ya se está preparando) y el correo que le dice al
   * cliente que su dinero llegó.
   *
   * La única forma de avanzarlo es «Pago recibido», que es
   * `confirmar_pago_transferencia` y hace las tres cosas a la vez. Cancelar sí
   * se permite —hay que poder cerrar el pedido de quien dice que no va a
   * pagar—, y al hacerlo se liberan sus reservas (migración 051).
   */
  if (estado === "PENDIENTE_PAGO" && metodoPago === "transferencia") {
    return nivel === "total" ? ["CANCELADO"] : [];
  }

  const tabla = nivel === "total" ? TRANSICIONES_PEDIDO : TRANSICIONES_PEDIDO_EDICION;
  return tabla[estado] ?? [];
}

// ============================================================
// Direcciones: provincias y código postal
// ============================================================

/**
 * Las 52 provincias con su código oficial del INE.
 *
 * Los nombres van **literales del INE**, con el artículo invertido incluido
 * («Rioja, La», «Coruña, A»). Se eligió no darles la vuelta porque la misma
 * regla habría que aplicarla a los municipios, y ahí hay nombres compuestos con
 * coma de verdad —«Cruïlles, Monells i Sant Sadurní de l'Heura»— que una regla
 * de «mover lo que va tras la última coma» destrozaría en silencio. Un dato
 * oficial usado tal cual no tiene ese riesgo y además casa con cualquier fuente
 * del INE sin traducción por medio.
 */
export const PROVINCIAS_ES: readonly { codigo: string; nombre: string }[] = [
  { codigo: "01", nombre: "Araba/Álava" },
  { codigo: "02", nombre: "Albacete" },
  { codigo: "03", nombre: "Alicante/Alacant" },
  { codigo: "04", nombre: "Almería" },
  { codigo: "05", nombre: "Ávila" },
  { codigo: "06", nombre: "Badajoz" },
  { codigo: "07", nombre: "Balears, Illes" },
  { codigo: "08", nombre: "Barcelona" },
  { codigo: "09", nombre: "Burgos" },
  { codigo: "10", nombre: "Cáceres" },
  { codigo: "11", nombre: "Cádiz" },
  { codigo: "12", nombre: "Castellón/Castelló" },
  { codigo: "13", nombre: "Ciudad Real" },
  { codigo: "14", nombre: "Córdoba" },
  { codigo: "15", nombre: "Coruña, A" },
  { codigo: "16", nombre: "Cuenca" },
  { codigo: "17", nombre: "Girona" },
  { codigo: "18", nombre: "Granada" },
  { codigo: "19", nombre: "Guadalajara" },
  { codigo: "20", nombre: "Gipuzkoa" },
  { codigo: "21", nombre: "Huelva" },
  { codigo: "22", nombre: "Huesca" },
  { codigo: "23", nombre: "Jaén" },
  { codigo: "24", nombre: "León" },
  { codigo: "25", nombre: "Lleida" },
  { codigo: "26", nombre: "Rioja, La" },
  { codigo: "27", nombre: "Lugo" },
  { codigo: "28", nombre: "Madrid" },
  { codigo: "29", nombre: "Málaga" },
  { codigo: "30", nombre: "Murcia" },
  { codigo: "31", nombre: "Navarra" },
  { codigo: "32", nombre: "Ourense" },
  { codigo: "33", nombre: "Asturias" },
  { codigo: "34", nombre: "Palencia" },
  { codigo: "35", nombre: "Palmas, Las" },
  { codigo: "36", nombre: "Pontevedra" },
  { codigo: "37", nombre: "Salamanca" },
  { codigo: "38", nombre: "Santa Cruz de Tenerife" },
  { codigo: "39", nombre: "Cantabria" },
  { codigo: "40", nombre: "Segovia" },
  { codigo: "41", nombre: "Sevilla" },
  { codigo: "42", nombre: "Soria" },
  { codigo: "43", nombre: "Tarragona" },
  { codigo: "44", nombre: "Teruel" },
  { codigo: "45", nombre: "Toledo" },
  { codigo: "46", nombre: "Valencia/València" },
  { codigo: "47", nombre: "Valladolid" },
  { codigo: "48", nombre: "Bizkaia" },
  { codigo: "49", nombre: "Zamora" },
  { codigo: "50", nombre: "Zaragoza" },
  { codigo: "51", nombre: "Ceuta" },
  { codigo: "52", nombre: "Melilla" },
];

const PROVINCIA_POR_CODIGO = new Map(PROVINCIAS_ES.map((p) => [p.codigo, p.nombre]));

/** Código postal español: 5 dígitos cuyos dos primeros son una provincia real. */
export function codigoPostalValido(cp: string): boolean {
  const limpio = cp.trim();
  if (!/^\d{5}$/.test(limpio)) return false;
  return PROVINCIA_POR_CODIGO.has(limpio.slice(0, 2));
}

/**
 * Provincia a la que pertenece un código postal, o `null` si el CP no es válido.
 *
 * Los dos primeros dígitos del CP español **son** el código de provincia, así
 * que la provincia no hace falta preguntarla: se deduce. Eso convierte el campo
 * en un dato derivado y elimina de raíz el «españa» escrito a mano.
 */
export function provinciaPorCP(cp: string): string | null {
  if (!codigoPostalValido(cp)) return null;
  return PROVINCIA_POR_CODIGO.get(cp.trim().slice(0, 2)) ?? null;
}

/** Nombre oficial de una provincia por su código de 2 dígitos. */
export function provinciaPorCodigo(codigo: string): string | null {
  return PROVINCIA_POR_CODIGO.get(codigo) ?? null;
}

// ============================================================
// Teléfono de contacto
// ============================================================

/**
 * Teléfono español, ya normalizado: 9 dígitos que empiezan por 6 o 7 (móvil) u
 * 8 o 9 (fijo). La tienda solo envía a España (`pais` es 'ES' fijo y el
 * formulario no ofrece otro país), así que la regla se ceñe a eso en vez de
 * aceptar cualquier cosa con pinta de número.
 */
const TELEFONO_ES_REGEX = /^[6789]\d{8}$/;

/**
 * Deja el teléfono como se guarda: 9 dígitos y nada más.
 *
 * Se aceptan al teclear los espacios, puntos y guiones con los que la gente
 * escribe su número, y el prefijo `+34` / `0034`. Guardar la variante tecleada
 * llenaría la columna de «600 11 22 33», «+34600112233» y «600-11-22-33» para
 * el mismo número, que es exactamente el ruido que ya ensució las direcciones.
 */
export function normalizarTelefono(valor: string): string {
  const soloDigitos = valor.replace(/[\s.\-()]/g, "").replace(/^\+/, "");
  if (soloDigitos.startsWith("0034")) return soloDigitos.slice(4);
  if (soloDigitos.startsWith("34") && soloDigitos.length === 11) return soloDigitos.slice(2);
  return soloDigitos;
}

/** ¿Es un teléfono español válido? Normaliza antes, así que acepta `+34 600…`. */
export function telefonoValido(valor: string): boolean {
  return TELEFONO_ES_REGEX.test(normalizarTelefono(valor));
}

/** `600112233` → `600 11 22 33`. Solo para mostrar; en BD van los 9 dígitos. */
export function formatearTelefono(valor: string | null | undefined): string {
  if (!valor) return "";
  const n = normalizarTelefono(valor);
  if (!TELEFONO_ES_REGEX.test(n)) return valor;
  return `${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
}

/* ────────────────────────── NIF · CIF · NIE ───────────────────────────────
 * Aquí y no en la API por lo mismo que el teléfono: la BD comprueba la FORMA
 * (migración 073, `nif_forma_valida`) y el dígito de control se comprueba una
 * sola vez, en un sitio que web y API comparten. Dos copias de esta aritmética
 * se desincronizan.
 *
 * ⚠️ Y una advertencia sobre el equilibrio: aquí **rechazar algo válido es peor
 * que aceptar algo inválido**. Si esto se equivoca con el CIF de una empresa
 * real, Jonathan no puede emitirle su factura y no hay forma de saltárselo. Un
 * dígito malo, en cambio, se corrige emitiendo una rectificativa. Por eso,
 * cuando la letra inicial de un CIF admite las dos formas de control, se
 * aceptan las dos.
 */

/** Quita espacios, guiones y puntos, y sube a mayúsculas. */
export function normalizarNif(valor: string): string {
  return valor.replace(/[\s.\-]/g, "").toUpperCase();
}

const DNI_LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
/** Para el control en letra de un CIF: índice 0 → J, 1 → A, … */
const CIF_LETRAS = "JABCDEFGHI";

/** Letra que le toca a 8 cifras. Vale para DNI y, tras traducir, para NIE. */
function letraDeOchoCifras(cifras: string): string {
  return DNI_LETRAS[Number(cifras) % 23]!;
}

function dniValido(nif: string): boolean {
  return letraDeOchoCifras(nif.slice(0, 8)) === nif[8];
}

function nieValido(nif: string): boolean {
  // X → 0, Y → 1, Z → 2, y a partir de ahí es un DNI.
  const prefijo = "XYZ".indexOf(nif[0]!);
  return letraDeOchoCifras(`${prefijo}${nif.slice(1, 8)}`) === nif[8];
}

function cifValido(nif: string): boolean {
  const inicial = nif[0]!;
  const cifras = nif.slice(1, 8);
  const control = nif[8]!;

  // Posiciones pares (2ª, 4ª, 6ª) tal cual; impares dobladas y con sus dígitos
  // sumados —doblar 8 da 16, y lo que suma es 7—.
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(cifras[i]);
    if (i % 2 === 1) {
      suma += d;
    } else {
      const doble = d * 2;
      suma += doble > 9 ? doble - 9 : doble;
    }
  }

  const resto = (10 - (suma % 10)) % 10;
  const enCifra = String(resto);
  const enLetra = CIF_LETRAS[resto]!;

  // Las entidades sin ánimo de lucro y los organismos llevan letra; las
  // sociedades, cifra. El resto admite las dos, y ahí se aceptan las dos.
  if ("PQRSNW".includes(inicial)) return control === enLetra;
  if ("ABEH".includes(inicial)) return control === enCifra;
  return control === enCifra || control === enLetra;
}

/**
 * Comprueba forma **y dígito de control** de un NIF, NIE o CIF español.
 *
 * La forma tiene que coincidir con la de `nif_forma_valida` en la BD: si esta
 * función acepta algo que el CHECK rechaza, el error saldría de Postgres sin
 * explicación en vez de del formulario con una.
 */
export function nifValido(valor: string): boolean {
  const nif = normalizarNif(valor);

  if (/^[0-9]{8}[A-Z]$/.test(nif)) return dniValido(nif);
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(nif)) return nieValido(nif);
  if (/^[A-HJNP-SUVW][0-9]{7}[0-9A-J]$/.test(nif)) return cifValido(nif);

  return false;
}

/**
 * Cómo se llama la diferencia entre dos presentaciones del mismo artículo. Solo
 * afecta al texto del selector: «Formato: C/U» o «Sabor: Fresa».
 */
export const TIPOS_VARIANTE = ["sabor", "formato"] as const;
export type TipoVariante = (typeof TIPOS_VARIANTE)[number];

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** PVP **con IVA incluido**: es el precio final que ve el cliente */
  precio: number;
  /**
   * Tipo de IVA con el que se vende (migración 062). Sin esto el IVA
   * repercutido de un pedido no es calculable, y sin él no hay modelo 303.
   *
   * Cambiarlo NO reescribe pedidos ya hechos: la línea guarda su propia copia.
   */
  iva_pct: IvaPorcentaje;
  imagenes: string[];
  categoria: string;
  stock_disponible: number;
  stock_reservado: number;
  activo: boolean;
  slug: string | null;
  /**
   * Agrupa presentaciones del mismo artículo —«Quipitos Pops» para la caja y la
   * unidad—, y es el título que ve el cliente. `null` = producto suelto.
   *
   * Vive en su propia columna y **no se deduce del nombre** (migración 057): el
   * nombre es del negocio, y obligar a llamar «Quipitos Formato C/U» a algo que
   * se llama «Quipitos Pops C/U» era hacerlo al revés.
   */
  familia: string | null;
  /** Etiqueta de esta presentación en el selector: «C/U», «Caja 24 unidades» */
  variante: string | null;
  variante_tipo: TipoVariante | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resultado de abrir bultos para vender unidades sueltas
 * (RPC `desempaquetar_producto`, migración 056).
 *
 * Caja y unidad son productos independientes con stock propio; esto registra la
 * conversión que ocurre físicamente al abrir la caja. Devuelve el stock de los
 * dos lados para poder confirmarlo en pantalla sin volver a preguntar.
 */
export interface ResultadoDesempaquetado {
  origen_nombre: string;
  destino_nombre: string;
  bultos: number;
  unidades_generadas: number;
  origen_stock: number;
  destino_stock: number;
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
  /**
   * Teléfono de contacto para la entrega, 9 dígitos. Nullable porque las
   * direcciones creadas antes de la 040 no lo tienen; en las nuevas se exige.
   */
  telefono: string | null;
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
  /** Teléfono de contacto del envío, copiado al pedido igual que el resto de `envio_*`. */
  envio_telefono: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Cuándo se devengó el IVA de esta venta, o `null` si todavía no ha ocurrido
   * (migración 068).
   *
   * ⚠️⚠️ **ES EL ÚNICO SIGNO DE «ESTA VENTA EXISTE FISCALMENTE», y no se deduce
   * del estado.** Un pedido tiene fecha de devengo si y solo si el cobro ocurrió,
   * así que los `PENDIENTE_PAGO` y los cancelados antes de cobrar quedan fuera
   * solos — sin que nadie tenga que enumerar qué estados cuentan. Por eso el 303
   * liquida por esta columna y no por `created_at` ni por `estado`, y por eso la
   * ficha del pedido decide con ella si tiene sentido hablar de facturas.
   *
   * Si necesitas saber si algo es facturable, mira esto. Cualquier lista de
   * estados que escribas aparte será una segunda regla que algún día discrepe.
   */
  devengado_el?: string | null;
  pedido_items?: PedidoItem[];
  /**
   * Importe ya devuelto al cliente, acumulado. Lo calcula la API a partir de
   * transacciones_pago; no es una columna de `pedidos`. Ausente en los
   * listados del storefront.
   */
  total_reembolsado?: number;
  /** Forma de pago concreta según la pasarela (`card`, `bizum`…). */
  metodo_detalle?: string | null;
  /**
   * Número del pedido que sustituyó a este cuando el cliente cambió de forma de
   * pago, y el inverso. Los rellena el panel para poder contar la historia sin
   * fusionar los dos pedidos —que sería reescribir un documento comercial: el
   * cancelado tuvo número propio y ese número se le dio al cliente como
   * concepto de la transferencia.
   */
  reemplazado_por_numero?: string | null;
  sustituye_a_numero?: string | null;
}

// ============================================================
// Historial del pedido
// ============================================================

/**
 * `nota` es para lo que le pasa a un pedido sin ser un cambio de estado, un
 * cobro ni un correo: por ejemplo, que el cliente cambiara de forma de pago y
 * la compra continuara en otro pedido. Sin ella, esa explicación no tenía dónde
 * vivir y la línea de tiempo mostraba un «Procesando → Cancelado» sin motivo.
 */
export type TipoEventoPedido = "estado" | "pago" | "reembolso" | "email" | "nota";

/** De dónde salió el evento. `sistema` y `checkout`/`webhook` no tienen persona. */
export type OrigenEvento = "panel" | "checkout" | "webhook" | "sistema";

/**
 * Una línea de la historia del pedido. Se guarda el nombre y el correo del
 * autor como copia, no como referencia: si mañana se elimina la cuenta de un
 * asesor, el historial debe seguir diciendo que fue él.
 */
export interface PedidoEvento {
  id: string;
  pedido_id: string;
  tipo: TipoEventoPedido;
  actor_user_id: string | null;
  actor_nombre: string | null;
  actor_email: string | null;
  origen: OrigenEvento;
  estado_anterior: PedidoEstado | null;
  estado_nuevo: PedidoEstado | null;
  importe: number | null;
  /** Asunto del correo, tipo de evento de Stripe… según el tipo. */
  detalle: string | null;
  created_at: string;
}

/** Cómo se presenta cada origen cuando no hay una persona detrás. */
export const ORIGEN_LABELS: Record<OrigenEvento, string> = {
  panel: "desde el panel",
  checkout: "al confirmarse el pago",
  webhook: "aviso de la pasarela de pago",
  sistema: "automático",
};

/** Ficha completa de un pedido para el backoffice (GET /admin/pedidos/:id). */
export interface PedidoDetalle {
  pedido: Pedido;
  items: PedidoItem[];
  /**
   * Base imponible y cuota por tipo de IVA, congeladas al vender (migración
   * 062). Una entrada por tipo presente en el pedido, así que un pedido con
   * galletas y un refresco trae dos.
   *
   * ⚠️ **No se recalcula en pantalla.** Viene ya cuadrado con lo cobrado, y
   * volver a dividir aquí es abrir la puerta a que la ficha enseñe una base
   * distinta de la que se declara.
   */
  desglose_iva: DesgloseIva[];
  eventos: PedidoEvento[];
  /**
   * Lo que opinó el cliente de la compra, si la calificó. `null` en la mayoría
   * de los pedidos: es opcional a propósito.
   */
  calificacion: Calificacion | null;
  /**
   * Qué artículos se han devuelto ya, una fila por línea y devolución. Vacío en
   * los pedidos sin reembolsos y en los que se devolvieron por importe suelto
   * (antes de la 044 no había otra forma).
   */
  reembolso_lineas: ReembolsoLinea[];
  /**
   * Las facturas de esta venta, para consultarlas donde se mira el pedido.
   *
   * Normalmente una simplificada; dos si el cliente pidió la completa (entonces
   * la simplificada llega con `vigente: false`). Vacío en las ventas anteriores a
   * configurar el emisor, y eso **no es un error**: lo cuenta el aviso
   * `venta_sin_factura` del 303.
   */
  facturas: FacturaDeLaVenta[];
}

/**
 * Una factura vista desde el pedido: lo justo para consultarla y saber si cuenta.
 *
 * ⚠️⚠️ **NO LLEVA `receptor` A PROPÓSITO, Y ESO NO ES UN OLVIDO.** Este detalle lo
 * sirve `/admin/pedidos/:id` con `pedidos:lectura`, que tiene todo el equipo — y
 * el receptor son los datos FISCALES del cliente (su NIF y su domicilio), que son
 * de contabilidad. El número, el tipo y el importe son hechos del pedido y no
 * añaden nada que quien ve la ficha no viera ya; el NIF sí.
 *
 * Quien necesite el documento entero va a Contabilidad → Facturas, que exige su
 * permiso. Si algún día hace falta el receptor aquí, el sitio de decidirlo es el
 * permiso, no este tipo.
 */
export interface FacturaDeLaVenta {
  id: string;
  numero: string;
  tipo: FacturaTipo;
  fecha_expedicion: string;
  total: number;
  /**
   * Si cuenta en el libro. Una simplificada canjeada por una completa sigue
   * existiendo —una factura emitida no se anula jamás— pero deja de ser vigente,
   * o el IVA de esa venta estaría dos veces (ver la 073 §5).
   */
  vigente: boolean;
  /** El número de la que la sustituyó, cuando `vigente` es `false`. */
  sustituida_por: string | null;
}

// ============================================================
// Reembolsos
// ============================================================

/**
 * Un artículo que se devuelve, tal como lo pide el panel. Va sin importe a
 * propósito: **el precio lo pone el servidor** desde `pedido_items`, que es el
 * único sitio donde consta lo que se cobró. Si el importe viniera del navegador
 * habría que creerle, y lo que hay al otro lado es dinero saliendo.
 */
export interface LineaReembolso {
  pedido_item_id: string;
  cantidad: number;
}

/** Un artículo ya devuelto, tal como quedó registrado. Vista del backoffice. */
export interface ReembolsoLinea {
  pedido_item_id: string;
  cantidad: number;
  importe: number;
  /**
   * Si esas unidades volvieron al inventario. `false` es una decisión tomada
   * —mercancía defectuosa o perdida—, no un pendiente.
   */
  repuesto_al_stock: boolean;
  created_at: string;
}

/**
 * Un artículo devuelto **tal como se le cuenta al cliente**: qué era, cuántas
 * unidades, cuánto dinero y cuándo.
 *
 * Es un tipo aparte de `ReembolsoLinea` a propósito, y no un `Omit<>`: lo que
 * el cliente no debe ver —si la mercancía volvió al almacén, quién tramitó la
 * devolución, el identificador del cobro en Stripe— tiene que quedarse fuera
 * **por construcción**. Con un tipo derivado, añadir mañana una columna interna
 * a la tabla la publicaría sola.
 */
export interface ArticuloDevuelto {
  nombre_producto: string;
  cantidad: number;
  importe: number;
  fecha: string;
}

/**
 * Un pedido tal como lo ve su dueño en «Mis pedidos»: lo de siempre más lo que
 * se le ha devuelto.
 *
 * Hace falta porque **un reembolso parcial no cambia el estado del pedido** —
 * sigue en ENVIADO o ENTREGADO, que es lo correcto—, así que sin esto el cliente
 * no tiene ninguna forma de enterarse de que se le ha abonado dinero.
 */
export interface PedidoDeCliente extends Pedido {
  total_reembolsado: number;
  /**
   * Vacío cuando la devolución se hizo por un importe suelto o llegó desde el
   * panel de Stripe: hay dinero devuelto pero no consta de qué artículo. La
   * pantalla debe seguir diciendo el importe en ese caso.
   */
  articulos_devueltos: ArticuloDevuelto[];
}

// ============================================================
// Pago por transferencia bancaria
// ============================================================

/** Sin espacios ni guiones y en mayúsculas, que es como se guarda y se compara. */
export function normalizarIban(valor: string): string {
  return valor.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Valida un IBAN por su dígito de control (mod-97, norma ISO 13616).
 *
 * No es una comprobación cosmética: **un IBAN mal tecleado manda a los clientes
 * a transferir a ninguna parte**, y el error no se descubre hasta que alguien
 * reclama un pedido que nunca se preparó. Los dos últimos dígitos de control
 * existen justo para cazar esto, así que se comprueban antes de guardar.
 *
 * Lo que sí puede pasar aun siendo válido: que la cuenta no exista. El dígito
 * de control detecta erratas, no verifica titularidad.
 */
export function ibanValido(valor: string): boolean {
  const iban = normalizarIban(valor);
  // Entre 15 y 34 según el país; España usa 24.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  // Se mueven los cuatro primeros al final y las letras pasan a números (A=10).
  const reordenado = iban.slice(4) + iban.slice(0, 4);
  const numerico = reordenado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  // Mod 97 a trozos: el número entero no cabe en un Number sin perder precisión.
  let resto = 0;
  for (const digito of numerico) {
    resto = (resto * 10 + Number(digito)) % 97;
  }
  return resto === 1;
}

/** Agrupado de cuatro en cuatro, que es como se lee y se teclea. */
export function formatearIban(valor: string): string {
  return normalizarIban(valor).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Si la tienda acepta transferencias y con qué plazo. Lo consulta el checkout
 * para decidir si ofrece la opción.
 *
 * `disponible` es false cuando no hay cuenta configurada: sin IBAN no se puede
 * pedir a nadie que transfiera, y enseñar la opción para luego no dar dónde
 * pagar es peor que no ofrecerla.
 */
export interface DisponibilidadTransferencia {
  disponible: boolean;
  /** Días laborables que se conceden para pagar. */
  dias_plazo: number;
}

/** La cuenta de cobro tal como se edita en TI → Ajustes. */
export interface AjustesTransferencia {
  /** Agrupado de cuatro en cuatro para leerlo; se guarda sin espacios. */
  iban: string;
  titular: string;
  banco: string;
  dias_plazo: number;
  /** Si con estos datos se ofrece de verdad el método en el checkout. */
  disponible: boolean;
  /**
   * De dónde sale la cuenta que se está usando. Si es `entorno`, lo que se
   * guarde aquí no surtirá efecto hasta vaciar esas variables en Render — y
   * quien edita tiene que saberlo antes de guardar, no después.
   */
  origen: "panel" | "entorno" | "sin_configurar";
  actualizado_el: string | null;
}

/**
 * Lo que se le dice al cliente para que pueda hacer la transferencia.
 *
 * El **concepto es el número de pedido** y no es decorativo: es lo único que
 * permite casar un ingreso en el banco con un pedido. Sin él, alguien tiene que
 * adivinar de quién es cada apunte.
 */
export interface InstruccionesTransferencia {
  pedido_id: string;
  numero_pedido: string;
  importe: number;
  iban: string;
  titular: string;
  banco: string | null;
  /** Lo que el cliente debe escribir en el concepto: el número de pedido. */
  concepto: string;
  /** Hasta cuándo se guarda el pedido; pasado el plazo se cancela solo. */
  vence_el: string;
}

/** Clases de hito del seguimiento, para elegir icono y color en la pantalla. */
export type TipoHito =
  | "pedido"
  | "preparacion"
  | "envio"
  | "entrega"
  | "devolucion"
  | "cancelacion";

/**
 * Un paso de lo que le ha pasado al pedido, **contado para el cliente**.
 *
 * NO es `PedidoEvento`. El historial interno lleva quién tocó cada cosa, su
 * correo, el origen y textos de máquina (`payment_intent.succeeded`,
 * `charge.refunded`, `reembolso.backoffice`), y está dicho desde el primer día
 * que el cliente no lo ve. Esto se construye en el servidor a partir de aquello,
 * traducido y con los pasos internos fuera: lo que aquí no se pone, no viaja.
 */
export interface HitoPedido {
  tipo: TipoHito;
  titulo: string;
  /** Los artículos de una devolución, o null cuando no aplica. */
  detalle: string | null;
  importe: number | null;
  fecha: string;
}

/** Ficha del pedido para su dueño (GET /pedidos/:id). */
export interface PedidoClienteDetalle extends PedidoDeCliente {
  /** Del más antiguo al más reciente. */
  seguimiento: HitoPedido[];
  /**
   * Cómo pagar, cuando el pedido está esperando una transferencia. `null` en
   * todo lo demás. Va aquí y no en una llamada aparte porque el cliente que
   * cerró la pestaña del checkout necesita poder volver a por el IBAN y el
   * concepto: sin esto tendría el pedido reservado y ninguna forma de pagarlo.
   */
  instrucciones_pago: InstruccionesTransferencia | null;
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
  /** Si han vuelto unidades al inventario con esta devolución */
  stock_repuesto: boolean;
  /** Unidades devueltas, cuando el reembolso se hizo eligiendo artículos */
  unidades_devueltas?: number;
}

// ============================================================
// Calificación de la experiencia de compra
// ============================================================

/**
 * Esfuerzo que le costó comprar (CES). Tres niveles porque la pregunta es
 * «¿fácil o difícil?»; con más matices la gente no responde mejor, responde menos.
 */
export type EsfuerzoCompra = 1 | 2 | 3;

/** Satisfacción con la compra (CSAT), 1 a 5. */
export type SatisfaccionCompra = 1 | 2 | 3 | 4 | 5;

export const ESFUERZO_LABELS: Record<EsfuerzoCompra, string> = {
  1: "Fácil",
  2: "Regular",
  3: "Difícil",
};

export const SATISFACCION_LABELS: Record<SatisfaccionCompra, string> = {
  1: "Muy mal",
  2: "Mal",
  3: "Normal",
  4: "Bien",
  5: "Muy bien",
};

export interface Calificacion {
  pedido_id: string;
  esfuerzo: EsfuerzoCompra;
  satisfaccion: SatisfaccionCompra;
  comentario: string | null;
  created_at: string;
  updated_at: string;
}

/** Una opinión con el pedido al que pertenece, para el listado del panel. */
export interface CalificacionConPedido extends Calificacion {
  numero_pedido: string | null;
  total: number;
  envio_nombre: string | null;
  email_cliente: string | null;
}

/**
 * Resumen para el panel.
 *
 * `respuestas` y `pedidos_calificables` van juntos a propósito: una media sin su
 * tasa de respuesta miente. Un 4,8 sobre el 8 % de los pedidos no dice lo mismo
 * que un 4,8 sobre el 70 %.
 */
export interface ResumenCalificaciones {
  respuestas: number;
  /** Pedidos que PUDIERON calificarse en la ventana (los que llegaron a pagarse). */
  pedidos_calificables: number;
  esfuerzo_medio: number | null;
  satisfaccion_medio: number | null;
  faciles: number;
  regulares: number;
  dificiles: number;
  /** Satisfacción 1 o 2: los que hay que leer primero. */
  detractores: number;
}

/** Lo que devuelve el panel en `/admin/calificaciones`. */
export interface CalificacionesPanel {
  resumen: ResumenCalificaciones;
  opiniones: CalificacionConPedido[];
}

/** Tasa de respuesta en tanto por ciento, o `null` si no hubo pedidos que calificar. */
export function tasaRespuesta(r: ResumenCalificaciones): number | null {
  if (r.pedidos_calificables === 0) return null;
  return (r.respuestas / r.pedidos_calificables) * 100;
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
  /**
   * Opcional en el tipo aunque el formulario lo exija: durante una release la
   * web nueva y la API vieja conviven, y al revés. Un `telefono` obligatorio en
   * el DTO haría que un checkout servido desde la caché anterior respondiera
   * 400 al pagar, y eso es una venta perdida.
   */
  telefono?: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  /** PVP **con IVA incluido**: es lo que vio y pagó el cliente */
  precio_unitario: number;
  /**
   * El tipo de IVA que se aplicó AL VENDER, congelado como `nombre_producto`.
   *
   * Snapshot y no un join a `productos`: si Hacienda cambia un tipo —pasó con
   * el aceite, las mascarillas y la luz—, leerlo del producto reescribiría
   * facturas ya emitidas. Lo pone un trigger (migración 062).
   */
  iva_pct: IvaPorcentaje;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /**
   * Módulos otorgados con su nivel (solo asesores; el admin no lleva ninguno
   * porque es `total` en todo implícitamente). Se lee de staff_modulos en cada
   * petición, no viaja dentro del token: así quitar un permiso surte efecto al
   * instante en vez de esperar a que caduque la sesión.
   */
  modulos?: PermisoModulo[];
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

/**
 * Por qué se movió el inventario a mano (migración 063).
 *
 * `sin_indicar` existe solo para los ajustes hechos antes de que el panel
 * preguntase el motivo. No se ofrece al elegir.
 */
export const MOTIVOS_AJUSTE_STOCK = [
  "rotura",
  "merma",
  "caducidad",
  "recuento",
  "devolucion_proveedor",
  "correccion",
] as const;
export type MotivoAjusteStock = (typeof MOTIVOS_AJUSTE_STOCK)[number] | "sin_indicar";

/** Un producto cuyo stock no coincide con la suma de sus movimientos. */
export interface DescuadreStock {
  producto_id: string;
  nombre: string;
  /** Lo que dice `productos.stock_disponible` */
  stock_hoy: number;
  /** Lo que sale de compras − ventas + reposiciones ± desempaquetados + ajustes */
  deducido: number;
  stock_hoy_menos_deducido: number;
}

/**
 * Si la tienda sigue en pruebas o ya vende de verdad (migración 064).
 *
 * ⚠️ El paso a «real» es de un solo sentido: en cuanto se marca, la limpieza de
 * datos de prueba se niega a ejecutarse para siempre. Borrar ventas reales
 * destruye registros contables.
 */
export interface EstadoMantenimiento {
  en_pruebas: boolean;
  arranque_fiscal_el: string | null;
  /** Lo que se perdería al limpiar, para poder enseñarlo antes de confirmar */
  pedidos: number;
  descuadres: DescuadreStock[];
}

/** Lo que hizo la limpieza, para poder afirmarlo en pantalla y no suponerlo. */
export interface ResultadoLimpieza {
  pedidos_borrados: number;
  /**
   * Facturas emitidas borradas (migración 073).
   *
   * ⚠️ Solo puede pasar **en modo pruebas**: el trigger `trg_factura_inmutable`
   * se niega a borrar cualquier factura después del arranque fiscal, y esta
   * limpieza ya se niega a ejecutarse entera. La limpieza también reinicia los
   * contadores de serie, así que la primera factura real vuelve a arrancar en el
   * número inicial — hoy el **100** (`factura_correlativo_inicial()`, 074), no el 1.
   */
  facturas_borradas: number;
  /** Empleados dados de alta probando, con su histórico mensual (migración 067) */
  empleados_borrados: number;
  /**
   * Cuentas eliminadas: **todas las que no son `admin`** (migración 067).
   *
   * Clientes y asesores. Incluye la cuenta que TI provisiona a un empleado de
   * prueba: si se borra la ficha y se deja la cuenta, queda un asesor con
   * acceso al panel y sin nadie detrás.
   */
  cuentas_borradas: number;
  /**
   * Cuentas sin ningún rol. Es un estado anómalo (`assign_default_role` le pone
   * `cliente` a todo el que se registra), y ante algo anómalo se cuenta y no se
   * borra en silencio.
   */
  cuentas_sin_rol_sin_tocar: number;
  quedan: Record<string, number>;
  /** Solo los productos cuyo stock cambió, con el valor nuevo */
  stock_recalculado: Record<string, number>;
  descuadres_tras_limpiar: number;
  cuando: string;
}

/* ═══════════════════ Facturas emitidas (migraciones 071–073) ════════════════ */

/**
 * Los datos fiscales del negocio, tal como se editan en TI → Ajustes.
 *
 * ⚠️ Nacen vacíos y NO se siembran desde `transferencia_titular`: el titular de
 * la cuenta bancaria y la razón social se parecen lo bastante para que copiarlo
 * pareciera un acierto, y son cosas distintas. Mientras falte uno de los cinco
 * obligatorios, **no se emite ninguna factura**.
 */
export interface AjustesEmisor {
  nif: string;
  nombre: string;
  direccion: string;
  codigo_postal: string;
  ciudad: string;
  provincia: string;
  pais: string;
  /** Si con estos datos ya se puede facturar. Lo decide `emisor_fiscal()`. */
  completo: boolean;
}

/**
 * Emisor o receptor congelados dentro de una factura.
 *
 * Es un SNAPSHOT: si el negocio cambia de domicilio, las facturas ya emitidas
 * conservan el viejo. Igual que `iva_pct` en las líneas (migración 062).
 */
export interface DatosFiscales {
  nif: string;
  nombre: string;
  direccion: string;
  codigo_postal: string;
  ciudad: string;
  provincia: string | null;
  pais: string;
}

/**
 * Los tres documentos, y por qué son series distintas.
 *
 * Una serie tiene que ser correlativa **y cronológica dentro de sí misma**. Si
 * las completas compartieran serie con las simplificadas, la que un cliente pide
 * en octubre de una venta de julio recibiría un número de octubre en medio de la
 * línea de julio.
 *
 * ⚠️ Y hay una razón más, que apareció al cambiar el formato en la 074: sin serie
 * propia, **la simplificada y la completa de la misma venta imprimirían el mismo
 * número**. Además el RD 1619/2012 art. 15.2 exige serie específica para las
 * rectificativas, así que esa no se puede fundir con ninguna.
 *
 * ⚠️⚠️ La serie de cada tipo (`VALS` · `VALF` · `VALR`) y el formato del número
 * viven SOLO en la BD — `serie_de_tipo()` y `factura_numero()`, migración 074 —
 * y llegan aquí en cada fila (`FacturaEmitida.serie`, `.numero`). Aquí había un
 * `FACTURA_SERIES` que los espejaba y **no lo usaba nadie**: un espejo que nadie
 * consume es un espejo que nadie revisa cuando la BD cambia. Se quitó en la 074.
 * No lo vuelvas a añadir.
 */
export const FACTURA_TIPOS = ["simplificada", "completa", "rectificativa"] as const;
export type FacturaTipo = (typeof FACTURA_TIPOS)[number];

export const FACTURA_TIPO_LABELS: Record<FacturaTipo, string> = {
  simplificada: "Simplificada",
  completa: "Completa",
  rectificativa: "Rectificativa",
};

/** Una línea congelada de la factura. El precio va **con IVA incluido**. */
export interface FacturaLinea {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  iva_pct: number;
  importe: number;
}

/** Base y cuota por tipo, **copiadas** de `pedido_iva` y nunca recalculadas. */
export interface FacturaDesglose {
  iva_pct: number;
  base: number;
  cuota: number;
}

export interface FacturaEmitida {
  id: string;
  /**
   * El número impreso: serie + ejercicio + 5 dígitos → `VALS202600100`.
   *
   * ⚠️ **No se construye aquí ni en la API.** Es una columna generada por la BD a
   * partir de `factura_numero(serie, ejercicio, correlativo)` (074), que es la
   * misma función con la que el motor calcula el número **que entra en la
   * huella**. Antes eran dos expresiones separadas —una para imprimir y otra para
   * hashear— y el día que hubieran diferido, la cadena de Verifactu habría estado
   * certificando un número distinto del impreso, sin que nadie lo viera.
   *
   * Trátalo como opaco: para filtrar o agrupar están `serie`, `ejercicio` y
   * `correlativo`, que son las partes de verdad.
   */
  numero: string;
  tipo: FacturaTipo;
  serie: string;
  ejercicio: number;
  /** Arranca en 100, no en 1 (`factura_correlativo_inicial()`). */
  correlativo: number;

  pedido_id: string;
  /** Del pedido, para no tener que cruzarlo al listar. */
  numero_pedido: string | null;

  /**
   * ⚠️ DOS FECHAS Y HACEN FALTA LAS DOS. El IVA pertenece al trimestre de la
   * **operación**, así que emitir con retraso no mueve el trimestre.
   */
  fecha_expedicion: string;
  fecha_operacion: string;

  emisor: DatosFiscales;
  /** NULL en una simplificada: no lleva NIF ni dirección del cliente. */
  receptor: DatosFiscales | null;
  lineas: FacturaLinea[];
  desglose: FacturaDesglose[];

  base_total: number;
  cuota_total: number;
  total: number;

  /** La simplificada a la que sustituye esta completa (el canje). */
  sustituye_a: string | null;
  rectifica_a: string | null;
  refund_id: string | null;

  /** Verifactu: huella de este documento y de el anterior de la cadena. */
  huella: string;
  huella_anterior: string | null;

  created_at: string;
}

/**
 * Una factura del libro, con si cuenta o no.
 *
 * ⚠️⚠️ `vigente` es lo que evita contar el IVA dos veces: cuando una completa
 * sustituye a una simplificada, **las dos existen** —una factura emitida no se
 * anula jamás— pero solo la completa cuenta. No es un campo mutable «anulada»
 * que alguien tenga que acordarse de poner: se deduce de que otra factura la
 * señale con `sustituye_a`.
 */
export interface FacturaDelLibro extends FacturaEmitida {
  vigente: boolean;
  /** Número de la que la sustituyó, si dejó de ser vigente. */
  sustituida_por: string | null;
  /**
   * Número de la factura que ESTA rectifica. Solo en las rectificativas.
   *
   * ⚠️ Lo resuelve la vista (077) y no la API: `rectifica_a` es un uuid, y el
   * RD 1619/2012 art. 15 exige que la rectificativa **identifique la factura
   * rectificada** — o sea que ese número tiene que salir impreso. Cruzarlo en cada
   * consumidor sería repetir el mismo join en la API, en la pantalla y en el PDF.
   */
  rectifica_a_numero: string | null;
}

/** Lo que devuelve ponerse al día con las ventas ya devengadas. */
export interface ResultadoEmitirPendientes {
  emitidas: number;
  /** Sin emitir por falta de desglose. Si sale >0, hay algo que mirar. */
  saltadas: number;
  /**
   * Las rectificativas de devoluciones que tampoco tenían documento (077).
   *
   * ⚠️ Normalmente `{emitidas: 0}`, y eso es lo correcto: el trigger diferido las
   * emite solas al apuntar la devolución. Si sale >0, alguna no pudo emitirse en
   * su momento —el emisor sin configurar, o un `rectificativa_fallida`— y esta
   * pasada la ha recuperado.
   */
  rectificativas?: { emitidas: number; saltadas: number };
}

/** El resultado de recalcular la cadena de huellas de punta a punta. */
export interface CadenaFacturas {
  facturas: number;
  intacta: boolean;
  /** Números de las facturas cuya huella no cuadra. Vacío si está intacta. */
  rotas: string[];
}

/**
 * Una venta a la que se le puede emitir la factura completa que pide el cliente.
 *
 * Son las devengadas que todavía no tienen una completa. Las que ya tienen su
 * simplificada siguen apareciendo: emitir la completa es el CANJE, el caso
 * normal. Lo que desaparece de la lista es lo que ya tiene completa.
 */
export interface PedidoFacturable {
  pedido_id: string;
  numero_pedido: string;
  devengado_el: string;
  total: number;
  cliente: string | null;
  documento_cliente: string | null;
  /** La simplificada que la completa sustituiría, si la hubo. */
  simplificada: string | null;
}

/** Los datos fiscales que el cliente da al pedir su factura completa. */
export interface ReceptorFactura {
  nif: string;
  nombre: string;
  direccion: string;
  codigo_postal: string;
  ciudad: string;
  provincia?: string;
}

/**
 * Tipos de IVA admitidos, en compras **y en ventas** (migración 062).
 *
 * Una sola lista a propósito: el tipo va con la MERCANCÍA, no con la operación,
 * así que un producto que se compra al 10 se vende al 10. Tener dos listas es
 * pedir que se separen.
 *
 * El 0 (exento) no está. Una operación exenta no es «IVA al cero»: va a otra
 * casilla del modelo 303 y necesita más que un tipo distinto.
 */
export const IVA_PORCENTAJES = [4, 10, 21] as const;
export type IvaPorcentaje = (typeof IVA_PORCENTAJES)[number];

/**
 * Base imponible y cuota de un pedido, **agrupadas por tipo de IVA**.
 *
 * Por tipo y no por línea porque es lo que pide el modelo 303 — y porque
 * agrupar primero es lo que decide el redondeo. Lo calcula y lo congela la base
 * de datos (`recalcular_iva_pedido`, migración 062), nunca el cliente: dos
 * sitios redondeando por su cuenta acaban declarando bases distintas.
 */
export interface DesgloseIva {
  iva_pct: IvaPorcentaje;
  /** Importe sin IVA */
  base: number;
  /** El IVA repercutido de este tramo */
  cuota: number;
  /** `base + cuota`: lo que de verdad se cobró en este tramo */
  total: number;
}

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
  /**
   * Fecha de EXPEDICIÓN de la factura del proveedor (`YYYY-MM-DD`), el dato que
   * exige el libro registro de facturas recibidas. `null` en las compras
   * anteriores a la migración 068 — se completa desde la ficha.
   *
   * ⚠️ NO decide el trimestre en que se deduce el IVA: eso lo hace `created_at`,
   * la fecha en que la factura se anotó. Ver la 068.
   */
  fecha_factura: string | null;
  creado_por: string | null;
  created_at: string;
  items?: FacturaCompraItem[];
}

// ============================================================
// Contabilidad — liquidación del IVA (modelo 303)
// ============================================================

/** Base imponible y cuota de un tipo de IVA, y cuántos documentos la componen. */
export interface LiquidacionIvaTramo {
  /** 4, 10 o 21 */
  iva_pct: number;
  base: number;
  cuota: number;
  /**
   * Cuántos documentos aportan a ESTE tramo: pedidos en el devengado, reembolsos
   * en el rectificado, facturas en el deducible. Se muestra al lado del importe
   * porque una cifra sin saber de cuántas operaciones sale no dice gran cosa.
   *
   * ⚠️⚠️ **NO ES ADITIVO.** Un documento con varios tipos de IVA dentro cuenta en
   * cada tramo, así que sumar esta columna da de más: dos facturas de compra con
   * tres tipos entre ellas dan 1 + 2 + 2 = 5. El número real está en
   * `totales.*_documentos`, y la pantalla lo pinta en la fila de total — que es
   * justo el fallo que corrigió la migración 070.
   */
  documentos: number;
}

/**
 * Cada aviso es algo que el informe NO está contando, o que cuenta con una
 * salvedad. Se muestran arriba y no al final: son la mitad del valor del
 * informe. Ver el apartado 6 de la migración 068.
 *
 * ⚠️⚠️ **SI AÑADES UN AVISO, TIENE QUE PODER CALLARSE.** La 068 puso uno
 * incondicional (`sin_facturas_emitidas`) que decía «todavía no existe la serie
 * de facturas a clientes»; cuando la 072 la creó, el aviso pasó de incompleto a
 * **falso**, y siguió apareciendo. Un aviso falso en un informe que se presenta a
 * Hacienda es peor que no tener aviso: quien lo lea deja de creerse los demás.
 *
 * La 075 lo sustituyó por dos que cuentan y se callan solos —`venta_sin_factura`
 * y `devolucion_sin_rectificativa`—. ⚠️ Y ojo con el arreglo perezoso: borrarlo a
 * secas habría dejado el informe CALLADO con la tabla de facturas vacía, que es
 * el mismo fallo con el signo cambiado. Un aviso condicionado a un estado del
 * mundo, nunca a una fase del desarrollo.
 */
export interface LiquidacionIvaAviso {
  /**
   * Identificador estable del aviso; la pantalla decide el icono con esto, y le
   * sirve de `key`, así que **no puede repetirse dentro de un informe**.
   */
  clase: string;
  gravedad: "aviso" | "grave";
  titulo: string;
  detalle: string;
  /**
   * Cuántos elementos afecta (0 en los avisos que no cuentan nada).
   *
   * ⚠️ No es siempre `referencias.length`: en `devolucion_sin_rectificativa`
   * cuenta REEMBOLSOS y las referencias son PEDIDOS, y un pedido admite varias
   * devoluciones parciales sucesivas, cada una con su rectificativa pendiente.
   */
  cuantos: number;
  /** Números de factura o de pedido implicados, para poder ir a mirarlos */
  referencias: string[];
}

export interface LiquidacionIvaTotales {
  devengado_base: number;
  devengado_cuota: number;
  /**
   * Pedidos DISTINTOS que devengaron en el periodo. No es la suma de los
   * `documentos` de cada tramo: un pedido con productos al 10 y al 21 aparece en
   * los dos. Ver `LiquidacionIvaTramo.documentos`.
   */
  devengado_documentos: number;
  /** Lo devuelto en el periodo: se RESTA del devengado */
  rectificado_base: number;
  rectificado_cuota: number;
  /** Reembolsos DISTINTOS del periodo (un reembolso = una rectificativa) */
  rectificado_documentos: number;
  /** Devengado − rectificado: lo repercutido de verdad */
  repercutido_base: number;
  repercutido_cuota: number;
  deducible_base: number;
  deducible_cuota: number;
  /** Facturas de compra DISTINTAS anotadas en el periodo */
  deducible_documentos: number;
  /** Positivo = a ingresar. Negativo = a compensar en el periodo siguiente */
  resultado: number;
}

/**
 * El rango de un trimestre natural, en `YYYY-MM-DD` y ambos extremos inclusive.
 *
 * Vive aquí y no en la pantalla porque lo usan los dos lados y porque es lo
 * único de todo esto que se puede probar sin base de datos. Y son fechas de
 * CALENDARIO, sin hora: la conversión a instantes la hace `dia_fiscal` en la
 * base, con la zona de España. Construir aquí un `Date` y serializarlo metería
 * la zona del navegador de quien mira el informe, que no tiene nada que ver.
 */
export function rangoTrimestre(anio: number, trimestre: number): { desde: string; hasta: string } {
  if (!Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) {
    throw new Error(`Trimestre inválido: ${trimestre}`);
  }
  const mesInicio = (trimestre - 1) * 3 + 1;
  const mesFin = mesInicio + 2;
  // El último día del trimestre: 31 de marzo, 30 de junio, 30 de septiembre y
  // 31 de diciembre. Ninguno es febrero, así que no hay año bisiesto que mirar.
  const ultimoDia = mesFin === 3 || mesFin === 12 ? 31 : 30;
  const dd = (n: number) => String(n).padStart(2, "0");
  return {
    desde: `${anio}-${dd(mesInicio)}-01`,
    hasta: `${anio}-${dd(mesFin)}-${ultimoDia}`,
  };
}

/** A qué trimestre natural (1-4) pertenece un mes 1-12. */
export function trimestreDeMes(mes: number): number {
  return Math.floor((mes - 1) / 3) + 1;
}

export interface LiquidacionIva {
  /** `YYYY-MM-DD`, ambos inclusive */
  desde: string;
  hasta: string;
  /**
   * La zona con la que se decide a qué día pertenece cada operación. Siempre
   * `Europe/Madrid`, y se devuelve para que la pantalla lo pueda decir: una
   * venta de las 00:30 del día 1 caería en el trimestre anterior si se
   * comparara en UTC.
   */
  zona: string;
  /** `null` = la tienda sigue en modo pruebas y nada de esto se presenta */
  arranque_fiscal_el: string | null;
  /** IVA repercutido en las ventas del periodo, por tipo */
  devengado: LiquidacionIvaTramo[];
  /** IVA de las devoluciones del periodo, por tipo */
  rectificado: LiquidacionIvaTramo[];
  /** IVA soportado en las compras anotadas en el periodo, por tipo */
  deducible: LiquidacionIvaTramo[];
  totales: LiquidacionIvaTotales;
  avisos: LiquidacionIvaAviso[];
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

/** Cargo con su plantilla de permisos, para la pantalla de TI → Cargos. */
export interface CargoConPlantilla extends Cargo {
  permisos: PermisoModulo[];
  empleados_activos: number;
}

/** Motivo por el que reaplicar una plantilla se salta a alguien. */
export type MotivoOmision = "sin_cuenta" | "es_admin" | "inactivo";

export interface CambioPermiso {
  modulo: StaffModulo;
  /** Nivel actual, o null si hoy no tiene el módulo. */
  de: NivelPermiso | null;
  /** Nivel que quedaría, o null si la plantilla se lo quita. */
  a: NivelPermiso | null;
}

/**
 * Una persona del cargo y qué le pasaría al reaplicar la plantilla. Se enseña
 * ANTES de confirmar: reaplicar es un reemplazo completo y `divergente` marca a
 * quien tiene ajustes individuales que se van a perder.
 */
export interface EmpleadoAfectado {
  empleado_id: string;
  user_id: string | null;
  nombre: string;
  omitido_por: MotivoOmision | null;
  divergente: boolean;
  cambios: CambioPermiso[];
}

export interface ResultadoReaplicar {
  aplicados: number;
  omitidos: { user_id: string | null; nombre: string; motivo: string }[];
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
