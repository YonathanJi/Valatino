import { escapeHtml, formatEUR, layoutEmail } from "./formato";
import { FACTURA_TIPO_LABELS, type FacturaTipo } from "@valatino/types";

export interface DatosEmailFactura {
  email: string;
  numero: string;
  tipo: FacturaTipo;
  total: number;
  numeroPedido: string | null;
  /** El PDF ya generado. Se adjunta; no se enlaza. */
  pdf: Buffer;
  nombreArchivo: string;
}

/**
 * La factura, enviada al cliente con el PDF adjunto.
 *
 * ⚠️⚠️ VA ADJUNTA Y NO ENLAZADA, y esa es la decisión que importa. Un enlace
 * exigiría una URL pública a un documento fiscal con el NIF y el domicilio del
 * cliente dentro: o se protege con un token —una pieza más que mantener, y que
 * caduca justo cuando alguien busca su factura de hace un año— o queda al
 * alcance de cualquiera que adivine la dirección. Un adjunto se queda en su
 * buzón, que es donde la gente guarda las facturas de todas formas.
 *
 * El cuerpo es corto a propósito: lo que el cliente quiere es el fichero. Un
 * correo largo alrededor de un adjunto solo hace que cueste más encontrarlo.
 */
export function renderFacturaEmitida(datos: DatosEmailFactura): {
  asunto: string;
  html: string;
} {
  const etiqueta = FACTURA_TIPO_LABELS[datos.tipo];

  return {
    // El número va en el asunto porque es como se busca una factura en el buzón
    // dos años después, y porque evita que dos correos parezcan el mismo.
    asunto: `Tu factura ${datos.numero}`,
    html: layoutEmail({
      titulo: `Factura ${datos.numero}`,
      // La píldora dice qué tipo de documento es, que es lo que distingue una
      // simplificada de una completa a primera vista.
      bannerTexto: etiqueta.toUpperCase(),
      bannerColor: "#1d1d1f",
      subtitulo: escapeHtml(datos.numero),
      email: datos.email,
      // Cierra la frase «…porque {motivo} en valatino.es.»
      motivo: "pediste la factura de tu compra",
      cuerpo: `
        <p style="margin:0 0 16px;font-size:15px;color:#1d1d1f;line-height:1.6;">
          Adjuntamos tu ${escapeHtml(etiqueta.toLowerCase())} en PDF.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0 0 2px;font-size:12px;color:#86868b;">Número de factura</p>
              <p style="margin:0;font-size:18px;color:#1d1d1f;font-weight:600;">${escapeHtml(datos.numero)}</p>
            </td>
          </tr>
          ${
            datos.numeroPedido
              ? `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0 0 2px;font-size:12px;color:#86868b;">Pedido</p>
              <p style="margin:0;font-size:15px;color:#1d1d1f;">${escapeHtml(datos.numeroPedido)}</p>
            </td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:10px 0;">
              <p style="margin:0 0 2px;font-size:12px;color:#86868b;">Importe total</p>
              <p style="margin:0;font-size:15px;color:#1d1d1f;">${formatEUR(datos.total)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:#86868b;line-height:1.6;">
          Guárdala: es el documento que justifica tu compra. Si algo no cuadra,
          responde a este correo y lo revisamos.
        </p>
      `,
    }),
  };
}
