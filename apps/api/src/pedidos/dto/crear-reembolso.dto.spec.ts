import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { CrearReembolsoDto } from "./crear-reembolso.dto";

/**
 * El body de un reembolso entra por el ValidationPipe global antes de llegar al
 * servicio, así que es aquí donde se comprueba lo que se puede colar. Mismo
 * pipe que main.ts: si aquí pasa, en producción pasa.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validar = (valor: unknown) =>
  pipe.transform(valor, { type: "body", metatype: CrearReembolsoDto as never });

const UUID = "3c2a4488-6e2c-4377-a4bd-c260c83bfb50";

describe("CrearReembolsoDto", () => {
  it("acepta el cuerpo vacío: devolver todo lo pendiente", async () => {
    await expect(validar({})).resolves.toEqual({});
  });

  it("acepta artículos con sus unidades", async () => {
    const cuerpo = {
      lineas: [{ pedido_item_id: UUID, cantidad: 2 }],
      reponer_stock: true,
      motivo: "Llegó roto",
    };

    await expect(validar(cuerpo)).resolves.toMatchObject(cuerpo);
  });

  /**
   * Lo que de verdad protege esta prueba: el precio no viaja en el body. Si
   * alguien añade un `importe` por línea, `forbidNonWhitelisted` lo rechaza en
   * vez de que el servicio decida si creérselo.
   */
  it("rechaza un importe metido dentro de una línea", async () => {
    await expect(
      validar({ lineas: [{ pedido_item_id: UUID, cantidad: 1, importe: 9999 }] }),
    ).rejects.toThrow();
  });

  it("rechaza cantidades de cero, negativas o con decimales", async () => {
    for (const cantidad of [0, -1, 1.5]) {
      await expect(validar({ lineas: [{ pedido_item_id: UUID, cantidad }] })).rejects.toThrow();
    }
  });

  it("rechaza un identificador de línea que no es un UUID", async () => {
    await expect(
      validar({ lineas: [{ pedido_item_id: "'; drop table pedidos; --", cantidad: 1 }] }),
    ).rejects.toThrow();
  });

  it("rechaza una lista de artículos vacía", async () => {
    await expect(validar({ lineas: [] })).rejects.toThrow();
  });

  it("rechaza un importe de cero o negativo", async () => {
    for (const importe of [0, -5]) {
      await expect(validar({ importe })).rejects.toThrow();
    }
  });

  it("rechaza un importe con más de dos decimales", async () => {
    await expect(validar({ importe: 1.239 })).rejects.toThrow();
  });

  it("rechaza un campo que no existe en el DTO", async () => {
    await expect(validar({ importe: 1, inventado: true })).rejects.toThrow();
  });
});
