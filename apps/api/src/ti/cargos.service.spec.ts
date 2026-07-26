import { BadRequestException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { CargosService } from "./cargos.service";
import type { PermisoModulo } from "@valatino/types";

const CARGO_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const EDITOR = "eeeeeeee-0000-4000-8000-000000000001";

interface Empleado {
  id: string;
  user_id: string | null;
  nombre_completo: string;
  activo: boolean;
  esAdmin?: boolean;
}

/**
 * Doble de Supabase con lo justo que toca el servicio. La RPC se simula con la
 * misma semántica que la de verdad (verificada contra el remoto): omite a los
 * admin, a quien no tiene cuenta y a quien está de baja, y reemplaza —no suma—
 * los permisos del resto.
 */
function montar(opciones: {
  plantilla?: PermisoModulo[];
  empleados?: Empleado[];
  permisosActuales?: Record<string, PermisoModulo[]>;
}) {
  const plantilla = opciones.plantilla ?? [];
  const empleados = opciones.empleados ?? [];
  const estado: Record<string, PermisoModulo[]> = { ...(opciones.permisosActuales ?? {}) };
  const registro = { rpc: [] as Record<string, unknown>[] };

  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      registro.rpc.push({ fn, ...args });
      const filtro = args.p_user_ids as string[] | null;

      const filas = empleados
        .filter((e) => !filtro || (e.user_id != null && filtro.includes(e.user_id)))
        .map((e) => {
          const motivo = !e.user_id
            ? "sin_cuenta"
            : e.esAdmin
              ? "es_admin"
              : !e.activo
                ? "inactivo"
                : null;
          if (motivo === null) estado[e.user_id!] = [...plantilla];
          return {
            empleado_id: e.id,
            user_id: e.user_id,
            nombre: e.nombre_completo,
            aplicado: motivo === null,
            motivo,
          };
        });

      return { data: filas, error: null };
    },

    from: (tabla: string) => {
      const respuesta = (data: unknown) => ({ data, error: null });

      if (tabla === "cargos") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                respuesta({ id: CARGO_ID, codigo: "ASECOM", nombre: "Asesor Comercial" }),
            }),
            order: async () => respuesta([{ id: CARGO_ID, codigo: "ASECOM" }]),
          }),
        };
      }

      if (tabla === "cargo_modulos") {
        return {
          select: () => ({
            eq: async () => respuesta(plantilla),
            then: undefined,
          }),
        };
      }

      if (tabla === "empleados") {
        return {
          select: () => ({
            eq: () => ({ order: async () => respuesta(empleados) }),
          }),
        };
      }

      if (tabla === "staff_modulos") {
        return {
          select: () => ({
            in: async () =>
              respuesta(
                Object.entries(estado).flatMap(([user_id, permisos]) =>
                  permisos.map((p) => ({ user_id, ...p })),
                ),
              ),
          }),
        };
      }

      if (tabla === "user_roles") {
        return {
          select: () => ({
            in: () => ({
              eq: async () =>
                respuesta(
                  empleados.filter((e) => e.esAdmin && e.user_id).map((e) => ({ user_id: e.user_id })),
                ),
            }),
          }),
        };
      }

      throw new Error(`tabla inesperada: ${tabla}`);
    },
  } as unknown as SupabaseClient;

  return { servicio: new CargosService(supabase), estado, registro };
}

const PLANTILLA_ASECOM: PermisoModulo[] = [
  { modulo: "pedidos", nivel: "edicion" },
  { modulo: "clientes", nivel: "lectura" },
];

