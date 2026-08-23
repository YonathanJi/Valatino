import { SupabaseClient } from "@supabase/supabase-js";
import { CodigosService } from "./codigos.service";

/**
 * Los códigos de descuento en el panel de TI (083).
 *
 * ⚠️⚠️ LO QUE SE FIJA AQUÍ, por orden de lo que cuesta si se rompe:
 *
 *   1. Que un código YA USADO no se pueda borrar. Su fila es la prueba de qué
 *      descuento llevaron esas ventas (art. 78.Tres.2 LIVA), y
 *      `pedidos.descuento_codigo` es TEXT a propósito, así que NINGUNA FK lo impide.
 *      Si esta regla desaparece, nadie se entera hasta que haga falta demostrar un
 *      descuento de hace un año.
 *   2. Que el porcentaje llegue como NÚMERO. `numeric` viaja como string por
 *      PostgREST, y «20.00» en la pantalla es un porcentaje entre comillas.
 *   3. Que un código repetido dé un mensaje que se entienda y no un 400 pelado.
 *   4. Que editar NO borre lo que no se ha tocado.
 */

const ID = "cccccccc-0000-4000-8000-000000000001";
const ACTOR = "aaaaaaaa-0000-4000-8000-000000000001";

interface Opciones {
  /** La fila que devuelve la base. */
  fila?: Record<string, unknown>;
  /** Filas para el listado. */
  filas?: Array<Record<string, unknown>>;
  /** Error que devuelve el insert (por ejemplo `{ code: "23505" }`). */
  errorInsert?: { code?: string; message: string };
  /** `maybeSingle` no encuentra nada. */
  noExiste?: boolean;
}

const FILA = {
  id: ID,
  codigo: "VERANO20",
  tipo: "porcentaje",
  // ⚠️ Como los entrega PostgREST: `numeric` es STRING.
  porcentaje: "20.00",
  descripcion: "Del 1 al 31 de agosto",
  minimo_articulos: "10.00",
  usos_maximos: 100,
  usos: 0,
  valido_desde: null,
  valido_hasta: null,
  activo: true,
  created_at: "2026-08-23T10:00:00Z",
};

