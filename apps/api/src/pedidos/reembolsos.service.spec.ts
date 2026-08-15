import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ReembolsosService } from "./reembolsos.service";

/**
 * Filtro encadenable: el servicio encadena .select().in().in(), .select().eq()
 * y .select().eq().order() según la tabla, y luego hace await. Cada eslabón
 * devuelve algo que es a la vez promesa y encadenable.
 */
function consulta<T>(resultado: T) {
  const p = Promise.resolve(resultado);
  return Object.assign(p, {
    in: () => consulta(resultado),
    eq: () => consulta(resultado),
    order: () => consulta(resultado),
    maybeSingle: async () => resultado,
  });
}

interface ItemMock {
  id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
}

interface LineaDevueltaMock {
  pedido_item_id: string;
  cantidad: number;
  importe: number;
  repuesto_al_stock: boolean;
  created_at: string;
}

interface Opciones {
  total?: number;
  estado?: string;
  metodoPago?: string;
  referenciaPago?: string | null;
  /** Filas de reembolso ya registradas (importes ACUMULADOS, ver el servicio) */
  reembolsosPrevios?: number[];
  /** false = el pedido ya estaba REEMBOLSADO cuando entró el RPC */
  rpcActuo?: boolean;
  existe?: boolean;
  /** Líneas del pedido, para los reembolsos por artículo */
  items?: ItemMock[];
  /** Artículos ya devueltos antes de esta operación */
  lineasPrevias?: LineaDevueltaMock[];
  /** Lo que contesta registrar_reembolso_lineas */
  rpcLineas?: Record<string, unknown>;
  /** El RPC de líneas falla: el dinero ya salió y no puede propagarse */
  rpcLineasError?: string;
}

const ITEMS_POR_DEFECTO: ItemMock[] = [
  { id: "it-1", nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 },
  { id: "it-2", nombre_producto: "Pony Malta", cantidad: 3, precio_unitario: 15 },
];

