import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import type { InventarioService } from "../inventario/inventario.service";
import type { EmailService } from "../email/email.service";
import type { ReembolsosService } from "./reembolsos.service";

/**
 * Cubre la distinción reembolso parcial / total: antes cualquier importe, aunque
 * fuese de 1 € sobre un pedido de 50 €, marcaba el pedido entero como
 * REEMBOLSADO y avisaba al cliente.
 *
 * ⚠️⚠️ Y CUBRE EL CAMBIO DEL 2026-08-26: quién avisa al cliente ya NO se decide
 * leyendo cuánto se sabía devuelto, se decide al ESCRIBIR el apunte.
 *
 * `apunteYaCogido` simula que el otro camino —el panel— ya insertó la transacción
 * de este refund, así que la unicidad de `evento_id` rechaza esta y
 * `registrarTransaccion` devuelve `false`. Antes esto se simulaba con un
 * `yaReembolsado` que el servicio consultaba **antes** de actuar, y esa lectura era
 * la carrera: el 25/08 el webhook leyó 0 mientras el panel ya había apuntado, y el
 * cliente recibió dos correos idénticos de «Devolución de 3,40 €» con 48 ms de
 * diferencia.
 */
function montar(totalPedido: number | null, { apunteYaCogido = false } = {}) {
  const llamadas = {
    reembolsosTotales: [] as string[],
    transacciones: [] as Array<{
      estado: string;
      importe: number;
      /** `undefined` = no se anotó nada en la línea de tiempo. */
      historial?: { tipo: string; origen?: string; importe?: number };
    }>,
    emails: [] as Array<{ tipo: string; importe?: number }>,
  };

  const inventario = {
    findPedidoPorReferencia: async (referencia: string) =>
      totalPedido === null
        ? null
        : { id: "pedido-1", estado: "PROCESANDO", total: totalPedido, referencia },
    registrarTransaccion: async (
      _pedidoId: string,
      _proveedor: string,
      _eventoId: string,
      _tipoEvento: string,
      estado: string,
      importe: number,
      _payload?: object,
      historial?: { tipo: string; origen?: string; importe?: number },
    ) => {
      llamadas.transacciones.push({ estado, importe, historial });
      // `false` = la llave de este refund ya estaba cogida (23505). Es lo que en la
      // función de verdad hace que no se escriba nada en la línea de tiempo.
      return !apunteYaCogido;
    },
    getPedidoConItems: async () => ({
      id: "pedido-1",
      numero_pedido: "260725011234",
      estado: "REEMBOLSADO",
      total: totalPedido ?? 0,
      metodo_pago: "stripe" as const,
      email_cliente: "cliente@ejemplo.com",
      envio_nombre: "Ana",
      envio_linea1: "Calle Mayor 3",
      envio_linea2: null,
      envio_ciudad: "Madrid",
      envio_codigo_postal: "28001",
      envio_provincia: "Madrid",
      envio_pais: "ES",
      created_at: new Date("2026-07-01").toISOString(),
      items: [{ nombre_producto: "Nucita", cantidad: 1, precio_unitario: 2.5 }],
    }),
  } as unknown as InventarioService;

  const email = {
    enviarReembolso: async (datos: { importeReembolsado?: number }) => {
      llamadas.emails.push({ tipo: "reembolso", importe: datos.importeReembolsado });
    },
    enviarConfirmacionPedido: async () => {
      llamadas.emails.push({ tipo: "confirmacion" });
    },
  } as unknown as EmailService;

  const reembolsos = {
    // `totalReembolsado` ya no se dobla: el servicio dejó de consultarlo cuando la
    // decisión de avisar pasó de leerse a escribirse. Si alguien lo vuelve a llamar
    // desde aquí, este mock ausente lo hará evidente en vez de disimularlo.
    marcarReembolsadoYReponerStock: async (pedidoId: string) => {
      llamadas.reembolsosTotales.push(pedidoId);
      return true;
    },
  } as unknown as ReembolsosService;

  const servicio = new ConfirmacionPedidoService(
    inventario,
    email,
    {} as never,
    reembolsos,
    { registrar: async () => undefined } as never,
  );
  return { servicio, llamadas };
}

const reembolsoDe = (importe: number) => ({
  proveedor: "stripe" as const,
  eventoId: "evt_1",
  tipoEvento: "charge.refunded",
  referenciaPago: "pi_123",
  importe,
  payloadRaw: {},
});

