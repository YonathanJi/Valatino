import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ReembolsosService } from "./reembolsos.service";

/**
 * Filtro encadenable: el servicio hace .select().in().in() y luego await, así
 * que cada eslabón devuelve algo que es a la vez promesa y encadenable.
 */
function consulta<T>(resultado: T) {
  const p = Promise.resolve(resultado);
  return Object.assign(p, { in: () => consulta(resultado) });
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
}

function montar(o: Opciones = {}) {
  const {
    total = 50,
    estado = "PROCESANDO",
    metodoPago = "stripe",
    referenciaPago = "pi_123",
    reembolsosPrevios = [],
    rpcActuo = true,
    existe = true,
  } = o;

  const registro = {
    refunds: [] as Array<{ importeCents: number; idempotencyKey: string }>,
    transacciones: [] as Array<{ estado: string; importe: number; eventoId: string }>,
    rpc: [] as string[],
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
        return {
          eq: () => ({
            maybeSingle: async () =>
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
          }),
        };
      },
    }),
    rpc: async (fn: string, params: { p_pedido_id: string }) => {
      registro.rpc.push(`${fn}:${params.p_pedido_id}`);
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
    ) => {
      registro.transacciones.push({ estado: estadoTx, importe, eventoId });
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
