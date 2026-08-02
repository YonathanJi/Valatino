import { escapeHtml, formatEUR, layoutEmail } from "./formato";

export interface DatosEmailTransferencia {
  pedidoId: string;
  numeroPedido: string;
  email: string;
  importe: number;
  iban: string;
  titular: string;
  banco: string | null;
  /** Lo que el cliente debe escribir en el concepto: el número de pedido. */
  concepto: string;
  /** Hasta cuándo se guarda el pedido, en ISO. */
  venceEl: string;
}

const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Cómo hacer la transferencia, con los datos delante.
 *
 * Es el único correo de la tienda que el cliente necesita **para actuar**: los
 * demás cuentan algo que ya ha pasado. Quien cierra la pestaña del checkout se
 * queda sin el IBAN y sin el concepto, y sin esto no tiene forma de pagar el
 * pedido que acaba de reservar.
 *
 * De ahí las dos decisiones de maquetación:
 *   · **El concepto va destacado y repetido**, porque es lo único que permite
 *     casar el ingreso con el pedido. Una transferencia sin él llega al banco
 *     como un apunte anónimo que alguien tiene que adivinar.
 *   · **Los datos van en texto plano seleccionable**, no en una imagen ni en
 *     una tabla apretada: se van a copiar y pegar en la app del banco.
 */
export function renderInstruccionesTransferencia(datos: DatosEmailTransferencia): string {
  const fila = (etiqueta: string, valor: string, destacado = false) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <p style="margin:0 0 2px;font-size:12px;color:#86868b;">${escapeHtml(etiqueta)}</p>
        <p style="margin:0;font-size:${destacado ? "18px" : "15px"};color:#1d1d1f;${
          destacado ? "font-weight:700;letter-spacing:0.5px;" : ""
        }font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(valor)}</p>
      </td>
    </tr>`;

  const cuerpo = `
    <tr>
      <td style="padding:0 32px 8px;">
        <p style="font-size:15px;color:#1d1d1f;line-height:1.6;margin:0 0 20px;">
          Hemos reservado tu pedido. Para que lo preparemos solo falta que nos hagas
          la transferencia con estos datos:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#fafafa;border-radius:12px;padding:4px 20px;">
          ${fila("IBAN", datos.iban)}
          ${fila("Titular", datos.titular)}
          ${datos.banco ? fila("Banco", datos.banco) : ""}
          ${fila("Importe", formatEUR(datos.importe))}
          ${fila("Concepto", datos.concepto, true)}
        </table>

        <p style="font-size:14px;color:#1d1d1f;line-height:1.6;margin:20px 0 0;
                  background:#fff8e6;border-left:3px solid #f0b429;padding:12px 16px;">
          <strong>No olvides el concepto.</strong> Escribe
          <strong>${escapeHtml(datos.concepto)}</strong> en el campo de concepto de la
          transferencia: es lo que nos permite reconocer que el pago es tuyo.
        </p>

        <p style="font-size:14px;color:#86868b;line-height:1.6;margin:20px 0 0;">
          Guardamos tus artículos hasta el <strong>${escapeHtml(fechaLarga(datos.venceEl))}</strong>.
          Si para entonces no nos consta el ingreso, el pedido se cancelará y los
          artículos volverán a la tienda.
        </p>

        <p style="font-size:14px;color:#86868b;line-height:1.6;margin:12px 0 0;">
          En cuanto veamos la transferencia te avisamos y empezamos a prepararlo.
          Las transferencias entre bancos suelen tardar un día laborable.
        </p>
      </td>
    </tr>`;

  return layoutEmail({
    titulo: "Termina tu pedido con una transferencia",
    bannerTexto: "PENDIENTE DE PAGO",
    bannerColor: "#f0b429",
    subtitulo: `Pedido #${escapeHtml(datos.numeroPedido)}`,
    cuerpo,
    email: datos.email,
    motivo: "has hecho un pedido",
  });
}
