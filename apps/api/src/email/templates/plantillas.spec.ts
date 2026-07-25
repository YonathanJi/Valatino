import { PEDIDO_ESTADOS, type PedidoEstado } from "@valatino/types";
import { renderCambioEstado, COPIAS_ESTADO, type DatosEmailEstado } from "./estado-pedido";
import { renderConfirmacionPedido, type DatosEmailPedido } from "./confirmacion-pedido";

const datosEstado = (
  estado: PedidoEstado,
  extra: Partial<DatosEmailEstado> = {},
): DatosEmailEstado => ({
  pedidoId: "b46b60d3-c18c-4104-b28d-f161e70c7f6e",
  numeroPedido: "260725018055",
  email: "cliente@ejemplo.com",
  nombre: "Ana Pérez García",
  estado,
  items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
  total: 5,
  fecha: "20 de julio de 2026",
  ...extra,
});

const datosPedido = (extra: Partial<DatosEmailPedido> = {}): DatosEmailPedido => ({
  pedidoId: "b46b60d3-c18c-4104-b28d-f161e70c7f6e",
  numeroPedido: "260725018055",
  email: "cliente@ejemplo.com",
  items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
  total: 50,
  metodoPago: "stripe",
  direccionEnvio: null,
  estado: "PROCESANDO",
  fecha: "20 de julio de 2026",
  ...extra,
});

describe("renderCambioEstado", () => {
  it("no genera correo para los estados que avisa otro camino", () => {
    // PENDIENTE_PAGO es el estado inicial (nadie transiciona hacia él) y
    // REEMBOLSADO lo avisa el email de reembolso, que sí dice el importe.
    expect(renderCambioEstado(datosEstado("PENDIENTE_PAGO"))).toBeNull();
    expect(renderCambioEstado(datosEstado("REEMBOLSADO"))).toBeNull();
  });

  it("avisa de los estados de seguimiento del pedido", () => {
    for (const estado of ["PROCESANDO", "ENVIADO", "ENTREGADO", "CANCELADO"] as const) {
      expect(renderCambioEstado(datosEstado(estado))).not.toBeNull();
    }
  });

  it("el asunto y el cuerpo llevan el número de pedido", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO"))!;

    expect(r.asunto).toContain("260725018055");
    expect(r.html).toContain("260725018055");
  });

  it("saluda solo con el nombre de pila", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO"))!;

    expect(r.html).toContain("Hola Ana:");
    expect(r.html).not.toContain("Ana Pérez García");
  });

  it("sin nombre no deja un saludo a medias", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO", { nombre: null }))!;

    expect(r.html).not.toContain("Hola ");
  });

  /** El nombre del producto lo escribe quien carga el catálogo. */
  it("escapa el HTML de los nombres de producto", () => {
    const r = renderCambioEstado(
      datosEstado("ENVIADO", {
        items: [
          { nombre_producto: '<script>alert("x")</script>', cantidad: 1, precio_unitario: 1 },
        ],
      }),
    )!;

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("todo estado con texto definido existe en la máquina de estados", () => {
    for (const estado of Object.keys(COPIAS_ESTADO)) {
      expect(PEDIDO_ESTADOS).toContain(estado as PedidoEstado);
    }
  });
});

describe("renderConfirmacionPedido — reembolsos", () => {
  it("un reembolso parcial dice cuánto se devolvió y que el resto sigue", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ esReembolso: true, importeReembolsado: 10 }),
    );

    expect(html).toContain("REEMBOLSO PARCIAL");
    expect(html).toContain("sigue su curso");
    // 10 € devueltos sobre 50 € de total: deben verse ambas cifras
    expect(html).toMatch(/10,00\s?€/);
    expect(html).toMatch(/50,00\s?€/);
  });

  it("un reembolso total no se anuncia como parcial", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ esReembolso: true, importeReembolsado: 50 }),
    );

    expect(html).toContain("importe completo");
    expect(html).not.toContain("REEMBOLSO PARCIAL");
  });

  it("sin importe explícito se asume el total (compatibilidad con el webhook)", () => {
    const html = renderConfirmacionPedido(datosPedido({ esReembolso: true }));

    expect(html).not.toContain("REEMBOLSO PARCIAL");
  });

  it("la confirmación de compra no menciona reembolsos", () => {
    const html = renderConfirmacionPedido(datosPedido());

    expect(html).toContain("PAGADO");
    expect(html.toLowerCase()).not.toContain("reembols");
  });
});
