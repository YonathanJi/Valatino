import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { CarritoConItems, CarritoItemDetalle } from "@valatino/types";

@Injectable()
export class CarritoService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async getOrCreate(sessionId: string, userId?: string): Promise<string> {
    const query = userId
      ? this.supabase.from("carritos").select("id").eq("user_id", userId).maybeSingle()
      : this.supabase.from("carritos").select("id").eq("session_id", sessionId).is("user_id", null).maybeSingle();

    const { data: existing } = await query;
    if (existing) return (existing as { id: string }).id;

    const { data: created, error } = await this.supabase
      .from("carritos")
      .insert({ session_id: sessionId, user_id: userId ?? null })
      .select("id")
      .single();

    if (error) throw new InternalServerErrorException("No se pudo crear el carrito");
    return (created as { id: string }).id;
  }

  async getCarrito(sessionId: string, userId?: string): Promise<CarritoConItems> {
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { data: items, error } = await this.supabase
      .from("carrito_items")
      .select("id, cantidad, precio_unitario, producto_id")
      .eq("carrito_id", carritoId);

    if (error) throw new InternalServerErrorException("No se pudo cargar el carrito");

    const itemsRaw = items as unknown as Array<{
      id: string;
      cantidad: number;
      precio_unitario: number;
      producto_id: string;
    }>;

    if (!itemsRaw || itemsRaw.length === 0) {
      return { id: carritoId, items: [], total: 0 };
    }

    const productoIds = itemsRaw.map((i) => i.producto_id);

    const { data: productos } = await this.supabase
      .from("productos")
      .select("id, nombre, imagenes")
      .in("id", productoIds);

    const prodMap = new Map<string, { nombre: string; imagenes: string[] }>();
    for (const p of (productos as Array<{ id: string; nombre: string; imagenes: string[] }>) ?? []) {
      prodMap.set(p.id, { nombre: p.nombre, imagenes: p.imagenes });
    }

    const itemsDetalle: CarritoItemDetalle[] = [];
    for (const item of itemsRaw) {
      const prod = prodMap.get(item.producto_id);
      if (!prod) continue;

      itemsDetalle.push({
        id: item.id,
        productoId: item.producto_id,
        nombre: prod.nombre,
        imagenes: prod.imagenes,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precio_unitario),
        subtotal: Number(item.precio_unitario) * item.cantidad,
      });
    }

    const total = itemsDetalle.reduce((acc, i) => acc + i.subtotal, 0);
    return { id: carritoId, items: itemsDetalle, total };
  }

  async addItem(
    sessionId: string,
    productoId: string,
    cantidad: number,
    userId?: string,
  ): Promise<CarritoConItems> {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException("La cantidad debe ser un entero mayor que cero");
    }

    // Verificar stock
    const { data: producto, error: stockError } = await this.supabase
      .from("productos")
      .select("precio, stock_disponible")
      .eq("id", productoId)
      .eq("activo", true)
      .single();

    if (stockError || !producto) throw new NotFoundException("Producto no encontrado");

    const p = producto as { precio: number; stock_disponible: number };
    if (p.stock_disponible < cantidad) {
      throw new ConflictException("Stock insuficiente para la cantidad solicitada");
    }

    const carritoId = await this.getOrCreate(sessionId, userId);

    // Upsert: incrementar cantidad si ya existe
    const { data: existing } = await this.supabase
      .from("carrito_items")
      .select("id, cantidad")
      .eq("carrito_id", carritoId)
      .eq("producto_id", productoId)
      .maybeSingle();

    if (existing) {
      const nuevaCantidad = (existing as { id: string; cantidad: number }).cantidad + cantidad;
      if (nuevaCantidad > p.stock_disponible) {
        throw new ConflictException("Stock insuficiente");
      }
      const { error: updateError } = await this.supabase
        .from("carrito_items")
        .update({ cantidad: nuevaCantidad })
        .eq("id", (existing as { id: string }).id)
        .eq("carrito_id", carritoId);

      if (updateError) throw new InternalServerErrorException("No se pudo actualizar el carrito");
    } else {
      const { error: insertError } = await this.supabase.from("carrito_items").insert({
        carrito_id: carritoId,
        producto_id: productoId,
        cantidad,
        precio_unitario: p.precio,
      });

      if (insertError) throw new InternalServerErrorException("No se pudo añadir el producto al carrito");
    }

    return this.getCarrito(sessionId, userId);
  }

  async updateItem(
    sessionId: string,
    itemId: string,
    cantidad: number,
    userId?: string,
  ): Promise<CarritoConItems> {
    if (cantidad <= 0) {
      return this.removeItem(sessionId, itemId, userId);
    }

    // Verificar que el ítem pertenece al carrito del solicitante (anti-IDOR)
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { data: item } = await this.supabase
      .from("carrito_items")
      .select("producto_id")
      .eq("id", itemId)
      .eq("carrito_id", carritoId)
      .maybeSingle();

    if (!item) throw new NotFoundException("Ítem no encontrado en tu carrito");

    const { data: producto } = await this.supabase
      .from("productos")
      .select("stock_disponible")
      .eq("id", (item as { producto_id: string }).producto_id)
      .single();

    if (producto && (producto as { stock_disponible: number }).stock_disponible < cantidad) {
      throw new ConflictException("Stock insuficiente para la cantidad solicitada");
    }

    const { error: updateError } = await this.supabase
      .from("carrito_items")
      .update({ cantidad })
      .eq("id", itemId)
      .eq("carrito_id", carritoId);

    if (updateError) throw new InternalServerErrorException("No se pudo actualizar el ítem");

    return this.getCarrito(sessionId, userId);
  }

  async removeItem(
    sessionId: string,
    itemId: string,
    userId?: string,
  ): Promise<CarritoConItems> {
    // Acotar el borrado al carrito del solicitante (anti-IDOR)
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { error } = await this.supabase
      .from("carrito_items")
      .delete()
      .eq("id", itemId)
      .eq("carrito_id", carritoId);

    if (error) throw new InternalServerErrorException("No se pudo eliminar el ítem");

    return this.getCarrito(sessionId, userId);
  }

  async fusionarCarrito(sessionId: string, userId: string): Promise<void> {
    // Buscar carrito anónimo
    const { data: carritoAnonimo } = await this.supabase
      .from("carritos")
      .select("id")
      .eq("session_id", sessionId)
      .is("user_id", null)
      .maybeSingle();

    if (!carritoAnonimo) return;

    const carritoAnonimoId = (carritoAnonimo as { id: string }).id;

    // Obtener o crear carrito autenticado
    const carritoAutenticadoId = await this.getOrCreate(sessionId, userId);

    if (carritoAnonimoId === carritoAutenticadoId) return;

    // Migrar ítems del carrito anónimo al autenticado
    const { data: itemsAnonimos } = await this.supabase
      .from("carrito_items")
      .select("*")
      .eq("carrito_id", carritoAnonimoId);

    for (const item of (itemsAnonimos as Array<{
      producto_id: string;
      cantidad: number;
      precio_unitario: number;
    }>) ?? []) {
      const { data: existing } = await this.supabase
        .from("carrito_items")
        .select("id, cantidad")
        .eq("carrito_id", carritoAutenticadoId)
        .eq("producto_id", item.producto_id)
        .maybeSingle();

      if (existing) {
        await this.supabase
          .from("carrito_items")
          .update({ cantidad: (existing as { cantidad: number }).cantidad + item.cantidad })
          .eq("id", (existing as { id: string }).id);
      } else {
        await this.supabase.from("carrito_items").insert({
          carrito_id: carritoAutenticadoId,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        });
      }
    }

    // Eliminar carrito anónimo
    await this.supabase.from("carritos").delete().eq("id", carritoAnonimoId);

    // Vincular el nuevo session_id al carrito autenticado
    await this.supabase
      .from("carritos")
      .update({ user_id: userId })
      .eq("id", carritoAutenticadoId);
  }
}
