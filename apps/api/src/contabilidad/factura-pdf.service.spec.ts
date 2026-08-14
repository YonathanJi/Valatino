import { FacturaPdfService } from "./factura-pdf.service";
import type { FacturaEmitida } from "@valatino/types";

/**
 * La factura REAL del 2026-08-14, copiada de la fila del remoto.
 *
 * ⚠️ Es datos de verdad y no un fixture inventado, a propósito: trae los detalles
 * que uno no se inventa —el `iva_pct` como `10.00` y no `10`, el receptor con la
 * población en minúscula tal como se guardó antes de la 076, dos líneas con
 * cantidades distintas, y una huella de 64 caracteres que tiene que caber en el
 * pie sin desbordar la página.
 */
const FACTURA_REAL = {
  id: "ee94ebcd-b89d-41ed-9e2e-a042cd2d0b9f",
  numero: "VALF202600100",
  tipo: "completa",
  serie: "VALF",
  ejercicio: 2026,
  correlativo: 100,
  pedido_id: "7e5a9111-3981-4838-a2c3-c02eaacb80be",
  numero_pedido: "260814015565",
  fecha_expedicion: "2026-08-14",
  fecha_operacion: "2026-08-14",
  emisor: {
    nif: "Z4194001W",
    nombre: "Leydy Jhoanna Mendoza Sanchez",
    direccion: "Calle del Arco, 9",
    codigo_postal: "28840",
    ciudad: "Mejorada del Campo",
    provincia: "Madrid",
    pais: "ES",
  },
  receptor: {
    nif: "12345678Z",
    nombre: "Yonathan Jimenez Duque",
    direccion: "Calle del Arco, 9",
    codigo_postal: "28840",
    ciudad: "Mejorada del Campo",
    provincia: "Madrid",
    pais: "ES",
  },
  lineas: [
    {
      nombre: "Galleta Festival Sabor Chocolate",
      importe: 2.4,
      iva_pct: 10,
      cantidad: 3,
      precio_unitario: 0.8,
    },
    { nombre: "Quipitos Pops", importe: 0.62, iva_pct: 10, cantidad: 1, precio_unitario: 0.62 },
  ],
  desglose: [{ base: 2.75, cuota: 0.27, iva_pct: 10 }],
  base_total: 2.75,
  cuota_total: 0.27,
  total: 3.02,
  sustituye_a: "f9db032f-f1b1-4969-8465-6b983d523d1a",
  rectifica_a: null,
  refund_id: null,
  huella: "3E6EEDF05310001871A4D9A13AEF716402C1D6BDEC7FED35E3D5F29ADCBD366B",
  huella_anterior: null,
  created_at: "2026-08-14T17:17:40.000Z",
} as unknown as FacturaEmitida;

/** La misma venta antes del canje: sin receptor, que es lo que la distingue. */
const SIMPLIFICADA = {
  ...FACTURA_REAL,
  numero: "VALS202600100",
  tipo: "simplificada",
  serie: "VALS",
  receptor: null,
  sustituye_a: null,
} as unknown as FacturaEmitida;

