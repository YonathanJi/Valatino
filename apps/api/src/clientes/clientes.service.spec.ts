import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ClientesService } from "./clientes.service";

type Rol = "cliente" | "admin" | "asesor" | null;

/**
 * Doble del cliente de Supabase con lo justo que usa el servicio: la RPC del
 * listado, la lectura del rol, el upsert de profiles, el conteo de pedidos y el
 * borrado de la cuenta.
 */
function montar(opciones: { rol?: Rol; pedidos?: number; errorUpsert?: { code: string } } = {}) {
  const { rol = "cliente", pedidos = 0, errorUpsert } = opciones;

  const registro = {
    upserts: [] as Record<string, unknown>[],
    borrados: [] as string[],
  };

  const supabase = {
    rpc: async (fn: string) => {
      if (fn !== "listar_clientes") return { data: null, error: { message: "rpc inesperada" } };
      return {
        data: [
          {
            user_id: "cli-1",
            email: "cliente@ejemplo.com",
            nombre: "Ana Pérez",
            telefono: null,
            documento: "12345678A",
            tiene_cuenta: true,
            cliente_desde: "2026-07-01T00:00:00Z",
            pedidos,
            total_gastado: "49.99",
            ultimo_pedido: "2026-07-20T00:00:00Z",
          },
        ],
        error: null,
      };
    },
    from: (tabla: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data: rol ? { roles: { nombre: rol } } : null,
              error: null,
            }),
          }),
          order: async () => ({ data: [], error: null }),
          // conteo de pedidos (select con head)
          then: undefined,
          count: opts?.count ? pedidos : undefined,
        }),
      }),
      upsert: async (valores: Record<string, unknown>) => {
        registro.upserts.push(valores);
        return { error: errorUpsert ?? null };
      },
      _tabla: tabla,
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          registro.borrados.push(id);
          return { error: null };
        },
      },
    },
  };

  return { servicio: new ClientesService(supabase as never), registro };
}

describe("ClientesService.findAll", () => {
  it("convierte total_gastado a número (la RPC lo devuelve como texto)", async () => {
    const { servicio } = montar();

    const [cliente] = await servicio.findAll();

    expect(typeof cliente!.total_gastado).toBe("number");
    expect(cliente!.total_gastado).toBe(49.99);
  });
});

describe("ClientesService.actualizar", () => {
  it("guarda los datos de contacto y sella updated_at", async () => {
    const { servicio, registro } = montar();

    await servicio.actualizar("cli-1", { nombre: "  Ana Pérez  ", telefono: "600111222" });

    expect(registro.upserts).toHaveLength(1);
    expect(registro.upserts[0]).toMatchObject({
      id: "cli-1",
      nombre: "Ana Pérez", // recortado
      telefono: "600111222",
    });
    expect(registro.upserts[0]!["updated_at"]).toBeDefined();
  });

  it("convierte una cadena vacía en null en lugar de guardarla", async () => {
    const { servicio, registro } = montar();

    await servicio.actualizar("cli-1", { telefono: "", documento: "" });

    expect(registro.upserts[0]).toMatchObject({ telefono: null, documento: null });
  });

  it("nunca escribe el email, aunque llegara en el objeto", async () => {
    const { servicio, registro } = montar();

    await servicio.actualizar("cli-1", { nombre: "Ana" });

    expect(Object.keys(registro.upserts[0]!)).not.toContain("email");
  });

  it("rechaza un cuerpo sin cambios", async () => {
    const { servicio } = montar();

    await expect(servicio.actualizar("cli-1", {})).rejects.toThrow(BadRequestException);
  });

  it("traduce un documento duplicado a 409", async () => {
    const { servicio } = montar({ errorUpsert: { code: "23505" } });

    await expect(
      servicio.actualizar("cli-1", { documento: "12345678A" }),
    ).rejects.toThrow(ConflictException);
  });

  it("no deja tocar una cuenta del staff desde este módulo", async () => {
    for (const rol of ["admin", "asesor"] as const) {
      const { servicio, registro } = montar({ rol });

      await expect(servicio.actualizar("staff-1", { nombre: "X" })).rejects.toThrow(
        BadRequestException,
      );
      expect(registro.upserts).toHaveLength(0);
    }
  });

  it("404 si el usuario no tiene ningún rol", async () => {
    const { servicio } = montar({ rol: null });

    await expect(servicio.actualizar("fantasma", { nombre: "X" })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("ClientesService.eliminar", () => {
  it("borra la cuenta del cliente", async () => {
    const { servicio, registro } = montar();

    const r = await servicio.eliminar("cli-1");

    expect(registro.borrados).toEqual(["cli-1"]);
    expect(r.message).toMatch(/eliminada/i);
  });

  it("no borra cuentas del staff", async () => {
    const { servicio, registro } = montar({ rol: "admin" });

    await expect(servicio.eliminar("staff-1")).rejects.toThrow(BadRequestException);
    expect(registro.borrados).toEqual([]);
  });

  it("404 si no existe", async () => {
    const { servicio, registro } = montar({ rol: null });

    await expect(servicio.eliminar("fantasma")).rejects.toThrow(NotFoundException);
    expect(registro.borrados).toEqual([]);
  });
});
