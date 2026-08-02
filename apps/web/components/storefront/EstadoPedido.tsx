import { PEDIDO_ESTADO_LABELS, type PedidoEstado } from "@valatino/types";
import { paletaDe } from "@lib/estados-pedido";

interface Props {
  estado: string;
  /** El punto late mientras el pedido sigue su curso. Ver la nota de abajo. */
  animado?: boolean;
}

/** Estados en los que aún va a pasar algo, y por eso el punto late. */
const EN_CURSO: PedidoEstado[] = ["PENDIENTE_PAGO", "PROCESANDO", "ENVIADO"];

/**
 * La etiqueta de estado de la tienda: punto de color y nombre.
 *
 * El punto no es decoración — es lo que distingue de un vistazo un pedido vivo
 * de uno terminado, sin obligar a leer seis etiquetas. Late solo mientras queda
 * algo por pasar; en Entregado o Cancelado se queda quieto, porque una animación
 * eterna acaba siendo ruido.
 *
 * `motion-reduce` lo detiene para quien ha pedido menos movimiento en su
 * sistema: un punto parpadeando es justo lo que molesta a quien activa eso.
 */
export function EstadoPedido({ estado, animado = true }: Props) {
  const { pildora, punto } = paletaDe(estado);
  const late = animado && EN_CURSO.includes(estado as PedidoEstado);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${pildora}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {late && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${punto}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${punto}`} />
      </span>
      {PEDIDO_ESTADO_LABELS[estado as PedidoEstado] ?? estado}
    </span>
  );
}
