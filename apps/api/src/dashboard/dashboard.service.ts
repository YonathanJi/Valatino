import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type {
  DashboardGerencial,
  DashboardEstadoCount,
  DashboardStockBajo,
  DashboardTopProducto,
  DashboardVentaDia,
  PedidoEstado,
} from "@valatino/types";

/** Estados que cuentan como venta cobrada */
const ESTADOS_PAGADOS: PedidoEstado[] = ["PROCESANDO", "ENVIADO", "ENTREGADO"];

const TODOS_LOS_ESTADOS: PedidoEstado[] = [
  "PENDIENTE_PAGO",
  "PROCESANDO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
  "REEMBOLSADO",
];

const UMBRAL_STOCK_BAJO = 5;
const DIAS_VENTANA = 30;
const TOP_PRODUCTOS = 5;

@Injectable()
export class DashboardService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async getDashboard(): Promise<DashboardGerencial> {
    const desde = new Date();
    desde.setUTCDate(desde.getUTCDate() - (DIAS_VENTANA - 1));
    desde.setUTCHours(0, 0, 0, 0);

    const [pedidos30d, pedidosPorEstado, clientesTotal, stockBajo] = await Promise.all([
      this.getPedidosPagados(desde),
      this.getPedidosPorEstado(),
      this.getClientesTotal(),
      this.getStockBajo(),
    ]);

    const topProductos = await this.getTopProductos(pedidos30d.map((p) => p.id));

    const ingresos30d = pedidos30d.reduce((acc, p) => acc + p.total, 0);

    return {
      ingresos30d,
      pedidos30d: pedidos30d.length,
      ticketMedio30d: pedidos30d.length > 0 ? ingresos30d / pedidos30d.length : 0,
      clientesTotal,
      ventasPorDia: this.agruparPorDia(pedidos30d, desde),
      topProductos,
      pedidosPorEstado,
      stockBajo,
    };
  }

  private async getPedidosPagados(
    desde: Date,
  ): Promise<Array<{ id: string; total: number; created_at: string }>> {
    const { data, error } = await this.supabase
      .from("pedidos")
      .select("id, total, created_at")
      .in("estado", ESTADOS_PAGADOS)
      .gte("created_at", desde.toISOString());

    if (error) throw new InternalServerErrorException("No se pudieron cargar las ventas");

    return ((data as Array<{ id: string; total: number; created_at: string }>) ?? []).map(
      (p) => ({ ...p, total: Number(p.total) }),
    );
  }

  private agruparPorDia(
    pedidos: Array<{ total: number; created_at: string }>,
    desde: Date,
  ): DashboardVentaDia[] {
    const porDia = new Map<string, { ingresos: number; pedidos: number }>();

    for (let i = 0; i < DIAS_VENTANA; i++) {
      const d = new Date(desde);
      d.setUTCDate(d.getUTCDate() + i);
      porDia.set(d.toISOString().slice(0, 10), { ingresos: 0, pedidos: 0 });
    }

    for (const p of pedidos) {
      const fecha = p.created_at.slice(0, 10);
      const dia = porDia.get(fecha);
      if (dia) {
        dia.ingresos += p.total;
        dia.pedidos += 1;
      }
    }

    return [...porDia.entries()].map(([fecha, v]) => ({ fecha, ...v }));
  }

  private async getTopProductos(pedidoIds: string[]): Promise<DashboardTopProducto[]> {
    if (pedidoIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("pedido_items")
      .select("nombre_producto, cantidad, precio_unitario")
      .in("pedido_id", pedidoIds);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los productos vendidos");

    const porProducto = new Map<string, { unidades: number; ingresos: number }>();
    for (const item of (data as Array<{
      nombre_producto: string;
      cantidad: number;
      precio_unitario: number;
    }>) ?? []) {
      const acc = porProducto.get(item.nombre_producto) ?? { unidades: 0, ingresos: 0 };
      acc.unidades += item.cantidad;
      acc.ingresos += item.cantidad * Number(item.precio_unitario);
      porProducto.set(item.nombre_producto, acc);
    }

    return [...porProducto.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, TOP_PRODUCTOS);
  }

  private async getPedidosPorEstado(): Promise<DashboardEstadoCount[]> {
    const counts = await Promise.all(
      TODOS_LOS_ESTADOS.map(async (estado) => {
        const { count, error } = await this.supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("estado", estado);

        if (error) throw new InternalServerErrorException("No se pudieron contar los pedidos");
        return { estado, cantidad: count ?? 0 };
      }),
    );

    return counts;
  }

  private async getClientesTotal(): Promise<number> {
    const { count, error } = await this.supabase
      .from("user_roles")
      .select("user_id, roles!inner(nombre)", { count: "exact", head: true })
      .eq("roles.nombre", "cliente");

    if (error) throw new InternalServerErrorException("No se pudieron contar los clientes");
    return count ?? 0;
  }

  private async getStockBajo(): Promise<DashboardStockBajo[]> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("id, nombre, stock_disponible, stock_reservado")
      .eq("activo", true)
      .lte("stock_disponible", UMBRAL_STOCK_BAJO)
      .order("stock_disponible", { ascending: true });

    if (error) throw new InternalServerErrorException("No se pudo cargar el stock bajo");
    return (data as DashboardStockBajo[]) ?? [];
  }
}
