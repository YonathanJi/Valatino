import { InventarioService } from "./inventario.service";

/**
 * `registrarTransaccion` escribe en DOS sitios con UN solo parámetro de importe,
 * y esa es justo la costura donde se coló un fallo real: la transacción de un
 * reembolso guarda el ACUMULADO devuelto del cargo —tiene que hacerlo, porque
 * `totalesReembolsados` saca el total tomando el MÁXIMO de esa columna— mientras
 * que la línea de tiempo cuenta lo que pasó en ese momento. Compartiendo número,
 * la ficha escribía «Devolución de 3,02 €» al lado de los tres artículos que
 * valían 2,40 €.
 *
 * Aquí se prueba el reparto de esos dos importes, que es lo único que este método
 * decide por su cuenta.
 */
function montar(errorInsert: { code?: string; message: string } | null = null) {
  const registro = {
    filas: [] as Array<Record<string, unknown>>,
    eventos: [] as Array<Record<string, unknown>>,
  };

  const supabase = {
    from: () => ({
      insert: async (fila: Record<string, unknown>) => {
        registro.filas.push(fila);
        return { error: errorInsert };
      },
    }),
  };

  const eventos = {
    registrar: async (evento: Record<string, unknown>) => {
      registro.eventos.push(evento);
    },
  };

  return {
    servicio: new InventarioService(supabase as never, eventos as never),
    registro,
  };
}

describe("InventarioService.registrarTransaccion", () => {
  /**
   * El caso de siempre —un pago— donde los dos números SÍ son el mismo. Es el
   * comportamiento por defecto, y el que se rompería si alguien tocara el `??`.
   */
  it("sin importe propio, el evento hereda el de la transacción", async () => {
    const { servicio, registro } = montar();

    await servicio.registrarTransaccion(
      "ped-1",
      "stripe",
      "pi_1",
      "payment_intent.succeeded",
      "exitoso",
      49.99,
      {},
      { tipo: "pago", origen: "checkout" },
    );

    expect(registro.filas[0]).toMatchObject({ importe: 49.99, moneda: "EUR" });
    expect(registro.eventos[0]).toMatchObject({ tipo: "pago", importe: 49.99 });
  });

  /**
   * ⚠️⚠️ Y EL CASO QUE OBLIGÓ A SEPARARLOS: un reembolso parcial sobre un pedido
   * que ya llevaba devuelto algo. La transacción guarda el acumulado —de ahí sale
   * el total devuelto del pedido— y la ficha cuenta lo de esta vez.
   */
  it("con importe propio, cada sitio se queda con el suyo", async () => {
    const { servicio, registro } = montar();

    await servicio.registrarTransaccion(
      "ped-1",
      "stripe",
      "re_2",
      "reembolso.backoffice",
      "reembolsado_parcial",
      3.02, // acumulado devuelto del cargo
      {},
      {
        tipo: "reembolso",
        origen: "panel",
        detalle: "reembolso.backoffice · 3 × Galleta",
        importe: 2.4, // lo devuelto ahora, que es lo que valen esos 3 artículos
      },
    );

    expect(registro.filas[0]).toMatchObject({ importe: 3.02 });
    expect(registro.eventos[0]).toMatchObject({
      importe: 2.4,
      detalle: "reembolso.backoffice · 3 × Galleta",
    });
  });

  it("sin historial no se anota nada en la línea de tiempo", async () => {
    const { servicio, registro } = montar();

    await servicio.registrarTransaccion(
      "ped-1",
      "stripe",
      "re_3",
      "charge.refunded",
      "reembolsado",
      10,
      {},
    );

    expect(registro.filas).toHaveLength(1);
    expect(registro.eventos).toEqual([]);
  });

  /**
   * Un webhook que llega dos veces no es un error: el índice único de `evento_id`
   * lo corta y se ignora. Lo que NO puede pasar es que el duplicado escriba una
   * segunda línea en la ficha.
   */
  it("un evento duplicado no escribe en la línea de tiempo", async () => {
    const { servicio, registro } = montar({
      code: "23505",
      message: "duplicate key",
    });

    await servicio.registrarTransaccion(
      "ped-1",
      "stripe",
      "re_1",
      "charge.refunded",
      "reembolsado",
      10,
      {},
      { tipo: "reembolso", origen: "webhook" },
    );

    expect(registro.eventos).toEqual([]);
  });
});
