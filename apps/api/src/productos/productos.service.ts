import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { Producto, PaginatedResponse } from "@valatino/types";

export interface QueryProductosDto {
  page?: number;
  limit?: number;
  categoria?: string;
  q?: string;
  soloActivos?: boolean;
}

@Injectable()
export class ProductosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findAll(query: QueryProductosDto): Promise<PaginatedResponse<Producto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    let qb = this.supabase
      .from("productos")
      .select("*", { count: "exact" });

    if (query.soloActivos !== false) {
      qb = qb.eq("activo", true);
    }

    if (query.categoria) {
      qb = qb.eq("categoria", query.categoria);
    }

    if (query.q) {
      qb = qb.ilike("nombre", `%${query.q}%`);
    }

    const { data, error, count } = await qb
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudo cargar el catálogo");

    return {
      data: (data as Producto[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("id", id)
      .eq("activo", true)
      .single();

    if (error || !data) throw new NotFoundException(`Producto ${id} no encontrado`);
    return data as Producto;
  }

  async findBySlug(slug: string): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("slug", slug)
      .eq("activo", true)
      .single();

    if (error || !data) throw new NotFoundException(`Producto '${slug}' no encontrado`);
    return data as Producto;
  }

  async create(dto: Partial<Producto>): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .insert(dto)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new BadRequestException("Ya existe un producto con ese slug");
      }
      throw new InternalServerErrorException("No se pudo crear el producto");
    }
    return data as Producto;
  }

  async update(id: string, dto: Partial<Producto>): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Producto ${id} no encontrado`);
    return data as Producto;
  }

  async ajustarStock(id: string, cantidad: number): Promise<{ stock_disponible: number }> {
    const { data, error } = await this.supabase.rpc("ajustar_stock", {
      p_producto_id: id,
      p_cantidad: cantidad,
    });

    if (error) {
      // La RPC lanza excepciones con mensajes claros (producto no existe,
      // stock quedaría negativo, etc.)
      throw new BadRequestException(error.message);
    }
    return { stock_disponible: data as number };
  }
}
