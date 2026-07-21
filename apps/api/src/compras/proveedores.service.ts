import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { Proveedor } from "@valatino/types";
import { CrearProveedorDto, UpdateProveedorDto, normalizarCif } from "./dto/proveedor.dto";

@Injectable()
export class ProveedoresService {
  private readonly logger = new Logger(ProveedoresService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findAll(): Promise<Proveedor[]> {
    const { data, error } = await this.supabase
      .from("proveedores")
      .select("*")
      .order("nombre", { ascending: true });

    if (error) {
      this.logger.error(`Error al listar proveedores: ${error.message}`);
      throw new UnprocessableEntityException("Error al listar los proveedores");
    }
    return (data as Proveedor[]) ?? [];
  }

  /** Lookup por CIF (para autocompletar la compra) */
  async findByCif(cif: string): Promise<Proveedor> {
    const { data } = await this.supabase
      .from("proveedores")
      .select("*")
      .eq("cif", normalizarCif(cif))
      .maybeSingle();

    if (!data) throw new NotFoundException("No hay ningún proveedor con ese CIF");
    return data as Proveedor;
  }

  async create(dto: CrearProveedorDto): Promise<Proveedor> {
    const { data, error } = await this.supabase
      .from("proveedores")
      .insert({
        cif: normalizarCif(dto.cif),
        nombre: dto.nombre.trim(),
        telefono: dto.telefono?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        direccion: dto.direccion?.trim() || null,
        notas: dto.notas?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new BadRequestException("Ya existe un proveedor con ese CIF");
      }
      this.logger.error(`Error al crear proveedor: ${error.message}`);
      throw new UnprocessableEntityException("No se pudo crear el proveedor");
    }
    return data as Proveedor;
  }

  async update(id: string, dto: UpdateProveedorDto): Promise<Proveedor> {
    const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.cif !== undefined) cambios.cif = normalizarCif(dto.cif);
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    if (dto.telefono !== undefined) cambios.telefono = dto.telefono.trim() || null;
    if (dto.email !== undefined) cambios.email = dto.email.trim().toLowerCase() || null;
    if (dto.direccion !== undefined) cambios.direccion = dto.direccion.trim() || null;
    if (dto.notas !== undefined) cambios.notas = dto.notas.trim() || null;

    const { data, error } = await this.supabase
      .from("proveedores")
      .update(cambios)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        throw new BadRequestException("Ya existe un proveedor con ese CIF");
      }
      this.logger.error(`Error al actualizar proveedor ${id}: ${error.message}`);
      throw new UnprocessableEntityException("No se pudo actualizar el proveedor");
    }
    if (!data) throw new NotFoundException("Proveedor no encontrado");
    return data as Proveedor;
  }

  /** Borrado físico solo si no tiene compras (la FK lo impide → 409) */
  async remove(id: string): Promise<void> {
    const { error, count } = await this.supabase
      .from("proveedores")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      if (error.code === "23503") {
        throw new ConflictException(
          "No se puede eliminar: el proveedor tiene compras registradas (el histórico no se rompe).",
        );
      }
      this.logger.error(`Error al eliminar proveedor ${id}: ${error.message}`);
      throw new UnprocessableEntityException("No se pudo eliminar el proveedor");
    }
    if (!count) throw new NotFoundException("Proveedor no encontrado");
  }
}
