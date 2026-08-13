import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { UpdateModulosDto } from "./update-modulos.dto";
import { UpdateRolDto } from "./update-rol.dto";
import { ProvisionarCuentaDto } from "./provisionar-cuenta.dto";

/** Mismo pipe que main.ts: si aquí pasa, en producción pasa. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validar = (valor: unknown, metatype: unknown) =>
  pipe.transform(valor, { type: "body", metatype: metatype as never });

describe("array de permisos", () => {
  it("acepta módulos válidos con su nivel", async () => {
    const dto = await validar(
      { permisos: [{ modulo: "pedidos", nivel: "total" }, { modulo: "catalogo", nivel: "lectura" }] },
      UpdateModulosDto,
    );
    expect(dto).toEqual({
      permisos: [
        { modulo: "pedidos", nivel: "total" },
        { modulo: "catalogo", nivel: "lectura" },
      ],
    });
  });

  it("acepta la lista vacía: es como se deja a alguien sin acceso a nada", async () => {
    await expect(validar({ permisos: [] }, UpdateModulosDto)).resolves.toEqual({ permisos: [] });
  });

  it("rechaza un nivel inventado", async () => {
    await expect(
      validar({ permisos: [{ modulo: "pedidos", nivel: "superusuario" }] }, UpdateModulosDto),
    ).rejects.toThrow();
  });

  /**
   * ⚠️ El valor inventado NO puede ser un nombre plausible de módulo. Aquí
   * decía «contabilidad», y el día que ese módulo existió de verdad (migración
   * 068) el test empezó a fallar sin que nada estuviera roto. Con un centinela
   * que nadie va a dar de alta, el test comprueba lo que dice comprobar.
   */
  it("rechaza un módulo inventado", async () => {
    await expect(
      validar({ permisos: [{ modulo: "__inventado__", nivel: "lectura" }] }, UpdateModulosDto),
    ).rejects.toThrow();
  });

  /**
   * El caso por el que @ArrayUnique lleva selector. Sin él compara por
   * referencia de objeto, así que estas dos entradas le parecen distintas,
   * llegan a la base de datos y chocan contra la clave primaria: un 500 en vez
   * de un 400.
   */
  it("rechaza el mismo módulo dos veces", async () => {
    await expect(
      validar(
        {
          permisos: [
            { modulo: "pedidos", nivel: "lectura" },
            { modulo: "pedidos", nivel: "total" },
          ],
        },
        UpdateModulosDto,
      ),
    ).rejects.toThrow();
  });

  /** Sin @Type, @ValidateNested no valida nada y esto pasaría el filtro. */
  it("rechaza elementos que no son objetos", async () => {
    await expect(validar({ permisos: ["pedidos"] }, UpdateModulosDto)).rejects.toThrow();
  });

  it("rechaza que falte el nivel", async () => {
    await expect(validar({ permisos: [{ modulo: "pedidos" }] }, UpdateModulosDto)).rejects.toThrow();
  });

  /**
   * El payload anterior al cambio. Se rechaza con un 400 explícito en vez de
   * interpretarse a medias: es lo que hace segura la ventana de despliegue en
   * la que la API va por delante de la web.
   */
  it("rechaza el formato viejo `modulos: string[]`", async () => {
    await expect(validar({ modulos: ["pedidos"] }, UpdateModulosDto)).rejects.toThrow();
  });
});

describe("UpdateRolDto", () => {
  it("los permisos son opcionales al cambiar de rol", async () => {
    await expect(validar({ rol: "admin" }, UpdateRolDto)).resolves.toEqual({ rol: "admin" });
  });

  it("si vienen, se validan igual", async () => {
    await expect(
      validar({ rol: "asesor", permisos: [{ modulo: "pedidos", nivel: "malo" }] }, UpdateRolDto),
    ).rejects.toThrow();
  });

  it("rechaza un rol que no sea admin o asesor", async () => {
    await expect(validar({ rol: "cliente" }, UpdateRolDto)).rejects.toThrow();
  });
});

describe("ProvisionarCuentaDto", () => {
  const base = {
    empleadoId: "3f0f1d4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    email: "asesor@valatino.es",
    password: "unaClaveLarga123",
    permisos: [{ modulo: "pedidos", nivel: "edicion" }],
  };

  it("acepta el caso feliz", async () => {
    await expect(validar(base, ProvisionarCuentaDto)).resolves.toMatchObject({
      empleadoId: base.empleadoId,
      permisos: [{ modulo: "pedidos", nivel: "edicion" }],
    });
  });

  it("rechaza una contraseña corta", async () => {
    await expect(validar({ ...base, password: "corta" }, ProvisionarCuentaDto)).rejects.toThrow();
  });

  it("rechaza un empleadoId que no es UUID", async () => {
    await expect(validar({ ...base, empleadoId: "42" }, ProvisionarCuentaDto)).rejects.toThrow();
  });
});
