import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { FACTURA_TIPO_LABELS, type FacturaEmitida, type DatosFiscales } from "@valatino/types";

/**
 * La factura en PDF, generada **al pedirla y nunca almacenada**.
 *
 * ⚠️⚠️ ESA ES LA DECISIÓN DE FONDO, Y NO ES POR AHORRAR ESPACIO: la fila de
 * `facturas_emitidas` es la verdad, está encadenada por huella y es inmutable. Un
 * PDF guardado sería un **segundo sitio** que puede divergir de ella — y el día
 * que divergieran, nadie sabría cuál de los dos enseñar a Hacienda. Generándolo
 * cada vez, el documento no puede contradecir al libro por construcción.
 *
 * El coste de regenerar es milisegundos; el de una copia que se desincroniza, un
 * problema que no se detecta hasta que alguien compara.
 *
 * ⚠️ NO SE EMPOTRA NINGUNA TIPOGRAFÍA. Las Helvetica de serie de pdfkit usan
 * WinAnsi, que ya cubre los acentos del español, la «ñ» y el símbolo «€». Meter un
 * TTF sumaría cientos de KB al despliegue de Render para no ganar nada.
 *
 * 🔜 VERIFACTU: el RD 1007/2023 exige un QR en la factura, y las fechas siguen
 * pendientes de la gestoría. El hueco está reservado abajo a la derecha, junto a
 * la huella —que ya se imprime— para que añadirlo sea colocar una imagen y no
 * recolocar la página.
 */
@Injectable()
export class FacturaPdfService {
  /** Márgenes y anchos en puntos. A4 son 595,28 × 841,89. */
  private static readonly MARGEN = 50;
  private static readonly ANCHO = 595.28 - 50 * 2;