function montar(o: Opciones = {}) {
  const {
    total = 50,
    estado = "PROCESANDO",
    metodoPago = "stripe",
    referenciaPago = "pi_123",
    reembolsosPrevios = [],
    rpcActuo = true,
    existe = true,
    items = ITEMS_POR_DEFECTO,
    lineasPrevias = [],
    rpcLineas,
    rpcLineasError,
  } = o;

  const registro = {
    refunds: [] as Array<{ importeCents: number; idempotencyKey: string }>,
    transacciones: [] as Array<{
      estado: string;
      importe: number;
      eventoId: string;
      detalle?: string;
      /** El importe que va a la LÍNEA DE TIEMPO, que no es el de la transacción. */
      importeEvento?: number;
    }>,
    rpc: [] as string[],
    rpcParams: [] as Array<Record<string, unknown>>,
    emails: [] as Array<{ importe?: number }>,
  };

  const supabase = {
    from: (tabla: string) => ({
      select: () => {
        if (tabla === "transacciones_pago") {
          return consulta({
            data: reembolsosPrevios.map((importe) => ({ pedido_id: "ped-1", importe })),
            error: null,
          });
        }
        if (tabla === "pedido_items") {
          return consulta({ data: items, error: null });
        }
        if (tabla === "reembolso_lineas") {
          return consulta({ data: lineasPrevias, error: null });
        }
        return consulta(
          existe
            ? {
                data: {
                  id: "ped-1",
                  estado,
                  total,
                  metodo_pago: metodoPago,
                  referencia_pago: referenciaPago,
                  numero_pedido: "260725018055",
                },
                error: null,
              }
            : { data: null, error: null },
        );
      },
    }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      registro.rpc.push(`${fn}:${params["p_pedido_id"] as string}`);
      registro.rpcParams.push(params);

      if (fn === "registrar_reembolso_lineas") {
        if (rpcLineasError) return { data: null, error: { message: rpcLineasError } };
        return {
          data: rpcLineas ?? {
            registradas: (params["p_lineas"] as unknown[]).length,
            pedidas: (params["p_lineas"] as unknown[]).length,
            unidades: 1,
            importe: 0,
            unidades_repuestas: params["p_reponer_stock"] ? 1 : 0,
            repuesto: Boolean(params["p_reponer_stock"]),
            marcado_total: Boolean(params["p_marcar_total"]),
          },
          error: null,
        };
      }

      return { data: rpcActuo, error: null };
    },
  };

  const stripe = {
    crearReembolso: async (params: { importeCents: number; idempotencyKey: string }) => {
      registro.refunds.push(params);
      return { id: `re_${registro.refunds.length}` };
    },
  };

  const inventario = {
    registrarTransaccion: async (
      _pedidoId: string,
      _proveedor: string,
      eventoId: string,
      _tipoEvento: string,
      estadoTx: string,
      importe: number,
      _payload?: object,
      historial?: { detalle?: string; importe?: number },
    ) => {
      registro.transacciones.push({
        estado: estadoTx,
        importe,
        eventoId,
        detalle: historial?.detalle,
        importeEvento: historial?.importe,
      });
    },
    getPedidoConItems: async () => ({
      id: "ped-1",
      numero_pedido: "260725018055",
      estado,
      total,
      metodo_pago: "stripe",
      email_cliente: "cliente@ejemplo.com",
      envio_nombre: "Ana Pérez",
      envio_linea1: "Calle Mayor 3",
      envio_linea2: null,
      envio_ciudad: "Madrid",
      envio_codigo_postal: "28001",
      envio_provincia: "Madrid",
      envio_pais: "ES",
      created_at: "2026-07-20T10:00:00Z",
      items: [{ nombre_producto: "Nucita", cantidad: 1, precio_unitario: 2.5 }],
    }),
  };

  const email = {
    enviarReembolso: async (datos: { importeReembolsado?: number }) => {
      registro.emails.push({ importe: datos.importeReembolsado });
    },
  };

  const servicio = new ReembolsosService(
    supabase as never,
    stripe as never,
    inventario as never,
    email as never,
  );

  return { servicio, registro };
}

/** Cede el turno para que corra el aviso disparado sin await. */
const dejarQueSalgaElEmail = () => new Promise((r) => setImmediate(r));

describe("ReembolsosService.totalesReembolsados", () => {
  /**
   * La prueba que protege la decisión de diseño: cada fila guarda el acumulado
   * devuelto, no el incremento, porque el mismo reembolso se registra dos veces
   * (al pedirlo en el panel y al confirmarlo el webhook) con evento_id distinto.
   * Sumar contaría el doble y bloquearía devoluciones legítimas.
   */
  it("se queda con el máximo, no con la suma (el mismo reembolso llega dos veces)", async () => {
    const { servicio } = montar({ reembolsosPrevios: [10, 10] });

    expect(await servicio.totalReembolsado("ped-1")).toBe(10);
  });

  it("con varias devoluciones el máximo es el acumulado más reciente", async () => {
    const { servicio } = montar({ reembolsosPrevios: [10, 25, 25] });

    expect(await servicio.totalReembolsado("ped-1")).toBe(25);
  });

  it("sin reembolsos devuelve 0", async () => {
    const { servicio } = montar();

    expect(await servicio.totalReembolsado("ped-1")).toBe(0);
  });
});

/**
 * Lo que se le enseña al cliente en «Mis pedidos». La tabla guarda además si la
 * mercancía volvió al almacén, quién tramitó la devolución y el identificador
 * del cobro en Stripe: nada de eso es asunto de quien compró.
 */
