import { ConflictException } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";

function servicioCon(respuesta: { data?: unknown; error?: { code?: string; message: string } }) {
  const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    },
  };

  return { servicio: new CheckoutService(supabase as never), llamadas };
}

describe("CheckoutService.reservar", () => {
  it("delega en la RPC transaccional reservar_carrito", async () => {
    const { servicio, llamadas } = servicioCon({
      data: { ok: true, reservas: [], expiresAt: "2026-07-25T10:15:00.000Z" },
    });

    await servicio.reservar("sesion-1", "usuario-1");

    expect(llamadas).toEqual([
      { fn: "reservar_carrito", args: { p_session_id: "sesion-1", p_user_id: "usuario-1" } },
    ]);
  });

  it("pasa p_user_id null para un invitado", async () => {
    const { servicio, llamadas } = servicioCon({
      data: { ok: true, reservas: [], expiresAt: "2026-07-25T10:15:00.000Z" },
    });

    await servicio.reservar("sesion-1");

    expect(llamadas[0]!.args["p_user_id"]).toBeNull();
  });

  it("devuelve las reservas y su caducidad", async () => {
    const expiresAt = "2026-07-25T10:15:00.000Z";
    const { servicio } = servicioCon({
      data: {
        ok: true,
        reservas: [{ productoId: "prod-1", cantidad: 2, expiresAt }],
        expiresAt,
      },
    });

    await expect(servicio.reservar("sesion-1")).resolves.toEqual({
      reservas: [{ productoId: "prod-1", cantidad: 2, expiresAt }],
      expiresAt,
    });
  });

  it("traduce la falta de stock a 409 con la lista de productos", async () => {
    const { servicio } = servicioCon({ data: { ok: false, sin_stock: ["prod-1", "prod-2"] } });

    await expect(servicio.reservar("sesion-1")).rejects.toMatchObject({
      response: {
        message: "Stock insuficiente para uno o más productos",
        productos_sin_stock: ["prod-1", "prod-2"],
      },
    });
  });

  it("propaga el mensaje de la RPC cuando el carrito está vacío (P0003)", async () => {
    const { servicio } = servicioCon({
      error: { code: "P0003", message: "El carrito está vacío" },
    });

    await expect(servicio.reservar("sesion-1")).rejects.toThrow("El carrito está vacío");
  });

  it("propaga el mensaje de la RPC cuando no hay carrito (P0002)", async () => {
    const { servicio } = servicioCon({
      error: { code: "P0002", message: "Carrito no encontrado" },
    });

    await expect(servicio.reservar("sesion-1")).rejects.toThrow("Carrito no encontrado");
  });

  it("no filtra detalles internos ante un error inesperado de BD", async () => {
    const { servicio } = servicioCon({
      error: { code: "42P01", message: 'relation "stock_reservas" does not exist' },
    });

    const fallo = servicio.reservar("sesion-1");
    await expect(fallo).rejects.toThrow(ConflictException);
    await expect(fallo).rejects.toThrow("No se pudo reservar el stock del carrito");
  });
});