  /**
   * Devuelve el PDF completo en memoria.
   *
   * ⚠️ Se acumula en un Buffer en vez de devolver el stream de pdfkit, y hace
   * falta: el mismo PDF se sirve por HTTP **y** se adjunta a un correo, y un
   * stream solo se puede consumir una vez. Una factura son dos o tres KB, así que
   * tenerla en memoria no es un problema.
   */
  async generar(factura: FacturaEmitida): Promise<Buffer> {
    const doc = new PDFDocument({
      size: "A4",
      margin: FacturaPdfService.MARGEN,
      info: {
        Title: `Factura ${factura.numero}`,
        Author: factura.emisor.nombre,
        Subject: `${FACTURA_TIPO_LABELS[factura.tipo]} · ${factura.numero}`,
        // Sin CreationDate propio: pdfkit pone la de ahora. La fecha que importa
        // es la de expedición, y va impresa dentro del documento.
      },
    });

    const trozos: Buffer[] = [];
    doc.on("data", (t: Buffer) => trozos.push(t));
    const terminado = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(trozos)));
      doc.on("error", reject);
    });

    this.cabecera(doc, factura);
    this.partes(doc, factura);
    this.lineas(doc, factura);
    this.totales(doc, factura);
    this.pie(doc, factura);

    doc.end();
    return terminado;
  }

  /** Nombre del fichero al descargarlo. `VALF202600100.pdf`, sin más adornos. */
  nombreArchivo(factura: FacturaEmitida): string {
    return `${factura.numero}.pdf`;
  }

  // ── Bloques ────────────────────────────────────────────────────────────────

  private cabecera(doc: PDFKit.PDFDocument, f: FacturaEmitida) {
    const { MARGEN, ANCHO } = FacturaPdfService;

    doc.font("Helvetica-Bold").fontSize(18).text(f.emisor.nombre, MARGEN, MARGEN);
    doc.font("Helvetica").fontSize(9).fillColor("#444");
    doc.text(this.domicilio(f.emisor), { width: ANCHO * 0.55 });
    doc.text(`NIF ${f.emisor.nif}`);

    // El identificativo del documento, arriba a la derecha: es lo primero que
    // busca quien recibe una factura.
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000");
    doc.text(FACTURA_TIPO_LABELS[f.tipo].toUpperCase(), MARGEN, MARGEN, {
      width: ANCHO,
      align: "right",
    });
    doc.font("Helvetica-Bold").fontSize(15).text(f.numero, { width: ANCHO, align: "right" });

    doc.font("Helvetica").fontSize(9).fillColor("#444");
    doc.text(`Fecha de expedición: ${this.fecha(f.fecha_expedicion)}`, {
      width: ANCHO,
      align: "right",
    });

    /**
     * ⚠️⚠️ LA FECHA DE OPERACIÓN SOLO SE IMPRIME SI ES DISTINTA DE LA DE
     * EXPEDICIÓN, y ahí está el dato que importa: el IVA pertenece al trimestre de
     * la OPERACIÓN, así que una completa emitida en octubre de una venta de julio
     * lleva las dos fechas y no son intercambiables. Cuando coinciden —el caso de
     * toda simplificada— repetirlas solo añade ruido.
     */
    if (f.fecha_operacion !== f.fecha_expedicion) {
      doc.text(`Fecha de la operación: ${this.fecha(f.fecha_operacion)}`, {
        width: ANCHO,
        align: "right",
      });
    }

    // Rectificativa: a qué documento corrige. Lo exige el RD 1619/2012 art. 15, y
    // sin esta línea una rectificativa no es válida.
    if (f.tipo === "rectificativa") {
      doc.font("Helvetica-Bold").fillColor("#000");
      doc.text("Rectifica a la factura indicada en el libro registro", {
        width: ANCHO,
        align: "right",
      });
    }

    doc.moveDown(1.5);
    doc.fillColor("#000");
  }

  private partes(doc: PDFKit.PDFDocument, f: FacturaEmitida) {
    const { MARGEN, ANCHO } = FacturaPdfService;
    const y = doc.y;

    doc.font("Helvetica-Bold").fontSize(9).text("EMISOR", MARGEN, y, { width: ANCHO / 2 });
    doc.font("Helvetica").fontSize(9).fillColor("#444");
    doc.text(f.emisor.nombre, { width: ANCHO / 2 - 10 });
    doc.text(this.domicilio(f.emisor), { width: ANCHO / 2 - 10 });
    doc.text(`NIF ${f.emisor.nif}`);
    const finEmisor = doc.y;

    /**
     * ⚠️ UNA SIMPLIFICADA NO LLEVA DATOS DEL CLIENTE, y eso no es una carencia:
     * es lo que la distingue. El RD 1619/2012 art. 7 no los exige, y por eso la
     * simplificada puede emitirse sola en cada venta sin pedirle el NIF a nadie.
     * Aquí se DICE, en vez de dejar media página en blanco que parece un fallo de
     * la maqueta o un dato que se perdió.
     */
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("DESTINATARIO", MARGEN + ANCHO / 2, y, { width: ANCHO / 2 });
    doc.font("Helvetica").fontSize(9).fillColor("#444");

    if (f.receptor) {
      doc.text(f.receptor.nombre, { width: ANCHO / 2 });
      doc.text(this.domicilio(f.receptor), { width: ANCHO / 2 });
      doc.text(`NIF ${f.receptor.nif}`);
    } else {
      doc.text(
        "Factura simplificada: no consigna los datos del destinatario. " +
          "Si los necesitas, pide la factura completa.",
        { width: ANCHO / 2 },
      );
    }

    doc.y = Math.max(finEmisor, doc.y);
    doc.moveDown(1.5);
    doc.fillColor("#000");
  }

  private lineas(doc: PDFKit.PDFDocument, f: FacturaEmitida) {
    const { MARGEN, ANCHO } = FacturaPdfService;

    // Columnas: concepto flexible, el resto fijas y alineadas a la derecha.
    const anchoCant = 45;
    const anchoIva = 45;
    const anchoUnit = 70;
    const anchoImporte = 75;
    const anchoConcepto = ANCHO - anchoCant - anchoIva - anchoUnit - anchoImporte;

    const xCant = MARGEN + anchoConcepto;
    const xIva = xCant + anchoCant;
    const xUnit = xIva + anchoIva;
    const xImporte = xUnit + anchoUnit;

    const cabeceraY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Concepto", MARGEN, cabeceraY, { width: anchoConcepto });
    doc.text("Uds.", xCant, cabeceraY, { width: anchoCant, align: "right" });
    doc.text("IVA", xIva, cabeceraY, { width: anchoIva, align: "right" });
    doc.text("Precio", xUnit, cabeceraY, { width: anchoUnit, align: "right" });
    doc.text("Importe", xImporte, cabeceraY, { width: anchoImporte, align: "right" });

    doc.moveDown(0.4);
    this.regla(doc);
    doc.moveDown(0.4);

    doc.font("Helvetica").fontSize(9);
    for (const l of f.lineas) {
      const y = doc.y;
      // El concepto puede ocupar dos líneas; las demás columnas se anclan a la
      // misma `y` para que no bailen respecto al nombre.
      doc.text(l.nombre, MARGEN, y, { width: anchoConcepto - 8 });
      const yDespues = doc.y;
      doc.text(String(l.cantidad), xCant, y, { width: anchoCant, align: "right" });
      doc.text(`${l.iva_pct} %`, xIva, y, { width: anchoIva, align: "right" });
      doc.text(this.euros(l.precio_unitario), xUnit, y, { width: anchoUnit, align: "right" });
      doc.text(this.euros(l.importe), xImporte, y, { width: anchoImporte, align: "right" });
      doc.y = yDespues;
      doc.moveDown(0.35);
    }

    this.regla(doc);
    doc.moveDown(0.6);

    /**
     * ⚠️⚠️ AVISO PARA QUIEN TOQUE ESTO: los precios de las líneas llevan **el IVA
     * incluido** (son PVP), mientras que en las facturas de COMPRA el coste va sin
     * IVA. Sumar las líneas y aplicarles un porcentaje aquí daría un total
     * distinto del cobrado. El desglose de abajo se **copia** de la fila, que a su
     * vez lo copió de `pedido_iva` (062): el único sitio que redondea.
     */
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#666");
    doc.text("Los precios de las líneas incluyen IVA.", MARGEN, doc.y, { width: ANCHO });
    doc.fillColor("#000");
    doc.moveDown(0.8);
  }

  private totales(doc: PDFKit.PDFDocument, f: FacturaEmitida) {
    const { MARGEN, ANCHO } = FacturaPdfService;
    const anchoBloque = 250;
    const x = MARGEN + ANCHO - anchoBloque;
    const anchoEtiqueta = anchoBloque - 90;

    const fila = (etiqueta: string, valor: string, negrita = false) => {
      const y = doc.y;
      doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(etiqueta, x, y, { width: anchoEtiqueta, align: "right" });
      doc.text(valor, x + anchoEtiqueta, y, { width: 90, align: "right" });
      doc.moveDown(0.3);
    };

    // Una fila por tipo de IVA: un pedido con galletas al 10 % y un refresco al
    // 21 % trae dos, y así es como se declara.
    for (const d of f.desglose) {
      fila(`Base imponible al ${d.iva_pct} %`, this.euros(d.base));
      fila(`Cuota IVA ${d.iva_pct} %`, this.euros(d.cuota));
    }

    if (f.desglose.length > 1) {
      fila("Total base imponible", this.euros(f.base_total));
      fila("Total cuota IVA", this.euros(f.cuota_total));
    }

    doc.moveDown(0.2);
    fila("TOTAL", this.euros(f.total), true);
    doc.moveDown(1);
  }

  private pie(doc: PDFKit.PDFDocument, f: FacturaEmitida) {
    const { MARGEN, ANCHO } = FacturaPdfService;

    doc.font("Helvetica").fontSize(7.5).fillColor("#666");

    if (f.numero_pedido) {
      doc.text(`Pedido ${f.numero_pedido}`, MARGEN, doc.y, { width: ANCHO });
    }

    /**
     * La huella, impresa. No la exige nadie hoy — pero es lo que permite a
     * cualquiera comprobar que el documento que tiene en la mano es el que está en
     * el libro, sin fiarse de la palabra de nadie. Y es el sitio donde el QR de
     * Verifactu encajará cuando la gestoría confirme las fechas.
     */
    doc.moveDown(0.5);
    doc.text(`Huella SHA-256: ${f.huella}`, MARGEN, doc.y, { width: ANCHO });

    doc.moveDown(0.5);
    doc.text(
      "Documento generado desde el libro de facturas expedidas. " +
        "Una factura emitida no se modifica: cualquier corrección se hace con una factura rectificativa.",
      MARGEN,
      doc.y,
      { width: ANCHO },
    );

    doc.fillColor("#000");
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private regla(doc: PDFKit.PDFDocument) {
    const { MARGEN, ANCHO } = FacturaPdfService;
    doc
      .strokeColor("#ccc")
      .lineWidth(0.5)
      .moveTo(MARGEN, doc.y)
      .lineTo(MARGEN + ANCHO, doc.y)
      .stroke()
      .strokeColor("#000");
  }

  private domicilio(d: DatosFiscales): string {
    return [d.direccion, [d.codigo_postal, d.ciudad].filter(Boolean).join(" "), d.provincia]
      .filter((x) => x && String(x).trim())
      .join(" · ");
  }

  /**
   * `2026-08-14` → `14/08/2026`, partiendo la cadena.
   *
   * ⚠️ NO con `new Date(iso)`: un `YYYY-MM-DD` se lee como medianoche UTC y en
   * España eso cae el día anterior por la noche. Una factura del 1 de agosto se
   * imprimiría con fecha del 31 de julio — en un documento fiscal, y encima
   * cambiando de mes.
   */
  private fecha(iso: string): string {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }

  /**
   * Importe en euros con coma decimal.
   *
   * ⚠️ Se formatea a mano y no con `toLocaleString("es-ES")`: el resultado de
   * `Intl` depende de los datos de la plataforma —Node puede venir con ICU
   * reducido— y ahí saldría `1,234.56` o un espacio raro de millares en un
   * documento contable. Aquí el formato tiene que ser el mismo en todas partes.
   */
  private euros(valor: number): string {
    const n = Number(valor);

    /**
     * ⚠️⚠️ SE PASA A CÉNTIMOS ENTEROS **ANTES** DE PARTIR, y ese orden es el
     * arreglo de un fallo que cazó el test: la primera versión hacía
     * `Math.round((abs(n) - entero) * 100)`, y con `0.999` daba `entero = 0` y
     * `centimos = 100` — que el `padStart(2)` no recorta, así que salía
     * **«0,100 €»** impreso en un documento contable.
     *
     * Redondeando a céntimos primero y sacando el euro con una división entera,
     * ese caso se convierte solo en `1,00 €` y no hay ninguna combinación que
     * pueda producir tres dígitos decimales.
     *
     * ⚠️ Nota sobre el redondeo, que también salió del test: `2.675` imprime
     * `2,67` y **es correcto** — el double que guarda Node para ese literal es
     * `2.67499…`, así que 2,67 es el redondeo del valor que de verdad hay. No es
     * un caso alcanzable de todas formas: todo lo que llega aquí sale de columnas
     * `numeric(12,2)` de Postgres, o sea ya con dos decimales exactos.
     */
    const totalCentimos = Math.round(Math.abs(n) * 100);
    const entero = Math.trunc(totalCentimos / 100);
    const centimos = totalCentimos % 100;

    const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    // El signo se decide por `totalCentimos` y no por `n`: con `-0.001`, `n < 0`
    // es cierto pero el importe redondeado es cero, y «-0,00 €» no es un importe.
    const signo = n < 0 && totalCentimos > 0 ? "-" : "";
    return `${signo}${miles},${String(centimos).padStart(2, "0")} €`;
  }
}
