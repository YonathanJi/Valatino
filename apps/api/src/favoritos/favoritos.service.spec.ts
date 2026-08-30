import { FavoritosService } from "./favoritos.service";
import { TOPE_FAVORITOS } from "@valatino/types";

const YO = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const P3 = "cccccccc-3333-4333-8333-cccccccccccc";
/** Uno que ya no existe en el catálogo: viene del localStorage de hace meses. */
const MUERTO = "dddddddd-4444-4444-8444-dddddddddddd";

/**
 * Doble de Supabase con lo justo: los favoritos que ya hay, qué productos existen,
 * y un registro de lo que se escribe.
 */
function montar(opciones: { yaGuardados?: string[]; catalogo?: string[] } = {}) {
  const { yaGuardados = [], catalogo = [P1, P2, P3] } = opciones;

  const registro = {
    upserts: [] as Array<{ filas: Record<string, unknown>[]; opciones: unknown }>,
    borrados: [] as Array<Record<string, string>>,
    /** Los ids por los que se preguntó al catálogo, si es que se preguntó. */
    consultadosEnCatalogo: null as string[] | null,
  };

  const guardados = [...yaGuardados];

  const supabase = {
    from: (tabla: string) => {
      if (tabla === "productos") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => {
              registro.consultadosEnCatalogo = ids;
              return { data: ids.filter((i) => catalogo.includes(i)).map((id) => ({ id })), error: null };
            },
          }),
        };
      }

      // favoritos
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: guardados.map((producto_id) => ({ producto_id })),
                error: null,
              }),
            }),
          }),
        }),
        upsert: async (filas: Record<string, unknown> | Record<string, unknown>[], ops: unknown) => {
          const lista = Array.isArray(filas) ? filas : [filas];
          registro.upserts.push({ filas: lista, opciones: ops });
          for (const f of lista) {
            const id = f.producto_id as string;
            if (!guardados.includes(id)) guardados.push(id);
          }
          return { error: null };
        },
        delete: () => {
          const filtros: Record<string, string> = {};
          const cadena = {
            eq: (col: string, valor: string) => {
              filtros[col] = valor;
              return cadena;
            },
            then: (resolver: (r: { error: null }) => void) => {
              registro.borrados.push({ ...filtros });
              const i = guardados.indexOf(filtros.producto_id);
              if (i >= 0) guardados.splice(i, 1);
              return Promise.resolve({ error: null }).then(resolver);
            },
          };
          return cadena;
        },
      };
    },
  };

  return { servicio: new FavoritosService(supabase as never), registro, guardados };
}

describe("listar", () => {
  it("devuelve los ids que tiene guardados", async () => {
    const { servicio } = montar({ yaGuardados: [P1, P2] });
    await expect(servicio.listar(YO)).resolves.toEqual([P1, P2]);
  });

  it("sin nada guardado, una lista vacía", async () => {
    const { servicio } = montar();
    await expect(servicio.listar(YO)).resolves.toEqual([]);
  });
});

describe("guardar", () => {
  /**
   * ⭐ Lo que hace que guardar sea idempotente es el UNIQUE de la 085 y este
   * `ignoreDuplicates`, **no una lectura previa**. Leer-y-luego-escribir es la
   * carrera que costó el correo duplicado de los reembolsos el 26/08.
   */
  it("escribe con ignoreDuplicates, sin leer antes", async () => {
    const { servicio, registro } = montar();
    await servicio.guardar(YO, P1);

    expect(registro.upserts).toHaveLength(1);
    expect(registro.upserts[0].filas[0]).toMatchObject({ user_id: YO, producto_id: P1 });
    expect(registro.upserts[0].opciones).toMatchObject({ ignoreDuplicates: true });
  });

  it("guardar dos veces lo mismo no duplica", async () => {
    const { servicio, guardados } = montar();
    await servicio.guardar(YO, P1);
    await servicio.guardar(YO, P1);

    expect(guardados).toEqual([P1]);
  });
});

