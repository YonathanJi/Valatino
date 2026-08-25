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
  /**
   * Gastos de envío cobrados, IVA incluido. Están DENTRO de `total`.
   *
   * ⚠️⚠️ SIN ESTO EL CORREO MIENTE POR OMISIÓN. Las líneas suman los artículos y
   * el «Total» lleva el porte: un pedido de 9 € de producto con 4,95 € de envío
   * enseñaría nueve euros de líneas y un total de 13,95 € sin nada que explique
   * los 4,95 € de diferencia. Es el recibo que le llega al cliente, y es el
   * primer sitio donde se mira cuando algo no cuadra.
   *
   * Ausente o 0 = no se cobró envío, y entonces no se pinta ninguna línea: no
   * hay que enseñarle «Envío: 0,00 €» a nadie.
   */
  costeEnvio?: number | null;
  /**
   * El descuento del código, en positivo y ya restado de `total` (083).
   *
   * ⚠️⚠️ Y ESTE ES EL MISMO AGUJERO QUE `costeEnvio`, abierto de nuevo por la 083 y
   * tapado en la 084. Sin esto el correo pintaba las líneas a PVP y debajo el total
   * cobrado —que ya llevaba el descuento restado— así que **las líneas no sumaban
   * el total y faltaba dinero sin explicación**. En el pedido 260824015658 las
   * líneas y el envío daban 7,30 y el «Total» decía 6,52: 0,78 € de aire.
   *
   * Peor que el caso del envío, además: al del envío le faltaba una línea de un
   * cargo, y a este le faltaba una de un ABONO. El cliente lee que le cobran de
   * menos sin saber por qué, y el descuento que le convenció de comprar no
   * aparece en su recibo.
   *
   * Ausente o 0 = no hubo código, y entonces el correo se pinta exactamente como
   * antes de la 084: ni línea de descuento ni línea de subtotal.
   */
  descuento?: number | null;
  /**
   * El código que se aplicó, para poder decir POR QUÉ hay un abono. Si falta, la
   * línea sale como «Descuento» a secas: es preferible a no pintar el abono.
   */
  descuentoCodigo?: string | null;
  total: number;
  metodoPago: "stripe" | "paypal" | "transferencia";
  /**
   * Cómo pagó de verdad, según la pasarela («card», «bizum»…). Cuando falta
   * —pedidos anteriores a la 048— se cae al nombre de la pasarela.
   */
  metodoDetalle?: string | null;
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

/**
 * Cómo se le nombra al cliente su forma de pago.
 *
 * Antes esto era `metodoPago === "stripe" ? "Tarjeta (Stripe)" : "PayPal"`, y
 * al activar Bizum pasó a mentir: quien pagaba por Bizum recibía un correo que
 * decía «Tarjeta (Stripe)». Ni fue una tarjeta ni Stripe es una forma de pagar
 * —es por dónde pasó el dinero, algo que al cliente no le dice nada—.
 *
 * Un método desconocido se muestra tal cual capitalizado en vez de caer en
 * «Tarjeta»: si mañana se activa otro en Stripe, el correo dirá algo escueto
 * pero cierto, en lugar de algo pulido y falso.
 */
export function etiquetaMetodoPago(
  pasarela: "stripe" | "paypal" | "transferencia",
  detalle?: string | null,
): string {
  const conocidos: Record<string, string> = {
    card: "Tarjeta",
    bizum: "Bizum",
    link: "Link",
    paypal: "PayPal",
    sepa_debit: "Domiciliación SEPA",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
  };

  if (detalle) {
    const limpio = detalle.trim().toLowerCase();
    return conocidos[limpio] ?? limpio.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  // Sin detalle: los pedidos anteriores a la 048 y los que no pasan por una
  // pasarela. «Tarjeta» a secas y no «Tarjeta (Stripe)»: el nombre de la
  // pasarela nunca aportó nada a quien lee el correo.
  if (pasarela === "paypal") return "PayPal";
  if (pasarela === "transferencia") return "Transferencia bancaria";
  return "Tarjeta";
}

export function renderConfirmacionPedido(datos: DatosEmailPedido): string {
  const esReembolso = datos.esReembolso ?? false;
  const metodoPagoLabel = etiquetaMetodoPago(datos.metodoPago, datos.metodoDetalle);
  const numeroPedido = datos.numeroPedido ?? datos.pedidoId.slice(0, 8).toUpperCase();

  // Céntimos: 49.99 !== 49.99 en coma flotante según de dónde venga cada cifra
  // Se normaliza a número aquí y no en la plantilla: `null` y `undefined` son
  // los dos «no se cobró envío», y comprobarlo dos veces en el HTML es donde se
  // cuela un «Envío: 0,00 €».
  const envio = Number(datos.costeEnvio ?? 0);
  /**
   * El descuento y el subtotal que lo acompaña. Se normalizan aquí por lo mismo
   * que el envío: `null` y `undefined` son los dos «no hubo código».
   *
   * ⚠️ EL SUBTOTAL SOLO SE PINTA CUANDO HAY DESCUENTO, y no es capricho: sin
   * descuento, las líneas ya suman lo que hay encima del envío y una fila
   * «Subtotal» repetiría el mismo número dos veces. Cuando hay descuento, en
   * cambio, es la fila que hace que la resta se pueda seguir con el dedo.
   *
   * ⚠️⚠️ Y SE CALCULA A PVP —`cantidad × precio_unitario`— A PROPÓSITO, para que
   * cuadre con las líneas de arriba, que van a PVP. Restarle aquí el
   * `descuento_imputado` de cada línea daría el neto, y entonces el subtotal no
   * sería la suma de lo que el cliente está viendo. Es la misma presentación que
   * la 083 §7 eligió para la FACTURA: el descuento va abajo con el subtotal y no
   * dentro de la tabla. El correo y el documento fiscal tienen que contar lo
   * mismo, o quien compare los dos encuentra dos versiones de su compra.
   */
  const descuento = Number(datos.descuento ?? 0);
  const subtotalArticulos = datos.items.reduce(
    (suma, item) => suma + Number(item.cantidad) * Number(item.precio_unitario),
    0,
  );
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

          <!-- Envío y total -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${
                  descuento > 0
                    ? `<tr>
                  <td style="font-size:14px;color:#86868b;padding-bottom:10px;">Subtotal</td>
                  <td style="font-size:14px;color:#1d1d1f;text-align:right;font-variant-numeric:tabular-nums;padding-bottom:10px;">${formatEUR(subtotalArticulos)}</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#1d8f4e;font-weight:600;padding-bottom:10px;">Descuento${
                    datos.descuentoCodigo
                      ? ` <span style="font-weight:400;color:#86868b;">(${escapeHtml(datos.descuentoCodigo)})</span>`
                      : ""
                  }</td>
                  <td style="font-size:14px;color:#1d8f4e;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;padding-bottom:10px;">−${formatEUR(descuento)}</td>
                </tr>`
                    : ""
                }
                ${
                  envio > 0
                    ? `<tr>
                  <td style="font-size:14px;color:#86868b;padding-bottom:10px;">Envío</td>
                  <td style="font-size:14px;color:#1d1d1f;text-align:right;font-variant-numeric:tabular-nums;padding-bottom:10px;">${formatEUR(envio)}</td>
                </tr>`
                    : ""
                }
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
