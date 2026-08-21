import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { GuardarAjustesEnvioDto } from "./ajustes-envio.dto";

/**
 * La tarifa entra por el ValidationPipe global antes de llegar al servicio, así
 * que es aquí donde se comprueba lo que se puede colar. Mismo pipe que main.ts:
 * si aquí pasa, en producción pasa.
 *
 * ⚠️ Y lo que se cuela aquí se le cobra a cada cliente que compre. Un céntimo de
 * más se ve; un 4995 por 49,95 se cobra hasta que alguien lo mire.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validar = (valor: unknown) =>
  pipe.transform(valor, { type: "body", metatype: GuardarAjustesEnvioDto as never });

describe("GuardarAjustesEnvioDto", () => {
  it("acepta una tarifa con umbral", async () => {
    await expect(validar({ coste: 4.95, gratis_desde: 40 })).resolves.toEqual({
      coste: 4.95,
      gratis_desde: 40,
    });
  });

  it("acepta una tarifa sin umbral", async () => {
    await expect(validar({ coste: 4.95 })).resolves.toEqual({ coste: 4.95 });
  });

  it("acepta el umbral explícitamente nulo: es como se quita", async () => {
    await expect(validar({ coste: 4.95, gratis_desde: null })).resolves.toEqual({
      coste: 4.95,
      gratis_desde: null,
    });
  });

  /** 0 es apagar el porte, y es un valor legítimo: es la tienda de siempre. */
  it("acepta un coste de 0", async () => {
    await expect(validar({ coste: 0 })).resolves.toEqual({ coste: 0 });
  });

  it("rechaza un coste negativo", async () => {
    await expect(validar({ coste: -1 })).rejects.toThrow();
  });

  /**
   * ⚠️ EL CORTAFUEGOS DEL DEDO GORDO. No es una regla de negocio: es que un 4995
   * escrito por 49,95 se le cobraría a cada cliente, y un porte de 4.995 € no lo
   * quiere nadie ni por error.
   */
  it("rechaza un coste desorbitado", async () => {
    await expect(validar({ coste: 4995 })).rejects.toThrow();
  });

  it("rechaza más de dos decimales en el coste: el dinero llega a céntimos", async () => {
    await expect(validar({ coste: 4.955 })).rejects.toThrow();
  });

  /**
   * ⚠️⚠️ EL UMBRAL DE 0, que es el que había que cerrar. No significa «gratis
   * desde 0 €»: es una casilla a medio rellenar que dejaría el envío gratis
   * SIEMPRE sin que nadie lo haya decidido. Para no cobrar envío está `coste: 0`,
   * que sí lo dice. Lo respalda además un CHECK en la base (080 §1).
   */
  it("rechaza un umbral de 0", async () => {
    await expect(validar({ coste: 4.95, gratis_desde: 0 })).rejects.toThrow();
  });

  it("rechaza un umbral negativo", async () => {
    await expect(validar({ coste: 4.95, gratis_desde: -10 })).rejects.toThrow();
  });

  it("rechaza un coste que no es número", async () => {
    await expect(validar({ coste: "4,95" })).rejects.toThrow();
  });

  it("rechaza el cuerpo sin coste: no hay tarifa por defecto", async () => {
    await expect(validar({})).rejects.toThrow();
  });

  it("rechaza campos que no son de la tarifa", async () => {
    await expect(validar({ coste: 4.95, zona: "canarias" })).rejects.toThrow();
  });
});
