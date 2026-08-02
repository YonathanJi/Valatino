import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import type { InventarioService } from "../inventario/inventario.service";
import type { EmailService } from "../email/email.service";
import type { ReembolsosService } from "./reembolsos.service";

/**
 * Cubre la distinción reembolso parcial / total: antes cualquier importe, aunque
 * fuese de 1 € sobre un pedido de 50 €, marcaba el pedido entero como
 * REEMBOLSADO y avisaba al cliente.
 *
 * `yaReembolsado` simula lo que la API ya sabía devuelto antes de llegar el
 * webhook. Sirve para distinguir un reembolso nuevo (hecho en el panel de
 * Stripe) del eco del que acabamos de lanzar nosotros desde el backoffice.
 */
function montar(totalPedido: number | null, yaReembolsado = 0) {
  const llamadas = {
    reembolsosTotales: [] as string[],
    transacciones: [] as Array<{ estado: string; importe: number }>,
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
    ) => {
      llamadas.transacciones.push({ estado, importe });
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
    totalReembolsado: async () => yaReembolsado,
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
   * Stripe notifica charge.refunded también cuando la devolución la pedimos
   * nosotros, y ese camino ya envió el correo. Sin este corte el cliente
   * recibiría dos avisos por la misma devolución.
   */
  it("no reenvía el aviso si el importe ya se conocía (eco del reembolso del panel)", async () => {
    const { servicio, llamadas } = montar(49.99, 10);

    await servicio.procesarReembolso(reembolsoDe(10));

    expect(llamadas.emails).toEqual([]);
    // La transacción sí se registra: es la traza contable del evento de Stripe
    expect(llamadas.transacciones).toHaveLength(1);
  });

  it("sí avisa cuando el acumulado sube (segunda devolución hecha en Stripe)", async () => {
    const { servicio, llamadas } = montar(49.99, 10);

    await servicio.procesarReembolso(reembolsoDe(20));

    expect(llamadas.emails).toEqual([{ tipo: "reembolso", importe: 20 }]);
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
