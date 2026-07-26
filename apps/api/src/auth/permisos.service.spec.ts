import { InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { PermisosService } from "./permisos.service";
import type { PermisoModulo } from "@valatino/types";

function montar(opciones: { errorRpc?: string; filas?: ({ user_id: string } & PermisoModulo)[] } = {}) {
  const registro = { llamadas: [] as { fn: string; args: Record<string, unknown> }[] };

  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      registro.llamadas.push({ fn, args });
      return { data: null, error: opciones.errorRpc ? { message: opciones.errorRpc } : null };
    },
    from: (tabla: string) => {
      if (tabla !== "staff_modulos") throw new Error(`tabla inesperada: ${tabla}`);
      return {
        select: () => ({
          in: async () => ({ data: opciones.filas ?? [], error: null }),
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { servicio: new PermisosService(supabase), registro };
}

describe("PermisosService.reemplazar", () => {
  it("delega el reemplazo en la RPC transaccional, con el nivel de cada módulo", async () => {
    const { servicio, registro } = montar();
    const permisos: PermisoModulo[] = [
      { modulo: "pedidos", nivel: "total" },
      { modulo: "catalogo", nivel: "lectura" },
    ];

    await servicio.reemplazar("u-1", permisos, "editor-1");

    expect(registro.llamadas).toEqual([
      {
        fn: "reemplazar_staff_modulos",
        args: { p_user_id: "u-1", p_permisos: permisos, p_otorgado_por: "editor-1" },
      },
    ]);
  });

  it("una lista vacía sigue llamando a la RPC: deja a la persona sin permisos", async () => {
    const { servicio, registro } = montar();

    await servicio.reemplazar("u-1", [], "editor-1");

    expect(registro.llamadas).toHaveLength(1);
    expect(registro.llamadas[0].args.p_permisos).toEqual([]);
  });

  it("un fallo de la RPC se reporta como error interno", async () => {
    const { servicio } = montar({ errorRpc: "boom" });

    await expect(
      servicio.reemplazar("u-1", [{ modulo: "pedidos", nivel: "total" }], "editor-1"),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

describe("PermisosService.porUsuario", () => {
  it("agrupa los permisos por persona", async () => {
    const { servicio } = montar({
      filas: [
        { user_id: "u-1", modulo: "pedidos", nivel: "edicion" },
        { user_id: "u-2", modulo: "compras", nivel: "total" },
        { user_id: "u-1", modulo: "clientes", nivel: "lectura" },
      ],
    });

    const mapa = await servicio.porUsuario(["u-1", "u-2"]);

    expect(mapa.get("u-1")).toEqual([
      { modulo: "pedidos", nivel: "edicion" },
      { modulo: "clientes", nivel: "lectura" },
    ]);
    expect(mapa.get("u-2")).toEqual([{ modulo: "compras", nivel: "total" }]);
  });

  it("sin usuarios no consulta nada", async () => {
    const { servicio } = montar();
    expect((await servicio.porUsuario([])).size).toBe(0);
  });
});