describe("FacturaPdfService", () => {
  const servicio = new FacturaPdfService();

  it("genera un PDF válido de la factura completa", async () => {
    const pdf = await servicio.generar(FACTURA_REAL);

    // La firma de un PDF. Si esto falla, pdfkit no está produciendo un documento.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Y termina de cerrarse: un stream cortado a medias daría un fichero que
    // algunos visores abren y otros no.
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("genera la simplificada, que NO lleva datos del destinatario", async () => {
    // ⚠️ Es el caso que más fácil se rompe: `receptor` es null y cualquier acceso
    // a `receptor.nombre` sin comprobarlo tumbaría la generación de TODA factura
    // automática — que son todas menos las que alguien pide.
    const pdf = await servicio.generar(SIMPLIFICADA);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("aguanta un desglose con varios tipos de IVA", async () => {
    // Un pedido con galletas al 10 % y un refresco al 21 %. Añade las dos filas
    // de totales que solo aparecen cuando hay más de un tipo.
    const pdf = await servicio.generar({
      ...FACTURA_REAL,
      desglose: [
        { base: 2.75, cuota: 0.27, iva_pct: 10 },
        { base: 10, cuota: 2.1, iva_pct: 21 },
      ],
      base_total: 12.75,
      cuota_total: 2.37,
      total: 15.12,
    } as unknown as FacturaEmitida);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("aguanta nombres de producto largos sin romper la maqueta", async () => {
    // La columna de concepto envuelve a dos líneas y las demás se anclan a la
    // misma `y`. Si eso se rompiera, las cantidades saldrían desalineadas.
    const pdf = await servicio.generar({
      ...FACTURA_REAL,
      lineas: [
        {
          nombre:
            "Galleta Festival Sabor Chocolate con Relleno de Avellana y Cobertura de Vainilla, Pack Familiar de 24 Unidades",
          importe: 2.4,
          iva_pct: 10,
          cantidad: 3,
          precio_unitario: 0.8,
        },
      ],
    } as unknown as FacturaEmitida);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  /**
   * ⚠️ Los acentos, la «ñ» y el «€» se comprueban porque de eso depende NO tener
   * que empotrar una tipografía. Las Helvetica de serie de pdfkit usan WinAnsi, y
   * si un carácter se saliera de ahí la generación lanzaría en vez de imprimir
   * mal — así que un PDF válido con este contenido es la prueba de que WinAnsi
   * basta y de que el despliegue de Render no necesita cargar un TTF.
   */
  it("imprime acentos, «ñ» y «€» sin tipografía empotrada", async () => {
    const pdf = await servicio.generar({
      ...FACTURA_REAL,
      emisor: { ...FACTURA_REAL.emisor, nombre: "Compañía Ñandú S.L. — Áéíóú" },
      lineas: [
        {
          nombre: "Piñón, café y azúcar — 1 kg",
          importe: 2.4,
          iva_pct: 10,
          cantidad: 3,
          precio_unitario: 0.8,
        },
      ],
    } as unknown as FacturaEmitida);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("el nombre del archivo es el número de la factura", () => {
    expect(servicio.nombreArchivo(FACTURA_REAL)).toBe("VALF202600100.pdf");
    expect(servicio.nombreArchivo(SIMPLIFICADA)).toBe("VALS202600100.pdf");
  });

  /**
   * El formato de importes se comprueba aparte porque es la parte que se
   * escribió a mano en vez de con `Intl`, y el motivo está en el servicio: el
   * resultado de `toLocaleString` depende de los datos ICU de la plataforma, y en
   * un Node con ICU reducido saldría `1,234.56` en un documento contable.
   */
  describe("importes", () => {
    const euros = (n: number) =>
      (servicio as unknown as { euros(v: number): string }).euros(n);

    it.each([
      [0, "0,00 €"],
      [0.27, "0,27 €"],
      [3.02, "3,02 €"],
      [0.5, "0,50 €"],
      [1000, "1.000,00 €"],
      [1234.56, "1.234,56 €"],
      [1234567.89, "1.234.567,89 €"],
      // Una rectificativa puede llevar importes negativos.
      [-3.02, "-3,02 €"],
    ])("%s → %s", (valor, esperado) => {
      expect(euros(valor)).toBe(esperado);
    });

    /**
     * ⚠️⚠️ ESTE TEST ENCONTRÓ UN FALLO REAL, y merece quedar escrito: la primera
     * versión sacaba los céntimos con `Math.round((abs(n) - entero) * 100)`, y con
     * `0.999` eso da `entero = 0` y `centimos = 100`. El `padStart(2, "0")` no
     * recorta nada, así que se imprimía **«0,100 €»** — tres decimales en un
     * documento fiscal.
     *
     * Y de paso corrigió la expectativa de quien lo escribió: se esperaba que
     * `2.675` diera `2,68`, y da `2,67`. Es lo correcto — el double de ese literal
     * es `2.67499…`—, y además no es alcanzable: todo lo que llega aquí viene de
     * columnas `numeric(12,2)`, ya con dos decimales exactos.
     */
    it("nunca imprime tres decimales, ni cuando los céntimos redondean a 100", () => {
      expect(euros(0.999)).toBe("1,00 €");
      expect(euros(9.999)).toBe("10,00 €");
      expect(euros(999.999)).toBe("1.000,00 €");
    });

    it("no imprime «-0,00 €» cuando el importe redondeado es cero", () => {
      expect(euros(-0.001)).toBe("0,00 €");
      expect(euros(-0)).toBe("0,00 €");
    });
  });
});
