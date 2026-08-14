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

/**
 * La población de un dato fiscal, contra el diccionario del INE.
 *
 * ⚠️⚠️ ESTOS TESTS EXISTEN PORQUE FALTABAN, Y SE NOTÓ EN PRODUCCIÓN. El emisor se
 * guardó con la población «españa» y salió impreso en la primera factura real
 * (`Calle del Arco, 9 · 28840 españa`); el receptor de `VALF202600100` quedó como
 * «Mejorada del campo» mientras el pedido de esa misma venta guardaba la forma
 * oficial. Las dos rutas hacían `trim()` y nada más.
 *
 * Lo que más duele: `municipioCanonico("28001", "españa")` YA devolvía `null` y
 * estaba probado con 264 tests. La comprobación existía; estas dos rutas no la
 * llamaban. Un test aquí lo habría cazado antes que un documento contable.
 */
describe("ContabilidadService — la población de un dato fiscal", () => {
  /** Supabase de mentira con `from`, que es lo que usan estas dos rutas. */
  function crearSupabaseConFrom(filaFactura: unknown = { id: "f1", numero: "VALF202600100" }) {
    const rpc: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const updates: Array<Record<string, unknown>> = [];

    const supabase = {
      rpc: (fn: string, args?: Record<string, unknown>) => {
        rpc.push({ fn, args: args ?? {} });
        return Promise.resolve({ data: fn === "emitir_factura_completa" ? "f1" : null, error: null });
      },
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: filaFactura, error: null }) }),
          maybeSingle: () => Promise.resolve({ data: {}, error: null }),
        }),
      }),
    };

    return { servicio: new ContabilidadService(supabase as unknown as SupabaseClient), rpc, updates };
  }

  const RECEPTOR = {
    nif: "12345678Z",
    nombre: "Cliente",
    direccion: "Calle Falsa 1",
    codigo_postal: "28840",
    ciudad: "Mejorada del Campo",
  };

  describe("al emitir la factura completa", () => {
    it("guarda el nombre OFICIAL del municipio, no lo que se tecleó", async () => {
      const { servicio, rpc } = crearSupabaseConFrom();

      await servicio.emitirFacturaCompleta("p1", { ...RECEPTOR, ciudad: "mejorada  DEL campo" });

      const receptor = rpc[0]!.args["p_receptor"] as Record<string, unknown>;
      expect(receptor["ciudad"]).toBe("Mejorada del Campo");
    });

    it("DERIVA la provincia del código postal e ignora la que llegue", async () => {
      // Es la regla de la 041: la provincia es deducible, y dejar que la escriba
      // quien rellena el formulario es lo que llenó la columna de «españa».
      const { servicio, rpc } = crearSupabaseConFrom();

      await servicio.emitirFacturaCompleta("p1", { ...RECEPTOR, provincia: "Barcelona" });

      const receptor = rpc[0]!.args["p_receptor"] as Record<string, unknown>;
      expect(receptor["provincia"]).toBe("Madrid");
    });

    it("rechaza «españa» como población, que es el caso que pasó de verdad", async () => {
      const { servicio, rpc } = crearSupabaseConFrom();

      await expect(
        servicio.emitirFacturaCompleta("p1", { ...RECEPTOR, ciudad: "españa" }),
      ).rejects.toThrow(BadRequestException);

      // Y no llega a la base: una factura es inmutable, así que el momento de
      // pararlo es antes de que exista.
      expect(rpc).toHaveLength(0);
    });

    it("dice POR QUÉ lo rechaza, nombrando la provincia del CP", async () => {
      // Un test que solo comprobara «rechaza» daría por bueno un mensaje inútil.
      // Es la lección de la 073 con el `text[] || 'NIF'`.
      const { servicio } = crearSupabaseConFrom();

      await expect(
        servicio.emitirFacturaCompleta("p1", { ...RECEPTOR, ciudad: "Barcelona" }),
      ).rejects.toThrow(/no es un municipio de Madrid.*28840/);
    });

    it("rechaza un municipio que existe pero es de otra provincia", async () => {
      const { servicio } = crearSupabaseConFrom();

      await expect(
        servicio.emitirFacturaCompleta("p1", { ...RECEPTOR, codigo_postal: "08001" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("al guardar el emisor en TI → Ajustes", () => {
    const EMISOR = {
      nif: "Z4194001W",
      nombre: "Leydy Jhoanna Mendoza Sanchez",
      direccion: "Calle del Arco, 9",
      codigoPostal: "28840",
      ciudad: "Mejorada del Campo",
    };

    it("rechaza «españa», que es por donde entró el fallo", async () => {
      const { servicio, updates } = crearSupabaseConFrom();

      await expect(servicio.guardarEmisor({ ...EMISOR, ciudad: "españa" })).rejects.toThrow(
        BadRequestException,
      );

      // Nada se guarda: la siguiente factura congelaría este valor en su snapshot.
      expect(updates).toHaveLength(0);
    });

    it("canoniza la población y deriva la provincia", async () => {
      const { servicio, updates } = crearSupabaseConFrom();

      await servicio.guardarEmisor({
        ...EMISOR,
        ciudad: "MEJORADA DEL CAMPO",
        provincia: "Teruel",
      });

      expect(updates[0]).toMatchObject({
        emisor_ciudad: "Mejorada del Campo",
        emisor_provincia: "Madrid",
        emisor_codigo_postal: "28840",
      });
    });

    it("rechaza un código postal que no es de ninguna provincia", async () => {
      const { servicio } = crearSupabaseConFrom();

      await expect(
        servicio.guardarEmisor({ ...EMISOR, codigoPostal: "99999" }),
      ).rejects.toThrow("El código postal no es válido");
    });
  });
});
