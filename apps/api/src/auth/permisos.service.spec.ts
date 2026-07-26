import { InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { PermisosService } from "./permisos.service";

/**
 * Doble de Supabase con lo justo que toca el servicio: delete filtrado por
 * user_id e insert de las filas nuevas. Registra el orden de las llamadas
 * porque el delete-antes-del-insert es la parte que importa.
 */
function montar(fallos: { enDelete?: boolean; enInsert?: boolean } = {}) {
  const registro = {
    orden: [] as string[],
    borrados: [] as string[],
    insertados: [] as Record<string, unknown>[],
  };

  const supabase = {
    from: (tabla: string) => {
      if (tabla !== "staff_modulos") throw new Error(`tabla inesperada: ${tabla}`);
      return {
        delete: () => ({
          eq: async (_columna: string, valor: string) => {
            registro.orden.push("delete");
            registro.borrados.push(valor);
            return { error: fallos.enDelete ? { message: "boom" } : null };
          },
        }),
        insert: async (filas: Record<string, unknown>[]) => {
          registro.orden.push("insert");
          registro.insertados.push(...filas);
          return { error: fallos.enInsert ? { message: "boom" } : null };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { servicio: new PermisosService(supabase), registro };
}

describe("PermisosService.reemplazar", () => {
  it("borra los módulos anteriores antes de insertar los nuevos", async () => {
    const { servicio, registro } = montar();

    await servicio.reemplazar("u-1", ["pedidos", "catalogo"], "editor-1");

    expect(registro.orden).toEqual(["delete", "insert"]);
    expect(registro.borrados).toEqual(["u-1"]);
    expect(registro.insertados).toEqual([
      { user_id: "u-1", modulo: "pedidos", otorgado_por: "editor-1" },
      { user_id: "u-1", modulo: "catalogo", otorgado_por: "editor-1" },
    ]);
  });

  it("una lista vacía borra y no inserta nada", async () => {
    const { servicio, registro } = montar();

    await servicio.reemplazar("u-1", [], "editor-1");

    expect(registro.orden).toEqual(["delete"]);
    expect(registro.insertados).toHaveLength(0);
  });

  it("si falla el borrado no llega a insertar", async () => {
    const { servicio, registro } = montar({ enDelete: true });

    await expect(servicio.reemplazar("u-1", ["pedidos"], "editor-1")).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(registro.orden).toEqual(["delete"]);
  });

  it("si falla el insert lo reporta como error interno", async () => {
    const { servicio } = montar({ enInsert: true });

    await expect(servicio.reemplazar("u-1", ["pedidos"], "editor-1")).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