describe("ReembolsosService.articulosDevueltos", () => {
  function montarConsulta(filas: Array<Record<string, unknown>>) {
    const seleccionado: string[] = [];
    const supabase = {
      from: () => ({
        select: (campos: string) => {
          seleccionado.push(campos);
          return consulta({ data: filas, error: null });
        },
      }),
    };
    const servicio = new ReembolsosService(
      supabase as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { servicio, seleccionado };
  }

  const FILA = {
    pedido_id: "ped-1",
    cantidad: 2,
    importe: "5.00",
    created_at: "2026-08-02T10:00:00Z",
    pedido_items: { nombre_producto: "Nucita" },
  };

  it("devuelve qué artículo, cuántas unidades, cuánto y cuándo", async () => {
    const { servicio } = montarConsulta([FILA]);

    const porPedido = await servicio.articulosDevueltos(["ped-1"]);

    expect(porPedido.get("ped-1")).toEqual([
      {
        nombre_producto: "Nucita",
        cantidad: 2,
        importe: 5,
        fecha: "2026-08-02T10:00:00Z",
      },
    ]);
  });

  it("no expone nada interno aunque la fila lo traiga", async () => {
    const { servicio } = montarConsulta([
      { ...FILA, repuesto_al_stock: true, refund_id: "re_secreto", actor_user_id: "admin-1" },
    ]);

    const [articulo] = (await servicio.articulosDevueltos(["ped-1"])).get("ped-1") ?? [];

    expect(Object.keys(articulo ?? {}).sort()).toEqual([
      "cantidad",
      "fecha",
      "importe",
      "nombre_producto",
    ]);
  });

  /** Un `select("*")` publicaría cada columna nueva que se añada a la tabla. */
  it("pide campos concretos, nunca el comodín", async () => {
    const { servicio, seleccionado } = montarConsulta([]);

    await servicio.articulosDevueltos(["ped-1"]);

    expect(seleccionado[0]).not.toContain("*");
    expect(seleccionado[0]).not.toContain("repuesto_al_stock");
    expect(seleccionado[0]).not.toContain("refund_id");
  });

  it("sin pedidos no consulta nada", async () => {
    const { servicio, seleccionado } = montarConsulta([FILA]);

    expect((await servicio.articulosDevueltos([])).size).toBe(0);
    expect(seleccionado).toEqual([]);
  });

  it("agrupa varias devoluciones del mismo pedido", async () => {
    const { servicio } = montarConsulta([
      FILA,
      { ...FILA, cantidad: 1, importe: "1.50", pedido_items: { nombre_producto: "Pony Malta" } },
    ]);

    expect((await servicio.articulosDevueltos(["ped-1"])).get("ped-1")).toHaveLength(2);
  });

  it("si el producto ya no está, usa una etiqueta neutra en vez de un hueco", async () => {
    const { servicio } = montarConsulta([{ ...FILA, pedido_items: null }]);

    const [articulo] = (await servicio.articulosDevueltos(["ped-1"])).get("ped-1") ?? [];

    expect(articulo?.nombre_producto).toBe("Artículo del pedido");
  });
});

describe("ReembolsosService.reembolsar", () => {
  it("sin importe devuelve todo lo que quede pendiente", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [20] });

    const r = await servicio.reembolsar("ped-1", {}, "admin@valatino.es");

    expect(registro.refunds[0]!.importeCents).toBe(3000); // 50 − 20
    expect(r.es_total).toBe(true);
    expect(r.total_reembolsado).toBe(50);
  });

  it("registra el ACUMULADO devuelto, no lo devuelto esta vez", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [20] });

    await servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");

    expect(registro.transacciones[0]).toMatchObject({
      estado: "reembolsado_parcial",
      importe: 30, // 20 previos + 10
    });
  });

  /**
   * ⚠️⚠️ Y LA LÍNEA DE TIEMPO CUENTA LO OTRO: lo devuelto AHORA. Los dos números
   * son distintos y hasta hoy compartían uno solo, así que la ficha mentía.
   *
   * El caso real, del 2026-08-14: una segunda devolución de 2,40 € sobre un
   * pedido que ya llevaba 0,62 € escribió «Devolución de 3,02 € · 3 × Galleta
   * Festival Sabor Chocolate». Las tres galletas costaban 2,40 €, y su propia
   * rectificativa decía −2,40 €: la ficha y el documento fiscal se contradecían
   * sobre el mismo dinero.
   */
  it("la línea de tiempo cuenta lo devuelto AHORA, no el acumulado", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [20] });

    await servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");

    expect(registro.transacciones[0]).toMatchObject({
      importe: 30, // la transacción, acumulada: de ahí sale el total devuelto
      importeEvento: 10, // la ficha, lo de esta vez
    });
  });

  /**
   * Y con artículos es donde se veía el disparate, porque al lado del importe va
   * la lista de lo devuelto: el importe tiene que ser el de ESOS artículos.
   */
  it("con artículos, el importe del evento es el de esos artículos", async () => {
    const { servicio, registro } = montar({
      total: 50,
      reembolsosPrevios: [5],
      items: [{ id: "it-1", nombre_producto: "Nucita", cantidad: 4, precio_unitario: 2.5 }],
    });

    await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 3 }] },
      "admin@valatino.es",
    );

    expect(registro.transacciones[0]).toMatchObject({
      detalle: "reembolso.backoffice · 3 × Nucita",
      importe: 12.5, // 5 previos + 7,50
      importeEvento: 7.5, // 3 × 2,50, que es lo que dice el detalle
    });
  });

  it("un reembolso parcial no marca el pedido ni repone stock", async () => {
    const { servicio, registro } = montar({ total: 50 });

    const r = await servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");

    expect(registro.rpc).toEqual([]);
    expect(r.es_total).toBe(false);
    expect(r.estado).toBe("PROCESANDO");
    expect(r.stock_repuesto).toBe(false);
  });

  it("un reembolso total marca el pedido y repone stock", async () => {
    const { servicio, registro } = montar({ total: 50 });

    const r = await servicio.reembolsar("ped-1", { importe: 50 }, "admin@valatino.es");

    expect(registro.rpc).toEqual(["reembolsar_pedido_total:ped-1"]);
    expect(r.estado).toBe("REEMBOLSADO");
    expect(r.stock_repuesto).toBe(true);
    expect(registro.transacciones[0]).toMatchObject({ estado: "reembolsado" });
  });

  it("no repone stock dos veces si el webhook llegó primero", async () => {
    const { servicio } = montar({ total: 50, rpcActuo: false });

    const r = await servicio.reembolsar("ped-1", { importe: 50 }, "admin@valatino.es");

    // El RPC dice que no actuó: el estado ya estaba puesto por el otro camino
    expect(r.stock_repuesto).toBe(false);
    expect(r.es_total).toBe(true);
  });

  it("rechaza devolver más de lo que queda", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [45] });

    await expect(
      servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es"),
    ).rejects.toThrow(BadRequestException);
    expect(registro.refunds).toEqual([]);
  });

  it("409 si ya se devolvió el importe completo", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [50] });

    await expect(servicio.reembolsar("ped-1", {}, "admin@valatino.es")).rejects.toThrow(
      ConflictException,
    );
    expect(registro.refunds).toEqual([]);
  });

  it("no cobra nada en Stripe si el pedido se pagó con PayPal", async () => {
    const { servicio, registro } = montar({ metodoPago: "paypal" });

    await expect(servicio.reembolsar("ped-1", {}, "admin@valatino.es")).rejects.toThrow(
      BadRequestException,
    );
    expect(registro.refunds).toEqual([]);
  });

  it("rechaza un pedido sin cobro (PENDIENTE_PAGO) y uno ya cancelado", async () => {
    for (const estado of ["PENDIENTE_PAGO", "CANCELADO", "REEMBOLSADO"]) {
      const { servicio, registro } = montar({ estado });

      await expect(servicio.reembolsar("ped-1", {}, "admin@valatino.es")).rejects.toThrow(
        BadRequestException,
      );
      expect(registro.refunds).toEqual([]);
    }
  });

  it("rechaza un pedido sin referencia de pago", async () => {
    const { servicio, registro } = montar({ referenciaPago: null });

    await expect(servicio.reembolsar("ped-1", {}, "admin@valatino.es")).rejects.toThrow(
      BadRequestException,
    );
    expect(registro.refunds).toEqual([]);
  });

  it("404 si el pedido no existe", async () => {
    const { servicio } = montar({ existe: false });

    await expect(servicio.reembolsar("fantasma", {}, "admin@valatino.es")).rejects.toThrow(
      NotFoundException,
    );
  });

  /**
   * La clave de idempotencia es lo que impide que un doble clic cobre dos
   * reembolsos: misma situación + mismo importe = Stripe devuelve el que ya
   * creó. Debe llevar el punto de partida, para que dos parciales iguales
   * seguidos (10 € y otros 10 €) sí se cobren los dos.
   */
  it("la clave de idempotencia depende de lo ya devuelto y del importe", async () => {
    const primero = montar({ total: 50 });
    await primero.servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");

    const segundo = montar({ total: 50, reembolsosPrevios: [10] });
    await segundo.servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");

    expect(primero.registro.refunds[0]!.idempotencyKey).toBe("reembolso:ped-1:0:1000");
    expect(segundo.registro.refunds[0]!.idempotencyKey).toBe("reembolso:ped-1:1000:1000");
  });

  it("avisa al cliente con el importe acumulado devuelto", async () => {
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [20] });

    await servicio.reembolsar("ped-1", { importe: 10 }, "admin@valatino.es");
    await dejarQueSalgaElEmail();

    expect(registro.emails).toEqual([{ importe: 30 }]);
  });
});

