import type { PedidoEstado } from "@valatino/types";
import { escapeHtml, formatEUR, layoutEmail, aviso } from "./formato";
import type { ItemPedidoEmail } from "./confirmacion-pedido";

export interface DatosEmailEstado {
  pedidoId: string;
  numeroPedido?: string | null;
  email: string;
  /** Nombre de pila para el saludo; si falta, se saluda sin nombre */
  nombre?: string | null;
  estado: PedidoEstado;
  items: ItemPedidoEmail[];
  /**
   * Los gastos de envío (080) y el descuento del código (083). Los DOS están
   * dentro de `total` y FUERA de las líneas.
   *
   * ⚠️⚠️ ESTE CORREO NACIÓ SIN ELLOS Y POR ESO MENTÍA MÁS QUE LOS OTROS: aquí no
   * es que la llamada se olvidara de pasarlos, es que el campo **no existía**, así
   * que ni había forma. Pinta las líneas a PVP y debajo el «Total» ya minorado, y
   * la diferencia —el porte sumando y el descuento restando— no salía en ningún
   * sitio. Es el correo que el cliente recibe cuando su pedido se envía, o sea el
   * que más se abre.
   *
   * Ausentes o 0 = no se cobró envío y no hubo código, y entonces el resumen sale
   * exactamente como antes de la 084.
   */
  costeEnvio?: number | null;
  descuento?: number | null;
  descuentoCodigo?: string | null;
  total: number;
  fecha: string;
}

interface CopiaEstado {
  /** Píldora superior */
  banner: string;
  color: string;
  /** Asunto del correo y encabezado del cuerpo */
  titulo: string;
  /** Cuerpo del mensaje; admite <strong> */
  mensaje: string;
}

/**
 * Texto de cada estado. Es un `Partial` a propósito: los estados que no
 * figuran aquí no generan aviso.
 *
 *  - PENDIENTE_PAGO: nadie transiciona *hacia* él; es el estado inicial.
 *  - REEMBOLSADO: lo avisa el email de reembolso, que además dice cuánto se ha
 *    devuelto. Mandar aquí un "tu pedido está reembolsado" sin el importe
 *    obligaría al cliente a escribir para preguntarlo.
 */
export const COPIAS_ESTADO: Partial<Record<PedidoEstado, CopiaEstado>> = {
  PROCESANDO: {
    banner: "EN PREPARACIÓN",
    color: "#0071e3",
    titulo: "Estamos preparando tu pedido",
    mensaje:
      "Hemos recibido tu pago y ya estamos empaquetando tus productos con cuidado. " +
      "Te escribiremos otra vez en cuanto salga hacia tu dirección.",
  },
  ENVIADO: {
    banner: "EN CAMINO",
    color: "#5856d6",
    titulo: "Tu pedido va en camino",
    mensaje:
      "¡Buenas noticias! Tu pedido ya ha salido de nuestro almacén y está de camino a tu dirección. " +
      "Pronto lo tendrás en casa.",
  },
  ENTREGADO: {
    banner: "ENTREGADO",
    color: "#34c759",
    titulo: "Tu pedido ya está en casa",
    mensaje:
      "Tu pedido se ha entregado. Esperamos que disfrutes cada producto tanto como nosotros " +
      "eligiéndolos.<br><br>Si algo no está como esperabas, responde a este correo y lo resolvemos.",
  },
  CANCELADO: {
    banner: "CANCELADO",
    color: "#86868b",
    titulo: "Tu pedido ha sido cancelado",
    mensaje:
      "Hemos cancelado tu pedido. Si ya se había cobrado el importe, recibirás la devolución " +
      "en tu método de pago y te avisaremos por correo cuando esté hecha.<br><br>" +
      "Si no esperabas esta cancelación, responde a este correo y lo revisamos.",
  },
};