describe("CargosService.reaplicar", () => {
  it("aplica la plantilla al personal con cuenta y omite al resto por su motivo", async () => {
    const { servicio, estado } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [
        { id: "e1", user_id: "u-normal", nombre_completo: "A Normal", activo: true },
        { id: "e2", user_id: "u-admin", nombre_completo: "B Admin", activo: true, esAdmin: true },
        { id: "e3", user_id: null, nombre_completo: "C Sin Cuenta", activo: true },
        { id: "e4", user_id: "u-baja", nombre_completo: "D De Baja", activo: false },
      ],
      permisosActuales: { "u-admin": [{ modulo: "compras", nivel: "total" }] },
    });

    const resultado = await servicio.reaplicar(CARGO_ID, EDITOR, true);

    expect(resultado.aplicados).toBe(1);
    expect(resultado.omitidos).toEqual([
      { user_id: "u-admin", nombre: "B Admin", motivo: "es_admin" },
      { user_id: null, nombre: "C Sin Cuenta", motivo: "sin_cuenta" },
      { user_id: "u-baja", nombre: "D De Baja", motivo: "inactivo" },
    ]);
    expect(estado["u-normal"]).toEqual(PLANTILLA_ASECOM);
    // El súper admin no se toca: su acceso no sale de staff_modulos.
    expect(estado["u-admin"]).toEqual([{ modulo: "compras", nivel: "total" }]);
  });

  it("pisa los permisos puestos a mano: es un reemplazo, no una suma", async () => {
    const { servicio, estado } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [{ id: "e1", user_id: "u-1", nombre_completo: "A", activo: true }],
      permisosActuales: { "u-1": [{ modulo: "ti", nivel: "total" }] },
    });

    await servicio.reaplicar(CARGO_ID, EDITOR, true);

    expect(estado["u-1"]).toEqual(PLANTILLA_ASECOM);
    expect(estado["u-1"].some((p) => p.modulo === "ti")).toBe(false);
  });

  it("es idempotente: dos pasadas dejan el mismo estado", async () => {
    const { servicio, estado } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [{ id: "e1", user_id: "u-1", nombre_completo: "A", activo: true }],
    });

    const primera = await servicio.reaplicar(CARGO_ID, EDITOR, true);
    const tras1 = [...estado["u-1"]];
    const segunda = await servicio.reaplicar(CARGO_ID, EDITOR, true);

    expect(segunda).toEqual(primera);
    expect(estado["u-1"]).toEqual(tras1);
  });

  it("acota a las personas indicadas cuando se pasa user_ids", async () => {
    const { servicio, estado } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [
        { id: "e1", user_id: "u-1", nombre_completo: "A", activo: true },
        { id: "e2", user_id: "u-2", nombre_completo: "B", activo: true },
      ],
    });

    const resultado = await servicio.reaplicar(CARGO_ID, EDITOR, true, { userIds: ["u-1"] });

    expect(resultado.aplicados).toBe(1);
    expect(estado["u-1"]).toEqual(PLANTILLA_ASECOM);
    expect(estado["u-2"]).toBeUndefined();
  });

  describe("cuando el editor ocupa el propio cargo", () => {
    const conEditorDentro = () =>
      montar({
        plantilla: PLANTILLA_ASECOM,
        empleados: [{ id: "e1", user_id: EDITOR, nombre_completo: "El editor", activo: true }],
      });

    it("un TI no admin tiene que confirmar antes de cambiarse sus propios permisos", async () => {
      const { servicio, registro } = conEditorDentro();

      await expect(servicio.reaplicar(CARGO_ID, EDITOR, false)).rejects.toThrow(
        BadRequestException,
      );
      expect(registro.rpc).toHaveLength(0);
    });

    it("con incluirme sí se aplica", async () => {
      const { servicio, estado } = conEditorDentro();

      await servicio.reaplicar(CARGO_ID, EDITOR, false, { incluirme: true });

      expect(estado[EDITOR]).toEqual(PLANTILLA_ASECOM);
    });

    it("el súper admin no necesita confirmar: la RPC nunca le toca", async () => {
      const { servicio } = conEditorDentro();
      await expect(servicio.reaplicar(CARGO_ID, EDITOR, true)).resolves.toBeDefined();
    });
  });
});

describe("CargosService.afectados", () => {
  it("marca como divergente a quien tiene hoy algo distinto de la plantilla", async () => {
    const { servicio } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [
        { id: "e1", user_id: "u-igual", nombre_completo: "Igual", activo: true },
        { id: "e2", user_id: "u-distinto", nombre_completo: "Distinto", activo: true },
      ],
      permisosActuales: {
        "u-igual": PLANTILLA_ASECOM,
        "u-distinto": [
          { modulo: "pedidos", nivel: "total" },
          { modulo: "ti", nivel: "lectura" },
        ],
      },
    });

    const { total, empleados } = await servicio.afectados(CARGO_ID);

    expect(total).toBe(2);
    expect(empleados.find((e) => e.user_id === "u-igual")!.divergente).toBe(false);

    const distinto = empleados.find((e) => e.user_id === "u-distinto")!;
    expect(distinto.divergente).toBe(true);
    expect(distinto.cambios).toEqual(
      expect.arrayContaining([
        { modulo: "pedidos", de: "total", a: "edicion" },
        { modulo: "ti", de: "lectura", a: null },
        { modulo: "clientes", de: null, a: "lectura" },
      ]),
    );
  });

  it("quien va a omitirse no cuenta en el total ni sale como divergente", async () => {
    const { servicio } = montar({
      plantilla: PLANTILLA_ASECOM,
      empleados: [
        { id: "e1", user_id: null, nombre_completo: "Sin cuenta", activo: true },
        { id: "e2", user_id: "u-baja", nombre_completo: "De baja", activo: false },
      ],
    });

    const { total, empleados } = await servicio.afectados(CARGO_ID);

    expect(total).toBe(0);
    expect(empleados.map((e) => e.omitido_por)).toEqual(["sin_cuenta", "inactivo"]);
    expect(empleados.every((e) => !e.divergente)).toBe(true);
  });
});
