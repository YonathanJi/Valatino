import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
import { ContabilidadService } from "./contabilidad.service";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RespuestaRpc {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

/**
 * Supabase de mentira: solo `rpc`, que es todo lo que usa este servicio. Guarda
 * las llamadas para poder comprobar que el periodo llega tal cual —sin que nadie
 * lo convierta a Date por el camino, que es el fallo que se quiere impedir.
 */
function crearSupabase(respuesta: RespuestaRpc = { data: {}, error: null }) {
  const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null });
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, llamadas };
}

function crearServicio(respuesta?: RespuestaRpc) {
  const { supabase, llamadas } = crearSupabase(respuesta);
  return { servicio: new ContabilidadService(supabase), llamadas };
}

describe("ContabilidadService — liquidación de IVA", () => {
  it("pasa el periodo a la RPC tal cual, sin tocarlo", async () => {
    const { servicio, llamadas } = crearServicio({ data: { desde: "2026-07-01" } });

    await servicio.liquidacionIva("2026-07-01", "2026-09-30");

    expect(llamadas).toEqual([
      {
        fn: "liquidacion_iva",
        args: { p_desde: "2026-07-01", p_hasta: "2026-09-30" },
      },
    ]);
  });

  it("devuelve lo que contesta la RPC sin reinterpretarlo", async () => {
    // El cálculo vive en la base a propósito: si el servicio recompusiera
    // totales aquí habría dos reglas de redondeo, y la segunda acabaría
    // discrepando de la primera en algún céntimo.
    const liquidacion = {
      desde: "2026-07-01",
      hasta: "2026-09-30",
      totales: { resultado: -25.1 },
      avisos: [{ clase: "sin_arranque_fiscal" }],
    };
    const { servicio } = crearServicio({ data: liquidacion });

    await expect(servicio.liquidacionIva("2026-07-01", "2026-09-30")).resolves.toBe(liquidacion);
  });

  it("rechaza un periodo al revés antes de gastar el viaje a la base", async () => {
    const { servicio, llamadas } = crearServicio();

    await expect(servicio.liquidacionIva("2026-09-30", "2026-07-01")).rejects.toThrow(
      BadRequestException,
    );
    expect(llamadas).toHaveLength(0);
  });

  it("acepta un periodo de un solo día", async () => {
    const { servicio, llamadas } = crearServicio();

    await servicio.liquidacionIva("2026-08-13", "2026-08-13");

    expect(llamadas).toHaveLength(1);
  });

  /**
   * ⚠️ EL FALLO QUE ESTE TEST DESTAPÓ, y merece quedar escrito: la primera
   * versión comprobaba la fecha con `Date.parse("2026-02-31T00:00:00Z")` dando
   * por hecho que devolvería NaN. **No lo devuelve**: V8 rueda el día al 3 de
   * marzo y contesta un número válido. Así que un periodo mal teclado se
   * aceptaba en silencio y el informe salía de otras fechas — un 303 de un
   * trimestre que nadie pidió, sin ningún aviso.
   *
   * Por eso la comprobación es un viaje de ida y vuelta por componentes.
   */
  it.each([
    ["2026-02-31", "el 31 de febrero, que V8 rueda al 3 de marzo"],
    ["2026-04-31", "un abril de 31 días"],
    ["2026-13-01", "un mes 13"],
    ["2026-00-10", "un mes 0"],
    ["2026-05-00", "un día 0"],
  ])("rechaza %s (%s)", async (fecha) => {
    const { servicio, llamadas } = crearServicio();

    await expect(servicio.liquidacionIva(fecha, "2026-12-31")).rejects.toThrow(/no existe/i);
    expect(llamadas).toHaveLength(0);
  });

  it("acepta el 29 de febrero de un año bisiesto", async () => {
    const { servicio, llamadas } = crearServicio();

    await servicio.liquidacionIva("2028-02-29", "2028-03-31");

    expect(llamadas).toHaveLength(1);
  });

  it("rechaza el 29 de febrero de un año que no lo es", async () => {
    const { servicio } = crearServicio();

    await expect(servicio.liquidacionIva("2026-02-29", "2026-03-31")).rejects.toThrow(
      /no existe/i,
    );
  });

  it("rechaza un periodo absurdamente largo diciendo cuántos días son", async () => {
    const { servicio, llamadas } = crearServicio();

    await expect(servicio.liquidacionIva("2000-01-01", "2026-12-31")).rejects.toThrow(
      /se han pedido \d+/,
    );
    expect(llamadas).toHaveLength(0);
  });

  /**
   * ⚠️ Cuenta los días EXACTOS, y el rango elegido lo comprueba de verdad:
   * 2026→2032 lleva dentro un año bisiesto (2028) y doce cambios de hora. Si la
   * resta se hiciera en hora local o se olvidara el 29 de febrero, la cifra del
   * mensaje no daría 2192.
   */
  it("cuenta los días exactos, con año bisiesto y cambios de hora dentro", async () => {
    const { servicio } = crearServicio();

    await expect(servicio.liquidacionIva("2026-01-01", "2032-01-01")).rejects.toThrow(
      "se han pedido 2192",
    );
  });

  it("un ejercicio completo entra de sobra en el tope", async () => {
    const { servicio, llamadas } = crearServicio();

    await servicio.liquidacionIva("2026-01-01", "2026-12-31");

    expect(llamadas).toHaveLength(1);
  });

  describe("errores de la RPC", () => {
    it("publica el mensaje escrito a mano en la migración (P0001) como 400", async () => {
      const { servicio } = crearServicio({
        error: { message: "La fecha de fin no puede ser anterior a la de inicio", code: "P0001" },
      });

      await expect(servicio.liquidacionIva("2026-07-01", "2026-09-30")).rejects.toThrow(
        "La fecha de fin no puede ser anterior a la de inicio",
      );
    });

    it("NO publica los errores del motor: nombres de tabla fuera", async () => {
      const { servicio } = crearServicio({
        error: { message: 'relation "pedido_iva" does not exist', code: "42P01" },
      });

      const promesa = servicio.liquidacionIva("2026-07-01", "2026-09-30");
      await expect(promesa).rejects.toThrow(UnprocessableEntityException);
      await expect(promesa).rejects.not.toThrow(/pedido_iva/);
    });
  });
});

