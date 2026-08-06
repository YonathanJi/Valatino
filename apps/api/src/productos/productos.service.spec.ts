import { NotFoundException } from "@nestjs/common";
import { ProductosService } from "./productos.service";

/**
 * Estos tests cubren una sola cosa, y es la que se rompe en silencio: que al
 * cambiar las imágenes de un producto **las que se quitan se borran del
 * bucket**. El bucket es público, así que un fichero que se queda suelto sigue
 * siendo descargable por su URL aunque ya no esté en ningún producto — quitar
 * una imagen del catálogo no la retiraba de internet.
 *
 * Se prueba aquí y no contra Supabase porque lo que importa es qué rutas se le
 * piden borrar y cuándo: la fuga era no pedirlo nunca.
 */

const PUB = "https://proyecto.supabase.co/storage/v1/object/public/productos/";

function montar(
  opts: { imagenesActuales?: string[] | null; updateFalla?: boolean } = {},
) {
  const registro = {
    /** Cada llamada a storage.remove(), con sus rutas */
    borrados: [] as string[][],
    actualizado: null as Record<string, unknown> | null,
  };

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              opts.imagenesActuales === null
                ? null
                : { imagenes: opts.imagenesActuales ?? [] },
            error: null,
          }),
        }),
      }),
      update: (valores: Record<string, unknown>) => {
        registro.actualizado = valores;
        return {
          eq: () => ({
            select: () => ({
              single: async () =>
                opts.updateFalla
                  ? { data: null, error: { message: "fallo simulado" } }
                  : { data: { id: "p-1", ...valores }, error: null },
            }),
          }),
        };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          registro.borrados.push(paths);
          return { error: null };
        },
      }),
    },
  };

  return { servicio: new ProductosService(supabase as never), registro };
}

describe("ProductosService — limpieza del bucket al cambiar imágenes", () => {
  it("al reemplazar la imagen, borra la anterior del bucket", async () => {
    const { servicio, registro } = montar({ imagenesActuales: [`${PUB}vieja.webp`] });

    await servicio.update("p-1", { imagenes: [`${PUB}nueva.webp`] });

    expect(registro.borrados).toEqual([["vieja.webp"]]);
  });

  it("al quitar todas las imágenes, borra todas", async () => {
    const { servicio, registro } = montar({
      imagenesActuales: [`${PUB}a.webp`, `${PUB}b.webp`],
    });

    await servicio.update("p-1", { imagenes: [] });

    expect(registro.borrados).toEqual([["a.webp", "b.webp"]]);
  });

  it("si se conserva una y se añade otra, no borra ninguna", async () => {
    const { servicio, registro } = montar({ imagenesActuales: [`${PUB}a.webp`] });

    await servicio.update("p-1", { imagenes: [`${PUB}a.webp`, `${PUB}b.webp`] });

    expect(registro.borrados).toEqual([]);
  });

  it("una edición que NO toca las imágenes no borra nada", async () => {
    // El caso peligroso: cambiar el precio no puede llevarse las fotos por
    // delante. `imagenes` ausente en el dto significa "no las toques".
    const { servicio, registro } = montar({ imagenesActuales: [`${PUB}a.webp`] });

    await servicio.update("p-1", { precio: 3.5 } as never);

    expect(registro.borrados).toEqual([]);
  });

  it("si la escritura falla, no borra nada", async () => {
    // Las imágenes de las que se venía siguen siendo las buenas: borrarlas
    // dejaría el producto apuntando a ficheros que ya no existen.
    const { servicio, registro } = montar({
      imagenesActuales: [`${PUB}a.webp`],
      updateFalla: true,
    });

    await expect(servicio.update("p-1", { imagenes: [] })).rejects.toThrow(NotFoundException);
    expect(registro.borrados).toEqual([]);
  });

  it("ignora las URLs que no son de nuestro bucket", async () => {
    const { servicio, registro } = montar({
      imagenesActuales: ["https://cdn.ajeno.com/foto.jpg"],
    });

    await servicio.update("p-1", { imagenes: [] });

    expect(registro.borrados).toEqual([]);
  });

  it("al borrar el producto, borra sus imágenes del bucket", async () => {
    const { servicio, registro } = montar({
      imagenesActuales: [`${PUB}a.webp`, `${PUB}b.webp`],
    });

    await servicio.remove("p-1");

    expect(registro.borrados).toEqual([["a.webp", "b.webp"]]);
  });
});
