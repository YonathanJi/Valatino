import { escapeHtml, formatEUR, layoutEmail, aviso } from "./formato";

export interface ItemPedidoEmail {
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface DatosEmailPedido {
  pedidoId: string;
  numeroPedido?: string | null;
  email: string;
  items: ItemPedidoEmail[];
  total: number;
  metodoPago: "stripe" | "paypal";
  direccionEnvio: {
    nombre_destinatario: string;
    linea1: string;
    linea2?: string | null;
    ciudad: string;
    codigo_postal: string;
    provincia: string;
    pais?: string;
  } | null;
  estado: string;
  fecha: string;
  esReembolso?: boolean;
  /**
   * Importe devuelto, solo en emails de reembolso. Si es menor que el total, el
   * correo lo explica como devolución parcial: decirle "reembolsado" a secas a
   * quien ha recibido 10 € de 50 € genera una reclamación garantizada.
   */
  importeReembolsado?: number;
}

const renderItems = (items: ItemPedidoEmail[]): string =>
  items
    .map(
      (item) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:15px;color:#1d1d1f;">${escapeHtml(item.nombre_producto)}</span>
            <span style="font-size:13px;color:#86868b;display:block;margin-top:2px;">Cantidad: ${item.cantidad}</span>
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-size:15px;color:#1d1d1f;font-variant-numeric:tabular-nums;">
            ${formatEUR(item.precio_unitario * item.cantidad)}
          </td>
        </tr>`,
    )
    .join("");

const renderDireccion = (direccion: DatosEmailPedido["direccionEnvio"]): string => {
  if (!direccion) {
    return `<p style="font-size:14px;color:#86868b;">Recogida en tienda</p>`;
  }
  const lineas = [
    direccion.nombre_destinatario,
    direccion.linea1,
    direccion.linea2,
    `${direccion.codigo_postal} ${direccion.ciudad}`,
    direccion.provincia,
    direccion.pais && direccion.pais !== "España" ? direccion.pais : null,
  ].filter((l): l is string => Boolean(l));

  return lineas
    .map(
      (l) =>
        `<p style="font-size:14px;color:#1d1d1f;margin:0;line-height:1.5;">${escapeHtml(l)}</p>`,
    )
    .join("");
};

export function renderConfirmacionPedido(datos: DatosEmailPedido): string {
  const esReembolso = datos.esReembolso ?? false;
  const metodoPagoLabel = datos.metodoPago === "stripe" ? "Tarjeta (Stripe)" : "PayPal";
  const numeroPedido = datos.numeroPedido ?? datos.pedidoId.slice(0, 8).toUpperCase();

  // Céntimos: 49.99 !== 49.99 en coma flotante según de dónde venga cada cifra
  const devuelto = datos.importeReembolsado ?? datos.total;
  const esParcial =
    esReembolso && Math.round(devuelto * 100) < Math.round(datos.total * 100);

  const titulo = esReembolso
    ? esParcial
      ? "Te hemos devuelto parte de tu pedido"
      : "Reembolso procesado"
    : "¡Gracias por tu compra!";

  const cuerpo = `
          ${
            esReembolso
              ? aviso(
                  esParcial
                    ? `Hemos devuelto <strong>${formatEUR(devuelto)}</strong> de los ${formatEUR(datos.total)} de tu pedido. El resto del pedido sigue su curso con normalidad.<br><br>El importe aparecerá en tu cuenta en un plazo de <strong>5 a 10 días laborables</strong>, según tu banco.`
                    : `Hemos devuelto el importe completo de tu pedido: <strong>${formatEUR(devuelto)}</strong>.<br><br>Aparecerá en tu cuenta en un plazo de <strong>5 a 10 días laborables</strong>, según tu banco.`,
                )
              : ""
          }

          <!-- Items -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td colspan="2" style="padding-bottom:12px;border-bottom:2px solid #1d1d1f;">
                    <span style="font-size:13px;font-weight:600;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.8px;">Resumen del pedido</span>
                  </td>
                </tr>
                ${renderItems(datos.items)}
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:16px;color:#1d1d1f;font-weight:600;">Total</td>
                  <td style="font-size:22px;color:#1d1d1f;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${formatEUR(datos.total)}</td>
                </tr>
                ${
                  esReembolso
                    ? `<tr>
                  <td style="font-size:14px;color:#ff9500;font-weight:600;padding-top:6px;">Reembolsado</td>
                  <td style="font-size:16px;color:#ff9500;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;padding-top:6px;">−${formatEUR(devuelto)}</td>
                </tr>`
                    : ""
                }
              </table>
            </td>
          </tr>

          <!-- Datos de pago y envío -->
          <tr>
            <td style="padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="vertical-align:top;padding-right:20px;">
                    <p style="font-size:13px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 8px;">Método de pago</p>
                    <p style="font-size:14px;color:#1d1d1f;margin:0;">${escapeHtml(metodoPagoLabel)}</p>
                    <p style="font-size:13px;color:#86868b;margin:4px 0 0;">Estado: ${escapeHtml(datos.estado)}</p>
                  </td>
                  <td width="50%" style="vertical-align:top;padding-left:20px;">
                    <p style="font-size:13px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 8px;">Dirección de envío</p>
                    ${renderDireccion(datos.direccionEnvio)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            esReembolso
              ? ""
              : aviso(
                  "Puedes ver el estado de tu pedido en cualquier momento iniciando sesión en tu cuenta.",
                )
          }`;

  return layoutEmail({
    titulo,
    bannerTexto: esReembolso ? (esParcial ? "REEMBOLSO PARCIAL" : "REEMBOLSADO") : "PAGADO",
    bannerColor: esReembolso ? "#ff9500" : "#34c759",
    subtitulo: `Tu pedido <strong style="color:#1d1d1f;">#${escapeHtml(numeroPedido)}</strong> — ${escapeHtml(datos.fecha)}`,
    cuerpo,
    email: datos.email,
    motivo: "se procesó un pago",
  });
}
