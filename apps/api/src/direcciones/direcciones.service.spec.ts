import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DireccionesService } from "./direcciones.service";

/**
 * Doble del cliente de Supabase con lo justo que usa el servicio: el insert, el
 * update y la lectura de la fila actual (necesaria para validar un PATCH que
 * solo trae uno de los dos campos de la ubicación).
 */
function montar(filaActual: { ciudad: string; codigo_postal: string } | null = null) {
  const registro = {
    insertado: null as Record<string, unknown> | null,
    actualizado: null as Record<string, unknown> | null,
  };

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: filaActual, error: null }),
          }),
          order: async () => ({ data: [], error: null }),
        }),
      }),
      insert: (valores: Record<string, unknown>) => {
        registro.insertado = valores;
        return {
          select: () => ({ single: async () => ({ data: { id: "dir-1", ...valores }, error: null }) }),
        };
      },
      update: (valores: Record<string, unknown>) => {
        registro.actualizado = valores;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { id: "dir-1", ...valores }, error: null }),
              }),
            }),
          }),
        };
      },
    }),
  };

  return {
    servicio: new DireccionesService(supabase as never),
    registro,
  };
}

const DIRECCION_BASE = {
  nombre_destinatario: "Ana Pérez",
  linea1: "Calle Mayor 3",
  ciudad: "Mejorada del Campo",
  codigo_postal: "28840",
  telefono: "600112233",
};

describe("DireccionesService.create", () => {
  it("guarda el municipio con su nombre oficial aunque llegue en minúsculas", async () => {
    const { servicio, registro } = montar();
    await servicio.create("u1", { ...DIRECCION_BASE, ciudad: "mejorada del campo" } as never);
    expect(registro.insertado?.ciudad).toBe("Mejorada del Campo");
  });

  it("DERIVA la provincia del código postal e ignora la que le manden", async () => {
    const { servicio, registro } = montar();
    // Es el caso real que ensució los datos: alguien escribió «españa» en
    // provincia. Ahora no importa lo que llegue, se recalcula.
    await servicio.create("u1", { ...DIRECCION_BASE, provincia: "españa" } as never);
    expect(registro.insertado?.provincia).toBe("Madrid");
  });

  it("normaliza el teléfono y recorta el código postal", async () => {
    const { servicio, registro } = montar();
    await servicio.create("u1", {
      ...DIRECCION_BASE,
      codigo_postal: " 28840 ",
      telefono: "+34 600 11 22 33",
    } as never);
    expect(registro.insertado?.codigo_postal).toBe("28840");
    expect(registro.insertado?.telefono).toBe("600112233");
  });

  it("rechaza un municipio que no es de la provincia del CP, con un mensaje que lo explica", async () => {
    const { servicio } = montar();
    await expect(
      servicio.create("u1", { ...DIRECCION_BASE, ciudad: "Barcelona" } as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      servicio.create("u1", { ...DIRECCION_BASE, ciudad: "Barcelona" } as never),
    ).rejects.toThrow(/no es un municipio de Madrid/);
  });

  it("rechaza un código postal inexistente", async () => {
    const { servicio } = montar();
    await expect(
      servicio.create("u1", { ...DIRECCION_BASE, codigo_postal: "99999" } as never),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("DireccionesService.update", () => {
  it("valida la ciudad nueva contra el CP YA GUARDADO", async () => {
    // El decorador del DTO no puede ver la fila, así que este es el único sitio
    // donde se caza: sin esto, cambiar solo la ciudad se colaba sin validar.
    const { servicio } = montar({ ciudad: "Mejorada del Campo", codigo_postal: "28840" });
    await expect(servicio.update("u1", "dir-1", { ciudad: "Barcelona" })).rejects.toThrow(
      /no es un municipio de Madrid/,
    );
  });

  it("acepta la ciudad nueva si pertenece a la provincia guardada", async () => {
    const { servicio, registro } = montar({ ciudad: "Mejorada del Campo", codigo_postal: "28840" });
    await servicio.update("u1", "dir-1", { ciudad: "Alcalá de Henares" });
    expect(registro.actualizado?.ciudad).toBe("Alcalá de Henares");
    expect(registro.actualizado?.provincia).toBe("Madrid");
  });

  it("valida el CP nuevo contra la ciudad YA GUARDADA", async () => {
    const { servicio } = montar({ ciudad: "Mejorada del Campo", codigo_postal: "28840" });
    // Mudarse a un CP de Valencia dejando la localidad de Madrid es incoherente.
    await expect(servicio.update("u1", "dir-1", { codigo_postal: "46001" })).rejects.toThrow(
      /no es un municipio de Valencia/,
    );
  });

  it("acepta cambiar CP y ciudad juntos a otra provincia", async () => {
    const { servicio, registro } = montar({ ciudad: "Mejorada del Campo", codigo_postal: "28840" });
    await servicio.update("u1", "dir-1", { codigo_postal: "46001", ciudad: "València" });
    expect(registro.actualizado?.provincia).toBe("Valencia/València");
  });

  it("no toca la ubicación si el PATCH no la menciona", async () => {
    const { servicio, registro } = montar({ ciudad: "Mejorada del Campo", codigo_postal: "28840" });
    await servicio.update("u1", "dir-1", { telefono: "600112233" });
    expect(registro.actualizado).not.toHaveProperty("ciudad");
    expect(registro.actualizado).not.toHaveProperty("provincia");
    expect(registro.actualizado?.telefono).toBe("600112233");
  });

  it("404 si la dirección no es de ese usuario", async () => {
    const { servicio } = montar(null);
    await expect(servicio.update("u1", "dir-1", { ciudad: "Madrid" })).rejects.toThrow(
      NotFoundException,
    );
  });
});
