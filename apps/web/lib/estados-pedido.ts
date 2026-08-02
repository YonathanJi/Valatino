import type { PedidoEstado, TipoHito } from "@valatino/types";

/**
 * El color de cada estado del pedido en la tienda.
 *
 * Vivía copiado en `cuenta/pedidos` y en `cuenta/perfil`, en escala de grises:
 * los estados se distinguían solo por intensidad y la pantalla quedaba apagada
 * —el panel, en cambio, lleva color desde siempre—. Al unificarlo aquí, además,
 * deja de poder pasar que una pantalla diga una cosa y la de al lado otra.
 *
 * El color acompaña, nunca sustituye: al lado va siempre el nombre del estado,
 * porque quien no distingue los tonos tiene que poder leerlo igual.
 */
interface Paleta {
  /** Fondo tenue + texto legible + borde interior, para la píldora. */
  pildora: string;
  /** El punto que la acompaña, en el tono saturado. */
  punto: string;
}

/**
 * Los tonos siguen el significado, no el gusto: ámbar es esperar, azul es que
 * algo está en marcha, violeta que va de camino, verde que llegó, rojo que se
 * paró y naranja que hubo dinero de vuelta. Es la misma familia que usa el
 * panel, para que el equipo y el cliente vean el mismo pedido del mismo color.
 */
export const ESTADO_PALETA: Record<PedidoEstado, Paleta> = {
  PENDIENTE_PAGO: {
    pildora: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300",
    punto: "bg-amber-500",
  },
  PROCESANDO: {
    pildora: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300",
    punto: "bg-blue-500",
  },
  ENVIADO: {
    pildora:
      "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/40 dark:text-violet-300",
    punto: "bg-violet-500",
  },
  ENTREGADO: {
    pildora:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
    punto: "bg-emerald-500",
  },
  CANCELADO: {
    pildora: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300",
    punto: "bg-rose-500",
  },
  REEMBOLSADO: {
    pildora:
      "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950/40 dark:text-orange-300",
    punto: "bg-orange-500",
  },
};

export const PALETA_POR_DEFECTO: Paleta = {
  pildora: "bg-muted text-muted-foreground ring-border",
  punto: "bg-muted-foreground",
};

export const paletaDe = (estado: string): Paleta =>
  ESTADO_PALETA[estado as PedidoEstado] ?? PALETA_POR_DEFECTO;

/**
 * El color de cada paso del seguimiento. Mismo criterio que arriba: el envío es
 * violeta aquí y en la píldora del estado, así que la línea de tiempo y la
 * etiqueta del pedido se leen como lo mismo.
 */
export const HITO_COLOR: Record<TipoHito, string> = {
  pedido: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  preparacion: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  envio: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  entrega: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  devolucion: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  cancelacion: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
};