describe("ContabilidadService — fecha de la factura de compra", () => {
  it("llama a la RPC con la factura y la fecha", async () => {
    const { servicio, llamadas } = crearServicio({ data: null });

    await servicio.fijarFechaFacturaCompra("11111111-1111-1111-1111-111111111111", "2026-08-01");

    expect(llamadas).toEqual([
      {
        fn: "fijar_fecha_factura_compra",
        args: {
          p_factura_id: "11111111-1111-1111-1111-111111111111",
          p_fecha_factura: "2026-08-01",
        },
      },
    ]);
  });

  it("publica el mensaje de la RPC cuando la fecha es futura", async () => {
    const { servicio } = crearServicio({
      error: { message: "La fecha de la factura no puede ser futura", code: "P0001" },
    });

    await expect(
      servicio.fijarFechaFacturaCompra("11111111-1111-1111-1111-111111111111", "2099-01-01"),
    ).rejects.toThrow("La fecha de la factura no puede ser futura");
  });

  it("se calla los errores del motor", async () => {
    const { servicio } = crearServicio({
      error: { message: 'column "fecha_factura" does not exist', code: "42703" },
    });

    const promesa = servicio.fijarFechaFacturaCompra(
      "11111111-1111-1111-1111-111111111111",
      "2026-08-01",
    );
    await expect(promesa).rejects.toThrow(UnprocessableEntityException);
    await expect(promesa).rejects.not.toThrow(/fecha_factura/);
  });
});
