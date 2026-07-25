import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import type { InventarioService } from "../inventario/inventario.service";
import type { EmailService } from "../email/email.service";

/**
 * Cubre la distinción reembolso parcial / total: antes cualquier importe, aunque
 * fuese de 1 € sobre un pedido de 50 €, marcaba el pedido entero como
 * REEMBOLSADO y avisaba al cliente.
 */
function montar(totalPedido: number | null) {
  const llamadas = {
    estados: [] as Array<{ referencia: string; estado: string }>,
    transacciones: [] as Array<{ estado: string; importe: number }>,
    emails: [] as string[],
  };

  const inventario = {
    findPedidoPorReferencia: async (referencia: string) =>
      totalPedido === null
        ? null
        : { id: "pedido-1", estado: "PROCESANDO", total: totalPedido, referencia },
    actualizarEstadoPorReferencia: async (referencia: string, estado: string) => {
      llamadas.estados.push({ referencia, estado });
      return "pedido-1";
    },
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
      items: [{ nombre_producto: "Chocoramo", cantidad: 1, precio_unitario: 2.5 }],
    }),
  } as unknown as InventarioService;

  const email = {
    enviarReembolso: async () => {
      llamadas.emails.push("reembolso");
    },
    enviarConfirmacionPedido: async () => {
      llamadas.emails.push("confirmacion");
    },
  } as unknown as EmailService;

  const servicio = new ConfirmacionPedidoService(inventario, email, {} as never);
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
    expect(llamadas.estados).toEqual([{ referencia: "pi_123", estado: "REEMBOLSADO" }]);
    expect(llamadas.transacciones[0]).toMatchObject({ estado: "reembolsado" });
    expect(llamadas.emails).toEqual(["reembolso"]);
  });

  it("un reembolso parcial se registra pero NO cambia el estado ni envía email", async () => {
    const { servicio, llamadas } = montar(49.99);

    await servicio.procesarReembolso(reembolsoDe(10));

    expect(llamadas.estados).toEqual([]);
    expect(llamadas.transacciones[0]).toMatchObject({
      estado: "reembolsado_parcial",
      importe: 10,
    });
    expect(llamadas.emails).toEqual([]);
  });

  it("un reembolso por encima del total también cuenta como total", async () => {
    const { servicio, llamadas } = montar(20);

    await servicio.procesarReembolso(reembolsoDe(25));

    expect(llamadas.estados[0]).toMatchObject({ estado: "REEMBOLSADO" });
  });

  it("no confunde céntimos por coma flotante (0.1 + 0.2 sobre 0.3)", async () => {
    const { servicio, llamadas } = montar(0.3);

    await servicio.procesarReembolso(reembolsoDe(0.1 + 0.2));

    expect(llamadas.estados[0]).toMatchObject({ estado: "REEMBOLSADO" });
  });

  it("devuelve null si no hay pedido con esa referencia", async () => {
    const { servicio, llamadas } = montar(null);

    await expect(servicio.procesarReembolso(reembolsoDe(10))).resolves.toBeNull();
    expect(llamadas.transacciones).toEqual([]);
  });
});
