import { BadRequestException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { EnvioService } from "./envio.service";

/**
 * La tarifa de envío, tal y como la lee y la escribe el panel (migración 080).
 *
 * ⚠️ Lo que se prueba aquí NO es cuánto paga un cliente: eso lo decide
 * `coste_envio_de` en la base y se prueba contra ella. Aquí se fija que los dos
 * números viajan enteros —sin que un `0` se convierta en `null` ni al revés— y
 * que `cobra_envio` dice la verdad, porque de ese booleano depende el aviso que
 * avisa de que la tienda está enviando gratis.
 */

const ACTOR = "aaaaaaaa-0000-4000-8000-000000000001";

function montar(fila: Record<string, unknown> | null, fallo?: string) {
  const registro = { updates: [] as Record<string, unknown>[] };

  const supabase = {
    from: () => ({
      select: () => ({
        maybeSingle: async () =>
          fallo ? { data: null, error: { message: fallo } } : { data: fila, error: null },
      }),
      update: (valores: Record<string, unknown>) => ({
        eq: async () => {
          registro.updates.push(valores);
          return { error: fallo ? { message: fallo } : null };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { servicio: new EnvioService(supabase), registro };
}

describe("EnvioService.ajustes", () => {
  it("lee la tarifa y dice que se cobra envío", async () => {
    const { servicio } = montar({
      envio_coste: "4.95",
      envio_gratis_desde: "40.00",
      updated_at: "2026-08-22T10:00:00Z",
    });

    await expect(servicio.ajustes()).resolves.toEqual({
      coste: 4.95,
      gratis_desde: 40,
      cobra_envio: true,
      actualizado_el: "2026-08-22T10:00:00Z",
    });
  });

  /**
   * ⚠️ EL ESTADO EN QUE ESTÁ LA TIENDA HOY, y el que tiene que salir avisado en
   * pantalla: coste 0 = se envía gratis a toda España. `cobra_envio` en false es
   * lo que enciende ese aviso.
   */
  it("con coste 0 dice que NO se cobra envío", async () => {
    const { servicio } = montar({
      envio_coste: "0.00",
      envio_gratis_desde: null,
      updated_at: null,
    });

    const a = await servicio.ajustes();
    expect(a.coste).toBe(0);
    expect(a.cobra_envio).toBe(false);
    expect(a.gratis_desde).toBeNull();
  });

  /** Sin fila en `ajustes_tienda` la tienda no cobra envío, que es lo seguro. */
  it("sin fila de ajustes no se inventa una tarifa", async () => {
    const { servicio } = montar(null);
    const a = await servicio.ajustes();
    expect(a).toEqual({ coste: 0, gratis_desde: null, cobra_envio: false, actualizado_el: null });
  });

  it("un fallo de lectura se convierte en error, no en tarifa 0 silenciosa", async () => {
    const { servicio } = montar(null, "conexión perdida");
    await expect(servicio.ajustes()).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("EnvioService.guardar", () => {
  it("guarda los dos importes y el autor del cambio", async () => {
    const { servicio, registro } = montar({
      envio_coste: "4.95",
      envio_gratis_desde: "40.00",
      updated_at: null,
    });

    await servicio.guardar({ coste: 4.95, gratis_desde: 40 }, ACTOR);

    expect(registro.updates).toEqual([
      { envio_coste: 4.95, envio_gratis_desde: 40, actualizado_por: ACTOR },
    ]);
  });

  /**
   * ⚠️ Quitar el umbral tiene que escribir `null`, no dejarlo como estaba. Sin
   * esto, una tienda que decidiera cobrar envío siempre se quedaría con el umbral
   * viejo activo y seguiría regalando portes por encima de él.
   */
  it("dejar vacío el umbral lo borra de verdad", async () => {
    const { servicio, registro } = montar({
      envio_coste: "4.95",
      envio_gratis_desde: null,
      updated_at: null,
    });

    await servicio.guardar({ coste: 4.95, gratis_desde: null }, ACTOR);

    expect(registro.updates[0]).toMatchObject({ envio_gratis_desde: null });
  });

  /** Un coste de 0 es apagar el porte, y tiene que llegar como 0 y no como null. */
  it("un coste de 0 se guarda como 0", async () => {
    const { servicio, registro } = montar({
      envio_coste: "0.00",
      envio_gratis_desde: null,
      updated_at: null,
    });

    await servicio.guardar({ coste: 0 }, ACTOR);

    expect(registro.updates[0]).toMatchObject({ envio_coste: 0 });
  });
});
