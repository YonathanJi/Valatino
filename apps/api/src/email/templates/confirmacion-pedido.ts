export interface ItemPedidoEmail {
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

export interface DatosEmailPedido {
  pedidoId: string;
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
}

const formatEUR = (n: number): string =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const titulo = esReembolso ? "Reembolso procesado" : "¡Gracias por tu compra!";
  const bannerColor = esReembolso ? "#ff9500" : "#34c759";
  const bannerText = esReembolso ? "REEMBOLSADO" : "PAGADO";
  const metodoPagoLabel = datos.metodoPago === "stripe" ? "Tarjeta (Stripe)" : "PayPal";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0;">
              <h1 style="font-size:28px;font-weight:700;color:#1d1d1f;margin:0;letter-spacing:-0.5px;">Valatino</h1>
              <p style="font-size:13px;color:#86868b;margin:4px 0 0;">Productos latinoamericanos en España</p>
            </td>
          </tr>

          <!-- Banner de estado -->
          <tr>
            <td style="padding:24px 40px 0;">
              <div style="display:inline-block;padding:6px 14px;background-color:${bannerColor};color:#ffffff;font-size:12px;font-weight:600;border-radius:999px;letter-spacing:0.5px;">${bannerText}</div>
            </td>
          </tr>

          <!-- Título -->
          <tr>
            <td style="padding:16px 40px 8px;">
              <h2 style="font-size:24px;font-weight:700;color:#1d1d1f;margin:0;letter-spacing:-0.3px;">${escapeHtml(titulo)}</h2>
              <p style="font-size:15px;color:#86868b;margin:8px 0 0;">Tu pedido <strong style="color:#1d1d1f;">#${datos.pedidoId.slice(0, 8).toUpperCase()}</strong> — ${escapeHtml(datos.fecha)}</p>
            </td>
          </tr>

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
              : `<tr>
            <td style="padding:8px 40px 32px;">
              <p style="font-size:14px;color:#1d1d1f;background-color:#f5f5f7;padding:16px 20px;border-radius:12px;margin:0;line-height:1.6;">
                Puedes ver el estado de tu pedido en cualquier momento iniciando sesión en tu cuenta.
              </p>
            </td>
          </tr>`
          }

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #f0f0f0;">
              <p style="font-size:12px;color:#86868b;margin:0;line-height:1.5;text-align:center;">
                Este email se envió a ${escapeHtml(datos.email)} porque se procesó un pago en valatino.es.<br>
                Si tienes preguntas, responde a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}