const renderResumen = (
  items: ItemPedidoEmail[],
  total: number,
  envio: number,
  descuento: number,
  descuentoCodigo: string | null,
): string => {
  if (items.length === 0) return "";

  // A PVP, como las líneas de arriba: es la cifra de la que el descuento resta.
  // Solo se pinta cuando hay descuento; ver el mismo razonamiento en
  // `confirmacion-pedido.ts`, que es de donde sale esta presentación.
  const subtotalArticulos = items.reduce(
    (suma, i) => suma + Number(i.cantidad) * Number(i.precio_unitario),
    0,
  );

  const filas = items
    .map(
      (i) => `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1d1d1f;">
                    ${escapeHtml(i.nombre_producto)}
                    <span style="color:#86868b;">× ${i.cantidad}</span>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;color:#1d1d1f;font-variant-numeric:tabular-nums;">
                    ${formatEUR(i.precio_unitario * i.cantidad)}
                  </td>
                </tr>`,
    )
    .join("");

  return `
          <tr>
            <td style="padding:8px 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td colspan="2" style="padding-bottom:12px;border-bottom:2px solid #1d1d1f;">
                    <span style="font-size:13px;font-weight:600;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.8px;">Tu pedido</span>
                  </td>
                </tr>${filas}
                ${
                  descuento > 0
                    ? `<tr>
                  <td style="padding-top:10px;font-size:14px;color:#86868b;">Subtotal</td>
                  <td style="padding-top:10px;font-size:14px;color:#1d1d1f;text-align:right;font-variant-numeric:tabular-nums;">${formatEUR(subtotalArticulos)}</td>
                </tr>
                <tr>
                  <td style="padding-top:8px;font-size:14px;color:#1d8f4e;font-weight:600;">Descuento${
                    descuentoCodigo
                      ? ` <span style="font-weight:400;color:#86868b;">(${escapeHtml(descuentoCodigo)})</span>`
                      : ""
                  }</td>
                  <td style="padding-top:8px;font-size:14px;color:#1d8f4e;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;">−${formatEUR(descuento)}</td>
                </tr>`
                    : ""
                }
                ${
                  envio > 0
                    ? `<tr>
                  <td style="padding-top:8px;font-size:14px;color:#86868b;">Envío</td>
                  <td style="padding-top:8px;font-size:14px;color:#1d1d1f;text-align:right;font-variant-numeric:tabular-nums;">${formatEUR(envio)}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding-top:12px;font-size:15px;color:#1d1d1f;font-weight:600;">Total</td>
                  <td style="padding-top:12px;font-size:18px;color:#1d1d1f;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${formatEUR(total)}</td>
                </tr>
              </table>
            </td>
          </tr>`;
};

/**
 * Aviso de cambio de estado. Devuelve `null` si el estado no tiene texto
 * definido, y entonces no se envía nada.
 */
export function renderCambioEstado(
  datos: DatosEmailEstado,
): { asunto: string; html: string } | null {
  const copia = COPIAS_ESTADO[datos.estado];
  if (!copia) return null;

  const numeroPedido = datos.numeroPedido ?? datos.pedidoId.slice(0, 8).toUpperCase();
  // Solo el nombre de pila: "Hola Ana" suena mejor que el nombre completo del
  // destinatario del envío, que a veces trae apellidos y hasta el piso.
  const nombrePila = datos.nombre?.trim().split(/\s+/)[0];
  // Párrafo aparte: "Hola Ana, Hemos recibido…" dejaría una mayúscula a media
  // frase, y bajar la inicial del mensaje rompería los que empiezan por "¡".
  const saludo = nombrePila ? `Hola ${escapeHtml(nombrePila)}:<br><br>` : "";

  const html = layoutEmail({
    titulo: copia.titulo,
    bannerTexto: copia.banner,
    bannerColor: copia.color,
    subtitulo: `Pedido <strong style="color:#1d1d1f;">#${escapeHtml(numeroPedido)}</strong> — ${escapeHtml(datos.fecha)}`,
    cuerpo: `${aviso(saludo + copia.mensaje)}${renderResumen(
      datos.items,
      datos.total,
      Number(datos.costeEnvio ?? 0),
      Number(datos.descuento ?? 0),
      datos.descuentoCodigo ?? null,
    )}`,
    email: datos.email,
    motivo: "tienes un pedido",
  });

  return { asunto: `${copia.titulo} — Pedido #${numeroPedido}`, html };
}
