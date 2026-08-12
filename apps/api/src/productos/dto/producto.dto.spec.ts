import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { AjustarStockDto, CreateProductoDto, UpdateProductoDto } from "./producto.dto";

/** Mismo pipe que main.ts: si aquí pasa, en producción pasa. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validar = (valor: unknown, metatype: unknown) =>
  pipe.transform(valor, { type: "body", metatype: metatype as never });

const BASE = { nombre: "Pony Malta", precio: 1.5, categoria: "Bebidas", iva_pct: 21 };

/**
 * El tipo de IVA es lo que hace que una venta sea declarable (migración 062).
 * Antes de tenerlo, el IVA repercutido de un pedido no era CALCULABLE: el precio
 * es un número sin tipo asociado y el catálogo mezcla el 4, el 10 y el 21.
 *
 * Estas pruebas fijan la frontera de la API. La regla de redondeo NO se prueba
 * aquí a propósito: vive en SQL (`recalcular_iva_pedido`) y escribirla también
 * en TypeScript para poder testearla sería crear el segundo sitio que redondea,
 * que es justo lo que esa función existe para evitar.
 */
describe("CreateProductoDto — el tipo de IVA", () => {
  it("acepta los tres tipos del impuesto", async () => {
    for (const iva_pct of [4, 10, 21]) {
      await expect(validar({ ...BASE, iva_pct }, CreateProductoDto)).resolves.toMatchObject({
        iva_pct,
      });
    }
  });

  /**
   * Sin valor por defecto a propósito: un defecto sería inventarse un número que
   * acaba en el modelo 303, y lo peor de un número inventado es que parece
   * puesto. Que falle al crear es ruidoso e inofensivo; declarar de menos, no.
   */
  it("es obligatorio: crear un producto sin él se rechaza", async () => {
    const { iva_pct: _omitido, ...sinIva } = BASE;
    await expect(validar(sinIva, CreateProductoDto)).rejects.toThrow();
  });

  it("no acepta un tipo inventado", async () => {
    for (const iva_pct of [0, 7, 16, 21.5, 100, -21]) {
      await expect(validar({ ...BASE, iva_pct }, CreateProductoDto)).rejects.toThrow();
    }
  });

  /**
   * El 0 se rechaza como cualquier otro número raro, y no es un olvido: una
   * operación exenta no es «IVA al cero», va a otra casilla del 303 y necesita
   * más que un tipo distinto.
   */
  it("el 0 (exento) se rechaza, y el mensaje dice cuáles valen", async () => {
    // El detalle de la ValidationPipe va en el cuerpo de la respuesta, no en
    // `error.message` (que es siempre «Bad Request Exception»). Es lo que ve
    // quien llama a la API, así que es lo que hay que comprobar.
    const error = await validar({ ...BASE, iva_pct: 0 }, CreateProductoDto).catch((e) => e);
    const cuerpo = (error as BadRequestException).getResponse() as { message: string[] };

    expect(cuerpo.message.join(" ")).toMatch(/El IVA debe ser 4, 10, 21/);
  });

  it("un tipo en texto no cuela", async () => {
    await expect(validar({ ...BASE, iva_pct: "21" }, CreateProductoDto)).rejects.toThrow();
  });
});

describe("UpdateProductoDto — el tipo de IVA", () => {
  /** Editar el precio de un producto no debería obligar a repetir su IVA. */
  it("es opcional: se puede editar otra cosa sin mandarlo", async () => {
    await expect(validar({ precio: 1.6 }, UpdateProductoDto)).resolves.toEqual({ precio: 1.6 });
  });

  it("pero si viene, sigue teniendo que ser uno de los tres", async () => {
    await expect(validar({ iva_pct: 10 }, UpdateProductoDto)).resolves.toEqual({ iva_pct: 10 });
    await expect(validar({ iva_pct: 16 }, UpdateProductoDto)).rejects.toThrow();
  });
});

/**
 * El motivo del ajuste (migración 063). Sin él el stock no era reconstruible:
 * se comprobó contra la base real que 19 de 20 productos se deducen de sus
 * movimientos, y el que no —una caja de Quipitos— tenía una unidad puesta a
 * mano de la que no quedaba ningún rastro.
 */
describe("AjustarStockDto", () => {
  it("acepta los motivos del vocabulario", async () => {
    for (const motivo of ["rotura", "merma", "caducidad", "recuento", "correccion"]) {
      await expect(validar({ cantidad: 3, motivo }, AjustarStockDto)).resolves.toMatchObject({
        motivo,
      });
    }
  });

  /** Rotura, merma y caducidad son salidas: sin signo negativo no se registran. */
  it("acepta cantidades negativas: quitar stock también es un ajuste", async () => {
    await expect(
      validar({ cantidad: -2, motivo: "rotura" }, AjustarStockDto),
    ).resolves.toMatchObject({ cantidad: -2 });
  });

  it("cero sigue sin ser un ajuste", async () => {
    await expect(validar({ cantidad: 0, motivo: "recuento" }, AjustarStockDto)).rejects.toThrow();
  });

  it("un motivo inventado se rechaza", async () => {
    await expect(validar({ cantidad: 1, motivo: "porque_si" }, AjustarStockDto)).rejects.toThrow();
  });

  /**
   * Opcional en el DTO para no romper a quien llame sin él; la RPC lo apunta
   * como `sin_indicar`. El panel lo pide siempre.
   */
  it("es opcional, para no romper a quien llame sin él", async () => {
    await expect(validar({ cantidad: 5 }, AjustarStockDto)).resolves.toEqual({ cantidad: 5 });
  });

  it("la nota tiene tope: no es un cajón de sastre", async () => {
    await expect(
      validar({ cantidad: 1, motivo: "merma", nota: "x".repeat(301) }, AjustarStockDto),
    ).rejects.toThrow();
  });
});
