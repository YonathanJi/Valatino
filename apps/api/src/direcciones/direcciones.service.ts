import { Inject, Injectable, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { normalizarTelefono } from "@valatino/types";
import type { CreateDireccionDto, UpdateDireccionDto } from "./dto/direccion.dto";

/**
 * Deja el teléfono en 9 dígitos, o NULL si viene vacío.
 *
 * Se normaliza aquí y no en el DTO porque el ValidationPipe global no
 * transforma: si se guardara lo tecleado, la misma persona acabaría con
 * «+34600112233» en una dirección y «600 11 22 33» en otra.
 */
function telefonoParaGuardar(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  return normalizarTelefono(valor) || null;
}

@Injectable()
export class DireccionesService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findByUser(userId: string) {
    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .select("*")
      .eq("user_id", userId)
      .order("es_predeterminada", { ascending: false });

    if (error) throw new InternalServerErrorException("No se pudieron cargar tus direcciones");
    return data;
  }

  async create(userId: string, dto: CreateDireccionDto) {
    if (dto.es_predeterminada) {
      await this.quitarPredeterminada(userId);
    }

    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .insert({
        user_id: userId,
        nombre_destinatario: dto.nombre_destinatario,
        linea1: dto.linea1,
        linea2: dto.linea2 ?? null,
        ciudad: dto.ciudad,
        codigo_postal: dto.codigo_postal,
        provincia: dto.provincia,
        pais: dto.pais ?? "ES",
        telefono: telefonoParaGuardar(dto.telefono),
        es_predeterminada: dto.es_predeterminada ?? false,
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException("No se pudo guardar la dirección");
    return data;
  }

  async update(userId: string, id: string, dto: UpdateDireccionDto) {
    if (dto.es_predeterminada) {
      await this.quitarPredeterminada(userId, id);
    }

    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .update({
        ...(dto.nombre_destinatario !== undefined && {
          nombre_destinatario: dto.nombre_destinatario,
        }),
        ...(dto.linea1 !== undefined && { linea1: dto.linea1 }),
        ...(dto.linea2 !== undefined && { linea2: dto.linea2 }),
        ...(dto.ciudad !== undefined && { ciudad: dto.ciudad }),
        ...(dto.codigo_postal !== undefined && { codigo_postal: dto.codigo_postal }),
        ...(dto.provincia !== undefined && { provincia: dto.provincia }),
        ...(dto.pais !== undefined && { pais: dto.pais }),
        ...(dto.telefono !== undefined && {
          telefono: telefonoParaGuardar(dto.telefono),
        }),
        ...(dto.es_predeterminada !== undefined && {
          es_predeterminada: dto.es_predeterminada,
        }),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException("Dirección no encontrada");
    return data;
  }

  async remove(userId: string, id: string) {
    const { error } = await this.supabase
      .from("direcciones_envio")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new InternalServerErrorException("No se pudo eliminar la dirección");
  }

  /** Solo una dirección predeterminada por usuario (`excluirId` conserva la que se está guardando). */
  private async quitarPredeterminada(userId: string, excluirId?: string): Promise<void> {
    let qb = this.supabase
      .from("direcciones_envio")
      .update({ es_predeterminada: false })
      .eq("user_id", userId);

    if (excluirId) qb = qb.neq("id", excluirId);

    await qb;
  }
}