describe("quitar", () => {
  /**
   * ⚠️⚠️ Los DOS filtros. Con solo `producto_id` se borraría el favorito de todo el
   * mundo que tuviera ese producto. La RLS lo pararía —`user_id = auth.uid()`— pero
   * la API entra con `service_role`, que se la salta: aquí no hay red debajo.
   */
  it("filtra por usuario Y por producto, no solo por producto", async () => {
    const { servicio, registro } = montar({ yaGuardados: [P1] });
    await servicio.quitar(YO, P1);

    expect(registro.borrados[0]).toEqual({ user_id: YO, producto_id: P1 });
  });
});

describe("fusionar al iniciar sesión", () => {
  /**
   * ⭐⭐ LO QUE PIDIÓ JONATHAN: guardar sin cuenta y que al entrar se conserve.
   */
  it("SUMA los del invitado a los que ya había en la cuenta", async () => {
    const { servicio } = montar({ yaGuardados: [P1] });

    await expect(servicio.fusionar(YO, [P2])).resolves.toEqual(expect.arrayContaining([P1, P2]));
  });

  it("no reemplaza: lo de la cuenta sobrevive aunque el invitado no traiga nada", async () => {
    const { servicio, registro } = montar({ yaGuardados: [P1, P2] });

    await expect(servicio.fusionar(YO, [])).resolves.toEqual([P1, P2]);
    expect(registro.upserts).toHaveLength(0);
  });

  it("lo que ya estaba en las dos partes no se duplica", async () => {
    const { servicio, guardados } = montar({ yaGuardados: [P1] });
    await servicio.fusionar(YO, [P1, P2]);

    expect(guardados).toEqual([P1, P2]);
  });

  it("una lista con repetidos dentro no rompe el lote", async () => {
    const { servicio, registro } = montar();
    await servicio.fusionar(YO, [P1, P1, P2]);

    const ids = registro.upserts[0].filas.map((f) => f.producto_id);
    expect(ids).toEqual([P1, P2]);
  });

  /**
   * ⚠️⚠️ EL TEST QUE DE VERDAD GUARDA ALGO. Un `upsert` por lotes es **una sola
   * sentencia**: si un id apunta a un producto borrado, la clave foránea tumba el
   * lote ENTERO y el cliente pierde TODOS sus favoritos al iniciar sesión, sin ver
   * ningún error — justo en el momento en que confía en que se están guardando.
   *
   * Por eso se pregunta antes qué existe. Un id muerto ahí no es raro: sale de un
   * `localStorage` que puede llevar meses.
   */
  it("un producto que ya no existe NO se lleva por delante a los demás", async () => {
    const { servicio, registro } = montar({ catalogo: [P1, P2] });

    const resultado = await servicio.fusionar(YO, [P1, MUERTO, P2]);

    expect(registro.consultadosEnCatalogo).toEqual([P1, MUERTO, P2]);
    const escritos = registro.upserts[0].filas.map((f) => f.producto_id);
    expect(escritos).toEqual([P1, P2]);
    expect(escritos).not.toContain(MUERTO);
    expect(resultado).toEqual(expect.arrayContaining([P1, P2]));
  });

  it("si NINGUNO existe ya, no escribe nada y no revienta", async () => {
    const { servicio, registro } = montar({ catalogo: [] });

    await expect(servicio.fusionar(YO, [MUERTO])).resolves.toEqual([]);
    expect(registro.upserts).toHaveLength(0);
  });

  /** El tope es el mismo número que aplica el navegador. Ver `TOPE_FAVORITOS`. */
  it("recorta al tope en vez de aceptar una lista sin fin", async () => {
    const demasiados = Array.from(
      { length: TOPE_FAVORITOS + 25 },
      (_, i) => `aaaaaaaa-1111-4111-8111-${String(i).padStart(12, "0")}`,
    );
    const { servicio, registro } = montar({ catalogo: demasiados });

    await servicio.fusionar(YO, demasiados);

    expect(registro.consultadosEnCatalogo).toHaveLength(TOPE_FAVORITOS);
  });
});
