import { compraItemsSchema } from "./compra.dto";
import { normalizarCif } from "./proveedor.dto";

const lineaValida = {
  productoId: "3f7a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
  cantidad: 12,
  costoUnitario: 1.2345,
  ivaPct: 10,
};

describe("compraItemsSchema", () => {
  it("acepta una línea correcta", () => {
    expect(compraItemsSchema.safeParse([lineaValida]).success).toBe(true);
  });

  it("exige al menos una línea", () => {
    expect(compraItemsSchema.safeParse([]).success).toBe(false);
  });

  it("tope de 200 líneas por compra", () => {
    const muchas = Array.from({ length: 201 }, () => lineaValida);
    expect(compraItemsSchema.safeParse(muchas).success).toBe(false);
  });

  it("rechaza cantidades no positivas o fraccionarias", () => {
    for (const cantidad of [0, -1, 1.5]) {
      expect(compraItemsSchema.safeParse([{ ...lineaValida, cantidad }]).success).toBe(false);
    }
  });

  it("rechaza un costo negativo pero admite cero (muestras, regalos)", () => {
    expect(compraItemsSchema.safeParse([{ ...lineaValida, costoUnitario: -0.01 }]).success).toBe(
      false,
    );
    expect(compraItemsSchema.safeParse([{ ...lineaValida, costoUnitario: 0 }]).success).toBe(true);
  });

  it("admite hasta 4 decimales en el costo y rechaza el quinto", () => {
    expect(compraItemsSchema.safeParse([{ ...lineaValida, costoUnitario: 0.0001 }]).success).toBe(
      true,
    );
    expect(compraItemsSchema.safeParse([{ ...lineaValida, costoUnitario: 0.00001 }]).success).toBe(
      false,
    );
  });

  it("solo admite los tipos de IVA españoles (4, 10, 21)", () => {
    for (const ivaPct of [4, 10, 21]) {
      expect(compraItemsSchema.safeParse([{ ...lineaValida, ivaPct }]).success).toBe(true);
    }
    for (const ivaPct of [0, 7, 21.5, 100]) {
      expect(compraItemsSchema.safeParse([{ ...lineaValida, ivaPct }]).success).toBe(false);
    }
  });

  it("rechaza un productoId que no es UUID", () => {
    expect(compraItemsSchema.safeParse([{ ...lineaValida, productoId: "abc" }]).success).toBe(
      false,
    );
  });
});

describe("normalizarCif", () => {
  it("pasa a mayúsculas y quita espacios y guiones", () => {
    expect(normalizarCif(" b-12 345 678 ")).toBe("B12345678");
    expect(normalizarCif("x1234567l")).toBe("X1234567L");
  });

  it("es idempotente", () => {
    const una = normalizarCif("b-12345678");
    expect(normalizarCif(una)).toBe(una);
  });
});