describe("ConfirmacionPedidoService.procesarReembolso", () => {
  it("un reembolso por el importe completo marca el pedido REEMBOLSADO y avisa al cliente", async () => {
    const { servicio, llamadas } = montar(49.99);

    const pedidoId = await servicio.procesarReembolso(reembolsoDe(49.99));

    expect(pedidoId).toBe("pedido-1");
    expect(llamadas.reembolsosTotales).toEqual(["pedido-1"]);
    expect(llamadas.transacciones[0]).toMatchObject({ estado: "reembolsado" });
    expect(llamadas.emails).toEqual([{ tipo: "reembolso", importe: 49.99 }]);
  });

  it("un reembolso parcial no cambia el estado, pero sí avisa con el importe", async () => {
    const { servicio, llamadas } = montar(49.99);

    await servicio.procesarReembolso(reembolsoDe(10));

    expect(llamadas.reembolsosTotales).toEqual([]);
    expect(llamadas.transacciones[0]).toMatchObject({
      estado: "reembolsado_parcial",
      importe: 10,
    });
    // El cliente tiene que saber cuánto le han devuelto y que el resto sigue
    expect(llamadas.emails).toEqual([{ tipo: "reembolso", importe: 10 }]);
  });

  /**
   * ⭐⭐ EL ECO DEL PANEL: el arreglo del correo duplicado del 2026-08-25.
   *
   * Stripe manda `charge.refunded` también cuando la devolución la pedimos nosotros,
   * y ese camino ya avisó al cliente. Lo que decide que este se calle es que la llave
   * del refund ya está cogida — no una comparación de importes.
   */
  it("si el panel ya cogió el apunte, no se reenvía el aviso", async () => {
    const { servicio, llamadas } = montar(49.99, { apunteYaCogido: true });

    await servicio.procesarReembolso(reembolsoDe(10));

    expect(llamadas.emails).toEqual([]);
  });

  /**
   * ⚠️⚠️ Y EL HISTORIAL SE PASA IGUAL, que es el cambio de contrato y hay que fijarlo.
   *
   * Antes este servicio decidía si anotar (`esNuevo ? {...} : undefined`) y por eso
   * tenía que leer la base primero. Ahora lo pasa SIEMPRE y quien decide es
   * `registrarTransaccion` al insertar: si pierde la llave, no escribe nada en la
   * línea de tiempo. La decisión se movió de «leer y luego actuar» a «actuar y que la
   * base diga», que es lo único sin ventana.
   *
   * Que no se dupliquen las líneas de la ficha lo prueba el spec de `InventarioService`,
   * que es donde vive ese `return false`.
   */
  it("pasa el historial aunque pierda la llave: decidir no es cosa de este servicio", async () => {
    const { servicio, llamadas } = montar(49.99, { apunteYaCogido: true });

    await servicio.procesarReembolso(reembolsoDe(10));

    expect(llamadas.transacciones).toHaveLength(1);
    expect(llamadas.transacciones[0]!.historial).toMatchObject({
      tipo: "reembolso",
      origen: "webhook",
    });
  });

  /**
   * ⭐ La devolución hecha en el panel de STRIPE: nadie cogió la llave, así que este
   * camino es el único que la cuenta y sí avisa. Es la red de seguridad, y es lo que
   * se habría perdido si el corte se hubiera hecho mirando la metadata del refund
   * («esto lo lanzamos nosotros») en vez de la llave: el mismo corte habría callado
   * al webhook cuando el apunte del backoffice falla, que es justo cuando hace falta.
   */
  it("una devolución hecha en Stripe sí avisa, y se anota con el acumulado", async () => {
    const { servicio, llamadas } = montar(49.99);

    await servicio.procesarReembolso(reembolsoDe(20));

    expect(llamadas.emails).toEqual([{ tipo: "reembolso", importe: 20 }]);
    expect(llamadas.transacciones[0]).toMatchObject({
      importe: 20,
      /**
       * ⚠️ EL ACUMULADO, y antes era el incremento (20 − 10 = 10). Cambió a
       * propósito: el incremento se calculaba restando lo que decía aquella lectura,
       * y esa lectura ya no existe. Si este apunte llega a escribirse es porque nadie
       * más contó esta devolución, así que el acumulado del cargo ES lo devuelto que
       * falta por contar. Cuando gana el panel, su propio evento sí dice el
       * incremento — ver `ReembolsosService`.
       */
      historial: { tipo: "reembolso", origen: "webhook", importe: 20 },
    });
  });

  it("un reembolso por encima del total también cuenta como total", async () => {
    const { servicio, llamadas } = montar(20);

    await servicio.procesarReembolso(reembolsoDe(25));

    expect(llamadas.reembolsosTotales).toEqual(["pedido-1"]);
  });

  it("no confunde céntimos por coma flotante (0.1 + 0.2 sobre 0.3)", async () => {
    const { servicio, llamadas } = montar(0.3);

    await servicio.procesarReembolso(reembolsoDe(0.1 + 0.2));

    expect(llamadas.reembolsosTotales).toEqual(["pedido-1"]);
  });

  it("devuelve null si no hay pedido con esa referencia", async () => {
    const { servicio, llamadas } = montar(null);

    await expect(servicio.procesarReembolso(reembolsoDe(10))).resolves.toBeNull();
    expect(llamadas.transacciones).toEqual([]);
  });
});
