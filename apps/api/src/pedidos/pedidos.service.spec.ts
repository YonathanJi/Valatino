import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import {
  transicionesPermitidas,
  PEDIDO_ESTADOS,
  type PedidoEstado,
} from "@valatino/types";

/**
 * Doble mínimo del cliente de Supabase: solo lo que usa updateEstado
 * (select del estado actual + update del nuevo).
 */
function supabaseFalso(estadoActual: PedidoEstado | null) {
  const updates: Array<Record<string, unknown>> = [];

  const cliente = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            estadoActual === null
              ? { data: null, error: { message: "no rows" } }
              : { data: { estado: estadoActual }, error: null },
        }),
      }),
      update: (valores: Record<string, unknown>) => {
        updates.push(valores);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "p1", ...valores }, error: null }),
            }),
          }),
        };
      },
    }),
  };

  return { cliente, updates };
}

function servicioCon(estadoActual: PedidoEstado | null) {
  const { cliente, updates } = supabaseFalso(estadoActual);
  // El servicio solo recibe el cliente inyectado; basta con el doble.
  return { servicio: new PedidosService(cliente as never), updates };
}

describe("máquina de estados del pedido (@valatino/types)", () => {
  it("un estado final no admite ninguna transición", () => {
    expect(transicionesPermitidas("CANCELADO", "admin")).toEqual([]);
    expect(transicionesPermitidas("REEMBOLSADO", "admin")).toEqual([]);
  });

  it("el asesor puede avanzar el envío pero no cancelar ni reembolsar", () => {
    expect(transicionesPermitidas("PROCESANDO", "asesor")).toEqual(["ENVIADO"]);
    expect(transicionesPermitidas("ENVIADO", "asesor")).toEqual(["ENTREGADO"]);
    expect(transicionesPermitidas("ENTREGADO", "asesor")).toEqual([]);

    for (const estado of PEDIDO_ESTADOS) {
      const delAsesor = transicionesPermitidas(estado, "asesor");
      expect(delAsesor).not.toContain("CANCELADO");
      expect(delAsesor).not.toContain("REEMBOLSADO");
    }
  });

  it("el admin sí puede reembolsar desde los estados con pago cobrado", () => {
    expect(transicionesPermitidas("PROCESANDO", "admin")).toContain("REEMBOLSADO");
    expect(transicionesPermitidas("ENVIADO", "admin")).toContain("REEMBOLSADO");
    expect(transicionesPermitidas("ENTREGADO", "admin")).toContain("REEMBOLSADO");
  });

  it("lo que ofrece el asesor es siempre un subconjunto de lo que ofrece el admin", () => {
    for (const estado of PEDIDO_ESTADOS) {
      const admin = transicionesPermitidas(estado, "admin");
      for (const t of transicionesPermitidas(estado, "asesor")) {
        expect(admin).toContain(t);
      }
    }
  });

  it("ninguna transición apunta a un estado inexistente", () => {
    for (const estado of PEDIDO_ESTADOS) {
      for (const destino of transicionesPermitidas(estado, "admin")) {
        expect(PEDIDO_ESTADOS).toContain(destino);
      }
    }
  });
});

describe("PedidosService.updateEstado", () => {
  it("acepta una transición permitida y sella updated_at", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "asesor");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ estado: "ENVIADO" });
    expect(updates[0]!["updated_at"]).toBeDefined();
  });

  it("rechaza que un asesor cancele un pedido y no escribe nada", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "CANCELADO", "asesor")).rejects.toThrow(
      ForbiddenException,
    );
    expect(updates).toHaveLength(0);
  });

  it("permite al admin cancelar el mismo pedido", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "CANCELADO", "admin");

    expect(updates[0]).toMatchObject({ estado: "CANCELADO" });
  });

  it("rechaza saltarse pasos (PROCESANDO → ENTREGADO)", async () => {
    const { servicio } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "ENTREGADO", "admin")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("no reabre un pedido ya reembolsado", async () => {
    const { servicio } = servicioCon("REEMBOLSADO");

    await expect(servicio.updateEstado("p1", "PROCESANDO", "admin")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("404 si el pedido no existe", async () => {
    const { servicio } = servicioCon(null);

    await expect(servicio.updateEstado("desconocido", "ENVIADO", "admin")).rejects.toThrow(
      NotFoundException,
    );
  });
});
