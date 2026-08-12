import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { TransferenciaService } from "./transferencia.service";

const CUENTA = {
  TRANSFERENCIA_IBAN: "ES33 9490 0934 2392 2994 3748",
  TRANSFERENCIA_TITULAR: "Valentino Jimenez Mendoza",
  TRANSFERENCIA_BANCO: "BBVA",
};

function montar(
  entorno: Record<string, string> = CUENTA,
  opciones: {
    pedido?: Record<string, unknown> | null;
    rpc?: unknown;
    error?: unknown;
    ajustes?: Record<string, unknown> | null;
    emailFalla?: boolean;
  } = {},
) {
  const { pedido = null, rpc = null, error = null, ajustes = null, emailFalla = false } = opciones;
  const llamadas: Array<{ fn: string; params: Record<string, unknown> }> = [];
  const correos: Array<Record<string, unknown>> = [];

  const supabase = {
    from: (tabla: string) => ({
      select: () => {
        // La cuenta de cobro vive ahora en ajustes_tienda (046); el entorno es
        // solo respaldo. Sin fila, el servicio cae a las variables.
        if (tabla === "ajustes_tienda") {
          return {
            maybeSingle: async () => ({ data: ajustes, error: null }),
            eq: () => ({ maybeSingle: async () => ({ data: ajustes, error: null }) }),
          };
        }
        return { eq: () => ({ maybeSingle: async () => ({ data: pedido, error: null }) }) };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      llamadas.push({ fn, params });
      return { data: rpc, error };
    },
  };

  const config = { get: (clave: string) => entorno[clave] };
  const email = {
    enviarInstruccionesTransferencia: async (datos: Record<string, unknown>) => {
      if (emailFalla) throw new Error("SMTP no responde");
      correos.push(datos);
    },
    enviarConfirmacionPedido: async () => undefined,
  };
  const inventario = { getPedidoConItems: async () => null };

  const servicio = new TransferenciaService(
    supabase as never,
    email as never,
    inventario as never,
    config as never,
  );
  return { servicio, llamadas, correos };
}

/**
 * El aviso sale con `void`, sin await: el cliente está esperando su IBAN en
 * pantalla y SMTP tarda segundos. Hay que dejar correr la cola de microtareas
 * antes de mirar si se envió, o el test comprueba un correo que aún no ha
 * salido y pasa a verde por accidente.
 */
const dejarSalirElAviso = () => new Promise((listo) => setImmediate(listo));

describe("TransferenciaService — disponibilidad", () => {
  /**
   * Sin cuenta configurada el método se apaga solo. Es la diferencia entre no
   * ofrecer transferencia y ofrecerla para luego no poder decir a dónde pagar,
   * que deja al cliente con un pedido y sin salida.
   */
  it("no está disponible sin IBAN", async () => {
    const { servicio } = montar({ TRANSFERENCIA_TITULAR: "Alguien" });
    expect((await servicio.disponibilidad()).disponible).toBe(false);
  });

  it("no está disponible sin titular", async () => {
    const { servicio } = montar({ TRANSFERENCIA_IBAN: "ES3394900934239229943748" });
    expect((await servicio.disponibilidad()).disponible).toBe(false);
  });

  it("está disponible con cuenta y titular, con el plazo por defecto", async () => {
    const { servicio } = montar();
    expect(await servicio.disponibilidad()).toEqual({ disponible: true, dias_plazo: 3 });
  });

  it("el plazo se puede configurar", async () => {
    const { servicio } = montar({ ...CUENTA, TRANSFERENCIA_DIAS_PLAZO: "5" });
    expect((await servicio.disponibilidad()).dias_plazo).toBe(5);
  });

  it("un plazo ilegible cae al valor por defecto en vez de dejarlo en NaN", async () => {
    const { servicio } = montar({ ...CUENTA, TRANSFERENCIA_DIAS_PLAZO: "pronto" });
    expect((await servicio.disponibilidad()).dias_plazo).toBe(3);
  });

  it("crear un pedido sin cuenta configurada se rechaza, no falla a medias", async () => {
    const { servicio, llamadas } = montar({});
    await expect(
      servicio.crearPedido({ sessionId: "s", claveIdempotencia: "k" }),
    ).rejects.toThrow(BadRequestException);
    expect(llamadas).toEqual([]);
  });
});

describe("TransferenciaService — instrucciones de pago", () => {
  const PEDIDO = {
    id: "ped-1",
    numero_pedido: "260802031234",
    total: "12.50",
    pago_vence_el: "2026-08-05T21:59:59Z",
    metodo_pago: "transferencia",
    estado: "PENDIENTE_PAGO",
  };

  it("el IBAN se guarda sin espacios y se muestra de cuatro en cuatro", async () => {
    const { servicio } = montar(CUENTA, { pedido: PEDIDO });
    const i = await servicio.instrucciones("ped-1");

    expect(i.iban).toBe("ES33 9490 0934 2392 2994 3748");
  });

  /**
   * El concepto ES el número de pedido, sin adornos: es lo único que permite
   * casar un apunte del banco con un pedido. Si alguien lo cambia por «Pedido
   * 2608…», el que concilia tiene que ponerse a interpretar.
   */
  it("el concepto es exactamente el número de pedido", async () => {
    const { servicio } = montar(CUENTA, { pedido: PEDIDO });
    const i = await servicio.instrucciones("ped-1");

    expect(i.concepto).toBe("260802031234");
    expect(i.importe).toBe(12.5);
    expect(i.titular).toBe("Valentino Jimenez Mendoza");
    expect(i.banco).toBe("BBVA");
  });

  it("sin banco configurado, el campo va nulo y no vacío", async () => {
    const { servicio } = montar(
      { TRANSFERENCIA_IBAN: CUENTA.TRANSFERENCIA_IBAN, TRANSFERENCIA_TITULAR: "X" },
      { pedido: PEDIDO },
    );
    expect((await servicio.instrucciones("ped-1")).banco).toBeNull();
  });

  it("404 si el pedido no existe", async () => {
    const { servicio } = montar(CUENTA, { pedido: null });
    await expect(servicio.instrucciones("fantasma")).rejects.toThrow(NotFoundException);
  });
});

describe("TransferenciaService — confirmar el pago", () => {
  it("confirma y devuelve el estado nuevo", async () => {
    const { servicio, llamadas } = montar(CUENTA, {
      rpc: { confirmado: true, estado: "PROCESANDO", sin_reserva: 0 },
    });

    const r = await servicio.confirmarPago("ped-1", "admin-1");

    expect(r).toEqual({ confirmado: true, estado: "PROCESANDO", sin_reserva: 0 });
    expect(llamadas[0]).toMatchObject({
      fn: "confirmar_pago_transferencia",
      params: { p_pedido_id: "ped-1", p_actor_id: "admin-1" },
    });
  });

  it("confirmar dos veces no es un error, solo no vuelve a actuar", async () => {
    const { servicio } = montar(CUENTA, {
      rpc: { confirmado: false, estado: "PROCESANDO", sin_reserva: 0 },
    });

    expect((await servicio.confirmarPago("ped-1")).confirmado).toBe(false);
  });

  /**
   * El dinero llegó después de vencer el plazo: el stock ya había vuelto a la
   * venta y se ha descontado sin reserva detrás. No es un fallo —el pedido debe
   * salir igual— pero el inventario puede haber quedado por debajo de lo real.
   */
  it("avisa cuando hubo que tocar stock sin reserva", async () => {
    const { servicio } = montar(CUENTA, {
      rpc: { confirmado: true, estado: "PROCESANDO", sin_reserva: 2 },
    });

    expect((await servicio.confirmarPago("ped-1")).sin_reserva).toBe(2);
  });

  it("un pedido de otro método de pago se rechaza", async () => {
    const { servicio } = montar(CUENTA, { error: { code: "P0001", message: "no es transferencia" } });
    await expect(servicio.confirmarPago("ped-1")).rejects.toThrow(BadRequestException);
  });

  it("un pedido inexistente da 404", async () => {
    const { servicio } = montar(CUENTA, { error: { code: "P0002", message: "no existe" } });
    await expect(servicio.confirmarPago("fantasma")).rejects.toThrow(NotFoundException);
  });
});

describe("TransferenciaService — crear el pedido", () => {
  /** La reserva del checkout caducó: es cosa del cliente y puede resolverlo él. */
  it("una reserva caducada se explica en vez de dar un error genérico", async () => {
    const { servicio } = montar(CUENTA, { error: { code: "P0003", message: "caducada" } });

    await expect(
      servicio.crearPedido({ sessionId: "s", claveIdempotencia: "k" }),
    ).rejects.toThrow(/caducado/i);
  });

  it("la clave de idempotencia y el plazo viajan a la RPC", async () => {
    const { servicio, llamadas } = montar({ ...CUENTA, TRANSFERENCIA_DIAS_PLAZO: "4" }, {
      rpc: "ped-nuevo",
      pedido: {
        id: "ped-nuevo",
        numero_pedido: "260802039999",
        total: "5.00",
        pago_vence_el: "2026-08-06T21:59:59Z",
        metodo_pago: "transferencia",
        estado: "PENDIENTE_PAGO",
      },
    });

    await servicio.crearPedido({ sessionId: "s-1", claveIdempotencia: "clave-1" });

    expect(llamadas[0]).toMatchObject({
      fn: "crear_pedido_transferencia",
      params: { p_clave_idempotencia: "clave-1", p_dias_plazo: 4, p_session_id: "s-1" },
    });
  });
});

/**
 * Es el correo más importante de la tienda: el único que hace falta para PODER
 * pagar. Sin él, el cliente tiene un pedido y ningún sitio a donde transferir
 * salvo que conserve la pestaña abierta.
 */
describe("TransferenciaService — el correo con las instrucciones", () => {
  const NUEVO = {
    id: "ped-nuevo",
    numero_pedido: "260802039999",
    total: "5.00",
    pago_vence_el: "2026-08-06T21:59:59Z",
    metodo_pago: "transferencia",
    estado: "PENDIENTE_PAGO",
    email_cliente: "cliente@ejemplo.es",
  };

  const crear = (opciones: Parameters<typeof montar>[1] = {}, dto: { email?: string } = {}) => {
    const armado = montar(CUENTA, { rpc: "ped-nuevo", pedido: NUEVO, ...opciones });
    return {
      ...armado,
      hecho: armado.servicio.crearPedido({
        sessionId: "s-1",
        claveIdempotencia: "clave-1",
        ...dto,
      }),
    };
  };

  // El servicio registra los avisos fallidos; aquí eso es ruido esperado.
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("lleva el IBAN, el titular y el concepto del pedido recién creado", async () => {
    const { correos, hecho } = crear();
    await hecho;
    await dejarSalirElAviso();

    expect(correos).toHaveLength(1);
    expect(correos[0]).toMatchObject({
      email: "cliente@ejemplo.es",
      numeroPedido: "260802039999",
      concepto: "260802039999",
      iban: "ES33 9490 0934 2392 2994 3748",
      titular: "Valentino Jimenez Mendoza",
      importe: 5,
    });
  });

  /**
   * A propósito el del pedido y no el del DTO: quien compra con cuenta puede no
   * mandarlo en el checkout, y el pedido siempre tiene a quién avisar (lo
   * garantiza `pedidos_localizable_check`).
   */
  it("se manda al correo del pedido, no al que venga en el DTO", async () => {
    const { correos, hecho } = crear({}, { email: "tecleado@ejemplo.es" });
    await hecho;
    await dejarSalirElAviso();

    expect(correos[0]).toMatchObject({ email: "cliente@ejemplo.es" });
  });

  it("si el pedido no trae correo, se usa el del DTO antes que no avisar", async () => {
    const { correos, hecho } = crear(
      { pedido: { ...NUEVO, email_cliente: null } },
      { email: "invitado@ejemplo.es" },
    );
    await hecho;
    await dejarSalirElAviso();

    expect(correos[0]).toMatchObject({ email: "invitado@ejemplo.es" });
  });

  it("sin correo por ninguno de los dos lados no se envía nada, y el pedido sale igual", async () => {
    const { correos, hecho } = crear({ pedido: { ...NUEVO, email_cliente: null } });

    await expect(hecho).resolves.toMatchObject({ numero_pedido: "260802039999" });
    await dejarSalirElAviso();
    expect(correos).toEqual([]);
  });

  /**
   * El envío va sin await justamente para esto: el pedido ya existe y retiene
   * stock. Si un fallo de SMTP tumbara la respuesta, el cliente vería un error
   * sobre un pedido que sí se creó, y las instrucciones siguen en «Mis pedidos».
   */
  it("un fallo del envío no se lleva por delante el pedido", async () => {
    const { hecho } = crear({ emailFalla: true });

    await expect(hecho).resolves.toMatchObject({
      numero_pedido: "260802039999",
      iban: "ES33 9490 0934 2392 2994 3748",
    });
    await dejarSalirElAviso();
  });
});

/**
 * La cuenta de cobro se guarda desde TI → Ajustes (migración 046). Nació como
 * variable de entorno y se movió aquí porque un IBAN no es un secreto: se le
 * enseña a cada cliente que compra, y tenerlo en Render obligaba a entrar allí
 * para cambiar de cuenta.
 */
describe("TransferenciaService — la cuenta se edita desde el panel", () => {
  const GUARDADA = {
    transferencia_iban: "ES9121000418450200051332",
    transferencia_titular: "Tienda Valatino SL",
    transferencia_banco: "CaixaBank",
    transferencia_dias_plazo: 5,
    updated_at: "2026-08-02T20:00:00Z",
  };

  it("lo guardado en el panel gana al entorno", async () => {
    const { servicio } = montar(CUENTA, { ajustes: GUARDADA });

    const d = await servicio.disponibilidad();
    expect(d).toEqual({ disponible: true, dias_plazo: 5 });
    expect((await servicio.ajustes()).origen).toBe("panel");
  });

  it("sin nada en el panel se usa el entorno, y se dice de dónde viene", async () => {
    const { servicio } = montar(CUENTA, { ajustes: null });

    expect((await servicio.disponibilidad()).disponible).toBe(true);
    expect((await servicio.ajustes()).origen).toBe("entorno");
  });

  it("sin panel ni entorno, no se ofrece", async () => {
    const { servicio } = montar({}, { ajustes: null });

    expect((await servicio.disponibilidad()).disponible).toBe(false);
    expect((await servicio.ajustes()).origen).toBe("sin_configurar");
  });

  /**
   * Lo que de verdad protege esto: **un IBAN con una errata manda a los
   * clientes a transferir a una cuenta que no existe**, y no se descubre hasta
   * que alguien reclama un pedido que nunca se preparó. Los dos dígitos de
   * control existen para cazarlo.
   */
  it("rechaza un IBAN cuyo dígito de control no cuadra", async () => {
    const { servicio } = montar({}, { ajustes: null });

    await expect(
      // El mismo número de cuenta con el control equivocado (48 en vez de 33).
      servicio.guardarAjustes({ iban: "ES48 9490 0934 2392 2994 3748", titular: "Alguien" }),
    ).rejects.toThrow(/dígito de control/i);
  });

  it("acepta el mismo número con el dígito correcto", async () => {
    const { servicio } = montar({}, { ajustes: GUARDADA });

    await expect(
      servicio.guardarAjustes({ iban: "ES33 9490 0934 2392 2994 3748", titular: "Alguien" }),
    ).resolves.toBeDefined();
  });

  it("un IBAN válido pero sin titular se rechaza", async () => {
    const { servicio } = montar({}, { ajustes: null });

    await expect(
      servicio.guardarAjustes({ iban: "ES9121000418450200051332", titular: "  " }),
    ).rejects.toThrow(/titular/i);
  });

  /** Vaciar los dos campos es la forma de dejar de aceptar transferencias. */
  it("vaciar IBAN y titular apaga el método sin dar error", async () => {
    const { servicio } = montar({}, { ajustes: null });

    await expect(servicio.guardarAjustes({ iban: "", titular: "" })).resolves.toBeDefined();
  });

  it("un IBAN guardado que no valida deja el método apagado", async () => {
    // Pudo entrar antes de existir la validación, o por el respaldo de entorno.
    const { servicio } = montar({}, {
      ajustes: { ...GUARDADA, transferencia_iban: "ES4894900934239229943748" },
    });

    expect((await servicio.disponibilidad()).disponible).toBe(false);
  });
});
