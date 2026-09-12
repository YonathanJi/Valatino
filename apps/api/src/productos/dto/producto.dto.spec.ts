import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductoDto, UpdateProductoDto } from "./producto.dto";

/**
 * ⚠️⚠️ POR QUÉ EXISTE ESTE FICHERO, Y QUÉ FALLO LO TRAJO.
 *
 * El 12/09 se añadió `destacado` a la tabla, al tipo, al servicio y al formulario del
 * panel. Se comprobó que la API **devolvía** el campo y se dio por bueno. Al guardar
 * desde el panel salía «property destacado should not exist».
 *
 * El motivo: la validación global va con `whitelist` + `forbidNonWhitelisted` (ver
 * `main.ts`), así que una propiedad que no esté declarada en el DTO **no se ignora:
 * se rechaza la petición entera**. El camino de LECTURA y el de ESCRITURA no son el
 * mismo, y solo se había comprobado el primero.
 *
 * ⭐ Y no había NI UN test de DTO en todo el proyecto, así que nada podía avisar. Este
 * fichero no prueba `destacado`: prueba que **el DTO acepta exactamente lo que el
 * panel envía**, que es la clase entera de fallo. El próximo campo que se añada al
 * formulario y se olvide aquí rompe este test el día que se escriba.
 */

/**
 * El cuerpo que manda `ProductoForm` del panel, campo por campo.
 *
 * ⚠️ Es el mismo dato en dos sitios —el formulario y esto— y no se puede evitar: el
 * panel es otra aplicación y no puede importar los DTO de la API. Lo que sí se puede
 * es **vigilar la duplicación**, que es lo que hace este fichero. Al tocar el payload
 * de `ProductoForm`, tocar esto.
 */
const LO_QUE_ENVIA_EL_PANEL = {
  nombre: "Nucita",
  descripcion: "Crema de avellana y cacao en vasito.",
  precio: 0.5,
  iva_pct: 10,
  categoria: "Dulces",
  imagenes: ["https://ejemplo.supabase.co/storage/v1/object/public/productos/nucita.webp"],
  activo: true,
  destacado: false,
  familia: null,
  variante: null,
  variante_tipo: null,
};

/** La misma configuración que `main.ts`, o el test no probaría lo que pasa de verdad. */
const COMO_EN_PRODUCCION = { whitelist: true, forbidNonWhitelisted: true };

describe("el DTO de producto acepta lo que envía el panel", () => {
  it("al crear", async () => {
    const dto = plainToInstance(CreateProductoDto, LO_QUE_ENVIA_EL_PANEL);
    const errores = await validate(dto, COMO_EN_PRODUCCION);

    expect(errores.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`)).toEqual(
      [],
    );
  });

  it("al editar", async () => {
    const dto = plainToInstance(UpdateProductoDto, LO_QUE_ENVIA_EL_PANEL);
    const errores = await validate(dto, COMO_EN_PRODUCCION);

    expect(errores.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`)).toEqual(
      [],
    );
  });

  /**
   * ⭐ El control del test: si esto NO fallara, el de arriba tampoco probaría nada —
   * significaría que el DTO acepta cualquier cosa y que `forbidNonWhitelisted` no
   * está actuando en la comprobación.
   */
  it("y sigue rechazando lo que no conoce", async () => {
    const dto = plainToInstance(UpdateProductoDto, {
      ...LO_QUE_ENVIA_EL_PANEL,
      inventado: true,
    });
    const errores = await validate(dto, COMO_EN_PRODUCCION);

    expect(errores).toHaveLength(1);
    expect(errores[0]?.property).toBe("inventado");
  });

  /** Marcar y desmarcar el destacado son las dos operaciones del panel. */
  it("acepta destacado en los dos sentidos", async () => {
    for (const destacado of [true, false]) {
      const dto = plainToInstance(UpdateProductoDto, { destacado });
      expect(await validate(dto, COMO_EN_PRODUCCION)).toEqual([]);
    }
  });

  /** Y no se lo cree si no es booleano: un "on" de formulario mal convertido. */
  it("pero no un destacado que no sea booleano", async () => {
    const dto = plainToInstance(UpdateProductoDto, { destacado: "on" });
    const errores = await validate(dto, COMO_EN_PRODUCCION);

    expect(errores).toHaveLength(1);
    expect(errores[0]?.property).toBe("destacado");
  });
});
