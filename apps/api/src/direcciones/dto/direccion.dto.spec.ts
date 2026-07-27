import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { CreateDireccionDto, UpdateDireccionDto } from "./direccion.dto";

/**
 * Regresión del bug que impedía guardar direcciones desde /cuenta/perfil: el
 * front enviaba snake_case y los DTO esperaban camelCase, así que el
 * ValidationPipe global respondía 400 a todo. Se valida con la MISMA
 * configuración de pipe que main.ts.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validar = (valor: unknown, metatype: unknown) =>
  pipe.transform(valor, { type: "body", metatype: metatype as never });

// Copiado del payload real de apps/web/app/cuenta/perfil/page.tsx
const direccionDelFormulario = {
  nombre_destinatario: "Ana Pérez",
  linea1: "Calle Mayor 3",
  linea2: "2ºB",
  ciudad: "Madrid",
  codigo_postal: "28001",
  provincia: "Madrid",
  telefono: "600112233",
};

describe("CreateDireccionDto", () => {
  it("acepta el payload que envía el formulario de perfil", async () => {
    await expect(validar(direccionDelFormulario, CreateDireccionDto)).resolves.toMatchObject(
      direccionDelFormulario,
    );
  });

  it("acepta que linea2 venga ausente (dirección sin piso)", async () => {
    const { linea2: _omitida, ...sinLinea2 } = direccionDelFormulario;
    await expect(validar(sinLinea2, CreateDireccionDto)).resolves.toBeDefined();
  });

  it("rechaza las claves camelCase antiguas", async () => {
    await expect(
      validar(
        {
          nombreDestinatario: "Ana Pérez",
          linea1: "Calle Mayor 3",
          ciudad: "Madrid",
          codigoPostal: "28001",
          provincia: "Madrid",
        },
        CreateDireccionDto,
      ),
    ).rejects.toBeDefined();
  });

  it("rechaza campos obligatorios vacíos", async () => {
    await expect(
      validar({ ...direccionDelFormulario, ciudad: "" }, CreateDireccionDto),
    ).rejects.toBeDefined();
  });

  it("rechaza propiedades no declaradas (no se puede colar user_id)", async () => {
    await expect(
      validar({ ...direccionDelFormulario, user_id: "otro-usuario" }, CreateDireccionDto),
    ).rejects.toBeDefined();
  });

  it("exige que pais sea ISO de 2 letras", async () => {
    await expect(
      validar({ ...direccionDelFormulario, pais: "España" }, CreateDireccionDto),
    ).rejects.toBeDefined();
    await expect(
      validar({ ...direccionDelFormulario, pais: "ES" }, CreateDireccionDto),
    ).resolves.toBeDefined();
  });

  it("rechaza un teléfono que no es español", async () => {
    await expect(
      validar({ ...direccionDelFormulario, telefono: "12345" }, CreateDireccionDto),
    ).rejects.toBeDefined();
  });

  it("acepta el teléfono con prefijo y espacios, como lo teclea la gente", async () => {
    await expect(
      validar({ ...direccionDelFormulario, telefono: "+34 600 11 22 33" }, CreateDireccionDto),
    ).resolves.toBeDefined();
  });

  it("acepta una dirección sin teléfono: las de antes de la 040 no lo tienen", async () => {
    const { telefono: _sin, ...sinTelefono } = direccionDelFormulario;
    await expect(validar(sinTelefono, CreateDireccionDto)).resolves.toBeDefined();
  });
});

describe("UpdateDireccionDto", () => {
  it("acepta una actualización parcial", async () => {
    await expect(validar({ ciudad: "Valencia" }, UpdateDireccionDto)).resolves.toMatchObject({
      ciudad: "Valencia",
    });
  });

  it("acepta el payload completo del formulario", async () => {
    await expect(validar(direccionDelFormulario, UpdateDireccionDto)).resolves.toBeDefined();
  });

  it("acepta marcar la dirección como predeterminada", async () => {
    await expect(
      validar({ es_predeterminada: true }, UpdateDireccionDto),
    ).resolves.toMatchObject({ es_predeterminada: true });
  });

  // Es el PATCH que hace el checkout cuando la dirección elegida se guardó sin
  // teléfono: solo manda ese campo.
  it("acepta añadir únicamente el teléfono", async () => {
    await expect(validar({ telefono: "600112233" }, UpdateDireccionDto)).resolves.toMatchObject({
      telefono: "600112233",
    });
  });

  it("acepta la cadena vacía para borrar el teléfono", async () => {
    await expect(validar({ telefono: "" }, UpdateDireccionDto)).resolves.toMatchObject({
      telefono: "",
    });
  });
});