function montar(o: Opciones = {}) {
  const registro = {
    insertado: null as Record<string, unknown> | null,
    actualizado: null as Record<string, unknown> | null,
    borrados: [] as string[],
  };

  const fila = o.noExiste ? null : (o.fila ?? FILA);

  const supabase = {
    from: () => ({
      select: () => ({
        order: async () => ({ data: o.filas ?? [FILA], error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: fila, error: null }) }),
      }),
      insert: (valores: Record<string, unknown>) => {
        registro.insertado = valores;
        return {
          select: () => ({
            single: async () =>
              o.errorInsert
                ? { data: null, error: o.errorInsert }
                : { data: { ...FILA, ...valores }, error: null },
          }),
        };
      },
      update: (valores: Record<string, unknown>) => {
        registro.actualizado = valores;
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: fila ? { ...fila, ...valores } : null,
                error: null,
              }),
            }),
          }),
        };
      },
      delete: () => ({
        eq: async (_col: string, id: string) => {
          registro.borrados.push(id);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { servicio: new CodigosService(supabase), registro };
}

describe("CodigosService", () => {
  describe("no se borra un código que ya se usó", () => {
    /**
     * ⚠️⚠️ ES LA REGLA QUE MÁS IMPORTA DE ESTE FICHERO, y no la protege el esquema:
     * `pedidos.descuento_codigo` es TEXT para que borrar un código no pueda
     * reescribir la historia de un pedido, así que no hay FK que diga nada. La
     * protección vive en el servicio y por eso tiene que vivir también aquí.
     */
    it("con usos > 0 se niega, y dice cuántas veces y qué hacer", async () => {
      const { servicio, registro } = montar({ fila: { ...FILA, usos: 3 } });

      await expect(servicio.borrar(ID)).rejects.toThrow(/ya se ha usado 3 veces/i);
      await expect(servicio.borrar(ID)).rejects.toThrow(/desact[íi]valo/i);
      // Y no llega a borrar nada.
      expect(registro.borrados).toHaveLength(0);
    });

    it("con UN uso lo dice en singular, que es lo que se lee", async () => {
      const { servicio } = montar({ fila: { ...FILA, usos: 1 } });
      await expect(servicio.borrar(ID)).rejects.toThrow(/ya se ha usado 1 vez:/i);
    });

    it("sin usos sí se borra", async () => {
      const { servicio, registro } = montar({ fila: { ...FILA, usos: 0 } });

      await expect(servicio.borrar(ID)).resolves.toEqual({ borrado: true });
      expect(registro.borrados).toEqual([ID]);
    });

    it("el que no existe da 404 y no borra", async () => {
      const { servicio, registro } = montar({ noExiste: true });

      await expect(servicio.borrar(ID)).rejects.toThrow(/no existe/i);
      expect(registro.borrados).toHaveLength(0);
    });
  });

  describe("los importes llegan como números", () => {
    it("el porcentaje y el mínimo no viajan como string", async () => {
      // `numeric` de Postgres llega como «20.00» por PostgREST. Sin convertirlo, la
      // pantalla pintaría un porcentaje entre comillas y `toFixed` reventaría.
      const [c] = await montar().servicio.listar();

      expect(c!.porcentaje).toBe(20);
      expect(c!.minimoArticulos).toBe(10);
      expect(typeof c!.porcentaje).toBe("number");
    });

    it("los que no tienen valor salen null, no 0", async () => {
      // ⚠️ 0 y null NO son lo mismo aquí: un mínimo de 0 es «sin mínimo» y un
      // `usos_maximos` de 0 sería un código apagado. Confundirlos cambia la regla.
      const { servicio } = montar({
        filas: [{ ...FILA, porcentaje: null, minimo_articulos: null, usos_maximos: null }],
      });
      const [c] = await servicio.listar();

      expect(c!.porcentaje).toBeNull();
      expect(c!.minimoArticulos).toBeNull();
      expect(c!.usosMaximos).toBeNull();
    });
  });

  describe("crear", () => {
    it("un código de porcentaje SIN porcentaje se rechaza con su motivo", async () => {
      const { servicio } = montar();

      await expect(
        servicio.crear({ codigo: "VERANO20", tipo: "porcentaje" }, ACTOR),
      ).rejects.toThrow(/necesita su porcentaje/i);
    });

    it("un código de envío gratis CON porcentaje se rechaza: no descuenta de la mercancía", async () => {
      const { servicio } = montar();

      await expect(
        servicio.crear({ codigo: "PORTEGRATIS", tipo: "envio_gratis", porcentaje: 20 }, ACTOR),
      ).rejects.toThrow(/no lleva porcentaje/i);
    });

    it("«válido hasta» anterior a «válido desde» se rechaza", async () => {
      const { servicio } = montar();

      await expect(
        servicio.crear(
          {
            codigo: "VERANO20",
            tipo: "porcentaje",
            porcentaje: 20,
            valido_desde: "2026-09-01T00:00:00Z",
            valido_hasta: "2026-08-01T00:00:00Z",
          },
          ACTOR,
        ),
      ).rejects.toThrow(/posterior/i);
    });

    it("un código repetido dice QUE está repetido, no «no se pudo crear»", async () => {
      // 23505 es el índice único sobre `upper(btrim(codigo))`. Es el caso normal —
      // alguien reutiliza un nombre— y un 400 genérico haría pensar en un fallo.
      const { servicio } = montar({ errorInsert: { code: "23505", message: "duplicate key" } });

      await expect(
        servicio.crear({ codigo: "VERANO20", tipo: "porcentaje", porcentaje: 20 }, ACTOR),
      ).rejects.toThrow(/ya existe un código «VERANO20»/i);
    });

    it("guarda el código tal como se escribió, solo sin espacios de sobra", async () => {
      // La unicidad la lleva el índice sobre `upper(btrim(...))`, así que no hay que
      // normalizar aquí — y no hacerlo conserva la forma en que se va a difundir.
      const { servicio, registro } = montar();

      await servicio.crear({ codigo: "  Verano20  ", tipo: "porcentaje", porcentaje: 20 }, ACTOR);

      expect(registro.insertado).toMatchObject({ codigo: "Verano20", creado_por: ACTOR });
    });
  });

  describe("editar", () => {
    it("apagar un código NO borra sus fechas ni su tope", async () => {
      // ⚠️ Un PATCH manda solo lo que cambia. Si el servicio armara el update con
      // todos los campos, apagar un código le borraría la vigencia — y al volver a
      // encenderlo valdría para siempre.
      const { servicio, registro } = montar();

      await servicio.editar(ID, { activo: false }, ACTOR);

      expect(registro.actualizado).toMatchObject({ activo: false });
      expect(registro.actualizado).not.toHaveProperty("valido_hasta");
      expect(registro.actualizado).not.toHaveProperty("usos_maximos");
      expect(registro.actualizado).not.toHaveProperty("descripcion");
    });

    it("un PATCH vacío se rechaza en vez de tocar updated_at por nada", async () => {
      const { servicio } = montar();
      await expect(servicio.editar(ID, {}, ACTOR)).rejects.toThrow(/no has cambiado nada/i);
    });

    it("el que no existe da 404", async () => {
      const { servicio } = montar({ noExiste: true });
      await expect(servicio.editar(ID, { activo: false }, ACTOR)).rejects.toThrow(/no existe/i);
    });
  });
});