/**
 * Devolver artículos concretos en vez de una cifra (migración 044). Lo que
 * distingue a este camino es que el reembolso SÍ dice qué unidades vuelven, y
 * de ahí que pueda reponer stock en un parcial —cosa que la 037 dejó fuera a
 * propósito porque un importe suelto no da esa información.
 */
describe("ReembolsosService.reembolsar por artículos", () => {
  it("el importe lo ponen los precios del servidor, no el navegador", async () => {
    const { servicio, registro } = montar({ total: 50 });

    // 2 × Nucita a 2,50 = 5,00. El cliente no manda importe en ningún momento.
    const r = await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 2 }] },
      "admin@valatino.es",
    );

    expect(registro.refunds[0]!.importeCents).toBe(500);
    expect(r.importe).toBe(5);
    expect(r.unidades_devueltas).toBe(2);
  });

  it("suma varias líneas con precios distintos", async () => {
    const { servicio, registro } = montar({ total: 50 });

    await servicio.reembolsar(
      "ped-1",
      {
        lineas: [
          { pedido_item_id: "it-1", cantidad: 1 }, // 2,50
          { pedido_item_id: "it-2", cantidad: 2 }, // 30,00
        ],
      },
      "admin@valatino.es",
    );

    expect(registro.refunds[0]!.importeCents).toBe(3250);
  });

  it("rechaza un artículo que no es de este pedido, sin cobrar nada", async () => {
    const { servicio, registro } = montar();

    await expect(
      servicio.reembolsar(
        "ped-1",
        { lineas: [{ pedido_item_id: "it-de-otro", cantidad: 1 }] },
        "admin@valatino.es",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(registro.refunds).toEqual([]);
  });

  it("rechaza más unidades de las que se compraron", async () => {
    const { servicio, registro } = montar();

    await expect(
      servicio.reembolsar(
        "ped-1",
        { lineas: [{ pedido_item_id: "it-1", cantidad: 3 }] }, // se compraron 2
        "admin@valatino.es",
      ),
    ).rejects.toThrow(/solo quedan 2 unidades/i);
    expect(registro.refunds).toEqual([]);
  });

  /** La razón de ser de la tabla: la segunda devolución sabe qué queda. */
  it("descuenta lo ya devuelto de esa misma línea", async () => {
    const { servicio, registro } = montar({
      lineasPrevias: [
        {
          pedido_item_id: "it-1",
          cantidad: 1,
          importe: 2.5,
          repuesto_al_stock: true,
          created_at: "2026-08-01T10:00:00Z",
        },
      ],
    });

    // De las 2 compradas ya se devolvió 1: pedir 2 se pasa.
    await expect(
      servicio.reembolsar(
        "ped-1",
        { lineas: [{ pedido_item_id: "it-1", cantidad: 2 }] },
        "admin@valatino.es",
      ),
    ).rejects.toThrow(/queda 1 unidad/i);
    expect(registro.refunds).toEqual([]);
  });

  it("rechaza una línea ya devuelta por completo", async () => {
    const { servicio } = montar({
      lineasPrevias: [
        {
          pedido_item_id: "it-1",
          cantidad: 2,
          importe: 5,
          repuesto_al_stock: true,
          created_at: "2026-08-01T10:00:00Z",
        },
      ],
    });

    await expect(
      servicio.reembolsar(
        "ped-1",
        { lineas: [{ pedido_item_id: "it-1", cantidad: 1 }] },
        "admin@valatino.es",
      ),
    ).rejects.toThrow(/ya se devolvió por completo/i);
  });

  it("rechaza la misma línea repetida en vez de sumarla a escondidas", async () => {
    const { servicio, registro } = montar();

    await expect(
      servicio.reembolsar(
        "ped-1",
        {
          lineas: [
            { pedido_item_id: "it-1", cantidad: 1 },
            { pedido_item_id: "it-1", cantidad: 1 },
          ],
        },
        "admin@valatino.es",
      ),
    ).rejects.toThrow(/repetido/i);
    expect(registro.refunds).toEqual([]);
  });

  it("rechaza artículos e importe a la vez: no hay cuál gana", async () => {
    const { servicio, registro } = montar();

    await expect(
      servicio.reembolsar(
        "ped-1",
        { importe: 1, lineas: [{ pedido_item_id: "it-1", cantidad: 1 }] },
        "admin@valatino.es",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(registro.refunds).toEqual([]);
  });

  it("rechaza artículos que suman más de lo que queda por devolver", async () => {
    // Antes se devolvieron 48 € sin decir de qué artículo: quedan 2 €, pero los
    // artículos siguen figurando como no devueltos.
    const { servicio, registro } = montar({ total: 50, reembolsosPrevios: [48] });

    await expect(
      servicio.reembolsar(
        "ped-1",
        { lineas: [{ pedido_item_id: "it-2", cantidad: 1 }] }, // 15 €
        "admin@valatino.es",
      ),
    ).rejects.toThrow(/solo quedan 2,00 €|solo quedan 2.00 €/);
    expect(registro.refunds).toEqual([]);
  });

  it("registra qué se devolvió y si repone stock", async () => {
    const { servicio, registro } = montar({ total: 50 });

    const r = await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 1 }], reponer_stock: true },
      "admin@valatino.es",
    );

    expect(registro.rpc).toEqual(["registrar_reembolso_lineas:ped-1"]);
    expect(registro.rpcParams[0]).toMatchObject({
      p_lineas: [{ pedido_item_id: "it-1", cantidad: 1 }],
      p_reponer_stock: true,
      p_marcar_total: false,
      p_refund_id: "re_1",
    });
    expect(r.stock_repuesto).toBe(true);
  });

  it("sin reponer stock, la mercancía no vuelve al inventario", async () => {
    const { servicio, registro } = montar({ total: 50 });

    const r = await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 1 }], reponer_stock: false },
      "admin@valatino.es",
    );

    expect(registro.rpcParams[0]).toMatchObject({ p_reponer_stock: false });
    expect(r.stock_repuesto).toBe(false);
  });

  /**
   * El orden importa y por eso va todo en una llamada: si se marcara el pedido
   * REEMBOLSADO antes de apuntar las líneas, `reembolsar_pedido_total` no las
   * vería y repondría su stock por segunda vez.
   */
  it("cierra el pedido dentro de la misma llamada, no con una aparte", async () => {
    const { servicio, registro } = montar({ total: 5 }); // 2 × Nucita = 5 € = el total

    const r = await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 2 }], reponer_stock: true },
      "admin@valatino.es",
    );

    expect(registro.rpc).toEqual(["registrar_reembolso_lineas:ped-1"]);
    expect(registro.rpc).not.toContain("reembolsar_pedido_total:ped-1");
    expect(registro.rpcParams[0]).toMatchObject({ p_marcar_total: true });
    expect(r.es_total).toBe(true);
    expect(r.estado).toBe("REEMBOLSADO");
  });

  /**
   * Dos líneas distintas pueden costar lo mismo. Sin la huella de los artículos
   * en la clave, devolver una y luego la otra daría la misma clave: Stripe
   * devolvería el refund de la primera sin cobrar nada y el panel diría que la
   * segunda se devolvió.
   */
  it("la clave de idempotencia distingue dos selecciones del mismo importe", async () => {
    const items: ItemMock[] = [
      { id: "it-a", nombre_producto: "A", cantidad: 1, precio_unitario: 10 },
      { id: "it-b", nombre_producto: "B", cantidad: 1, precio_unitario: 10 },
    ];

    const a = montar({ total: 50, items });
    await a.servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-a", cantidad: 1 }] },
      "admin@valatino.es",
    );

    const b = montar({ total: 50, items });
    await b.servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-b", cantidad: 1 }] },
      "admin@valatino.es",
    );

    const claveA = a.registro.refunds[0]!.idempotencyKey;
    const claveB = b.registro.refunds[0]!.idempotencyKey;
    expect(claveA).toContain("reembolso:ped-1:0:1000:");
    expect(claveB).toContain("reembolso:ped-1:0:1000:");
    expect(claveA).not.toBe(claveB);
  });

  it("el mismo conjunto en distinto orden es la misma devolución", async () => {
    const a = montar({ total: 50 });
    await a.servicio.reembolsar(
      "ped-1",
      {
        lineas: [
          { pedido_item_id: "it-1", cantidad: 1 },
          { pedido_item_id: "it-2", cantidad: 1 },
        ],
      },
      "admin@valatino.es",
    );

    const b = montar({ total: 50 });
    await b.servicio.reembolsar(
      "ped-1",
      {
        lineas: [
          { pedido_item_id: "it-2", cantidad: 1 },
          { pedido_item_id: "it-1", cantidad: 1 },
        ],
      },
      "admin@valatino.es",
    );

    expect(a.registro.refunds[0]!.idempotencyKey).toBe(b.registro.refunds[0]!.idempotencyKey);
  });

  it("la línea de tiempo dice qué artículos se devolvieron, no solo cuánto", async () => {
    const { servicio, registro } = montar({ total: 50 });

    await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 2 }] },
      "admin@valatino.es",
    );

    expect(registro.transacciones[0]!.detalle).toContain("2 × Nucita");
  });

  /**
   * El dinero ya salió de Stripe cuando se llama al RPC. Si falla el registro,
   * dejar caer la petición convertiría una devolución hecha en un error en
   * pantalla, y quien lo lea reintentará.
   */
  it("si no se pueden apuntar las líneas, la devolución no se convierte en error", async () => {
    const { servicio, registro } = montar({
      total: 50,
      rpcLineasError: "conexión perdida con la base",
    });

    const r = await servicio.reembolsar(
      "ped-1",
      { lineas: [{ pedido_item_id: "it-1", cantidad: 1 }], reponer_stock: true },
      "admin@valatino.es",
    );

    expect(r.importe).toBe(2.5);
    expect(r.stock_repuesto).toBe(false);
    expect(registro.refunds).toHaveLength(1);
  });
});
