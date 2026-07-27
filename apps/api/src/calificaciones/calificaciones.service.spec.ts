import { ForbiddenException } from "@nestjs/common";
import { CalificacionesService } from "./calificaciones.service";
import { tasaRespuesta, type ResumenCalificaciones } from "@valatino/types";

const TOKEN = "efe548aa-dcc2-40ff-bd9b-856c65f79662";
const PEDIDO = "4f845bb4-3387-4104-8be3-3f94432b8cce";

/**
 * Doble de Supabase con lo justo: la búsqueda del pedido por token, la lectura
 * de la calificación existente y el upsert.
 */
function montar(opciones: { token?: string | null; creadaEn?: string | null } = {}) {
  const { token = TOKEN, creadaEn = null } = opciones;

  const registro = { upserts: [] as Record<string, unknown>[] };

  const supabase = {
    from: (tabla: string) => ({
      select: () => ({
        eq: (_col: string, valor: string) => ({
          maybeSingle: async () => {
            if (tabla === "pedidos") {
              return {
                data: token && valor === token ? { id: PEDIDO, estado: "PROCESANDO" } : null,
                error: null,
              };
            }
            // pedido_calificaciones
            return {
              data: creadaEn
                ? { pedido_id: PEDIDO, esfuerzo: 1, satisfaccion: 5, created_at: creadaEn }
                : null,
              error: null,
            };
          },
        }),
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
      upsert: (valores: Record<string, unknown>) => {
        registro.upserts.push(valores);
        return {
          select: () => ({ single: async () => ({ data: valores, error: null }) }),
        };
      },
    }),
    rpc: async () => ({ data: [], error: null }),
  };

  return { servicio: new CalificacionesService(supabase as never), registro };
}

describe("CalificacionesService.calificar", () => {
  it("guarda la opinión del pedido que corresponde al token", async () => {
    const { servicio, registro } = montar();
    const r = await servicio.calificar(TOKEN, { esfuerzo: 1, satisfaccion: 5 });

    expect(r).not.toBeNull();
    expect(registro.upserts[0]).toMatchObject({
      pedido_id: PEDIDO,
      esfuerzo: 1,
      satisfaccion: 5,
      comentario: null,
    });
  });

  it("devuelve null con un token que no existe, sin explicar por qué", async () => {
    // El controlador lo traduce a 404 con el mismo mensaje que un pedido
    // inexistente: enumerar tokens no debe dar información.
    const { servicio } = montar({ token: null });
    expect(await servicio.calificar(TOKEN, { esfuerzo: 1, satisfaccion: 5 })).toBeNull();
  });

  it("recorta el comentario y guarda NULL si queda vacío", async () => {
    const { servicio, registro } = montar();
    await servicio.calificar(TOKEN, {
      esfuerzo: 2,
      satisfaccion: 3,
      comentario: "   Todo bien   ",
    });
    expect(registro.upserts[0].comentario).toBe("Todo bien");

    const otro = montar();
    await otro.servicio.calificar(TOKEN, { esfuerzo: 2, satisfaccion: 3, comentario: "    " });
    expect(otro.registro.upserts[0].comentario).toBeNull();
  });

  it("permite corregir dentro de la ventana", async () => {
    const ayer = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { servicio, registro } = montar({ creadaEn: ayer });
    await servicio.calificar(TOKEN, { esfuerzo: 3, satisfaccion: 1 });
    expect(registro.upserts[0]).toMatchObject({ esfuerzo: 3, satisfaccion: 1 });
  });

  it("rechaza corregir pasada la ventana: una opinión reescrita meses después ya no es la de aquel día", async () => {
    const hace30dias = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { servicio } = montar({ creadaEn: hace30dias });
    await expect(servicio.calificar(TOKEN, { esfuerzo: 1, satisfaccion: 5 })).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe("CalificacionesService.porToken", () => {
  it("devuelve lo ya opinado para rellenar el formulario", async () => {
    const { servicio } = montar({ creadaEn: new Date().toISOString() });
    const r = await servicio.porToken(TOKEN);
    expect(r).toMatchObject({ pedido_id: PEDIDO, esfuerzo: 1, satisfaccion: 5 });
  });

  it("devuelve null tanto si el token no existe como si aún no se ha calificado", async () => {
    expect(await montar({ token: null }).servicio.porToken(TOKEN)).toBeNull();
    expect(await montar().servicio.porToken(TOKEN)).toBeNull();
  });
});

describe("CalificacionesService.panel", () => {
  it("pinta ceros cuando la RPC no devuelve fila, en vez de romperse el primer día", async () => {
    const { servicio } = montar();
    const { resumen, opiniones } = await servicio.panel();
    expect(resumen).toMatchObject({ respuestas: 0, pedidos_calificables: 0 });
    expect(resumen.satisfaccion_medio).toBeNull();
    expect(opiniones).toEqual([]);
  });
});

describe("tasaRespuesta", () => {
  const base: ResumenCalificaciones = {
    respuestas: 0,
    pedidos_calificables: 0,
    esfuerzo_medio: null,
    satisfaccion_medio: null,
    faciles: 0,
    regulares: 0,
    dificiles: 0,
    detractores: 0,
  };

  it("es el porcentaje sobre los pedidos que pudieron calificarse", () => {
    expect(tasaRespuesta({ ...base, respuestas: 7, pedidos_calificables: 28 })).toBe(25);
  });

  it("devuelve null sin pedidos que calificar, no 0", () => {
    // 0 % sugiere «nadie quiso responder»; null dice «no había nada que
    // responder». La pantalla tiene que poder distinguirlo.
    expect(tasaRespuesta(base)).toBeNull();
  });
});
