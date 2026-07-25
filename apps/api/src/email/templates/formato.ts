/**
 * Piezas compartidas por las plantillas de email.
 *
 * El HTML del correo se escribe con tablas y estilos en línea a propósito:
 * Gmail y Outlook descartan <style> y flexbox. Como el andamiaje (cabecera,
 * banner, pie) es idéntico en todos los avisos, vive aquí una sola vez: cuando
 * cada plantilla llevaba su copia, cambiar el pie obligaba a acordarse de
 * todas.
 */

export const formatEUR = (n: number): string =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

/**
 * Escapa el HTML de todo dato que venga del cliente o del catálogo. Un nombre
 * de producto o de destinatario con `<` rompería la maquetación del correo.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface OpcionesLayout {
  /** Va en <title> y como encabezado grande del cuerpo */
  titulo: string;
  /** Texto de la píldora de estado (p.ej. "PAGADO", "EN CAMINO") */
  bannerTexto: string;
  /** Color de fondo de la píldora */
  bannerColor: string;
  /** Línea bajo el título: número de pedido, fecha… (ya escapada) */
  subtitulo: string;
  /** Bloque central, filas <tr> de la tabla de 600px (ya escapado) */
  cuerpo: string;
  /** Destinatario, para la nota legal del pie */
  email: string;
  /** Por qué recibe este correo. Cierra la frase "…porque {motivo} en valatino.es." */
  motivo: string;
}

/** Envuelve el cuerpo en el marco de marca (cabecera, banner, título, pie). */
export function layoutEmail(o: OpcionesLayout): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(o.titulo)}</title>
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
              <div style="display:inline-block;padding:6px 14px;background-color:${o.bannerColor};color:#ffffff;font-size:12px;font-weight:600;border-radius:999px;letter-spacing:0.5px;">${escapeHtml(o.bannerTexto)}</div>
            </td>
          </tr>

          <!-- Título -->
          <tr>
            <td style="padding:16px 40px 8px;">
              <h2 style="font-size:24px;font-weight:700;color:#1d1d1f;margin:0;letter-spacing:-0.3px;">${escapeHtml(o.titulo)}</h2>
              <p style="font-size:15px;color:#86868b;margin:8px 0 0;">${o.subtitulo}</p>
            </td>
          </tr>

          ${o.cuerpo}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid #f0f0f0;">
              <p style="font-size:12px;color:#86868b;margin:0;line-height:1.5;text-align:center;">
                Este email se envió a ${escapeHtml(o.email)} porque ${escapeHtml(o.motivo)} en valatino.es.<br>
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

/** Párrafo destacado sobre fondo gris, para el mensaje principal del aviso. */
export const aviso = (texto: string): string =>
  `<tr>
            <td style="padding:8px 40px 24px;">
              <p style="font-size:15px;color:#1d1d1f;background-color:#f5f5f7;padding:16px 20px;border-radius:12px;margin:0;line-height:1.6;">${texto}</p>
            </td>
          </tr>`;
