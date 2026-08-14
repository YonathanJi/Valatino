import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { normalizarTelefono } from "@valatino/types";
import { ubicacionParaGuardar } from "../common/datos/ubicacion";
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

/**
 * ⚠️ `ubicacionParaGuardar` vivía AQUÍ, suelta, y por eso los datos fiscales
 * —emisor y receptor de factura— no pasaban por ella: nadie podía importarla.
 * Se movió a `common/datos/ubicacion.ts` el 2026-08-14, después de que la
 * primera factura real saliera con la población «españa». Ver el comentario de
 * ese fichero: la comprobación que lo habría cazado ya existía.
 */

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
        ...ubicacionParaGuardar(dto.codigo_postal, dto.ciudad),
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

    // Ubicación: se resuelve contra la fila actual, no solo contra el DTO.
    // Un PATCH puede traer solo la ciudad o solo el CP, y entonces la coherencia
    // hay que comprobarla con el valor que ya está guardado — el decorador del
    // DTO no puede verlo. Sin esto, cambiar la ciudad a secas se colaba.
    let ubicacion: ReturnType<typeof ubicacionParaGuardar> | undefined;
    if (dto.ciudad !== undefined || dto.codigo_postal !== undefined) {
      const actual = await this.buscar(userId, id);
      ubicacion = ubicacionParaGuardar(
        dto.codigo_postal ?? actual.codigo_postal,
        dto.ciudad ?? actual.ciudad,
      );
    }

    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .update({
        ...(dto.nombre_destinatario !== undefined && {
          nombre_destinatario: dto.nombre_destinatario,
        }),
        ...(dto.linea1 !== undefined && { linea1: dto.linea1 }),
        ...(dto.linea2 !== undefined && { linea2: dto.linea2 }),
        ...ubicacion,
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

  /** La dirección del usuario, o 404. Necesaria para validar updates parciales. */
  private async buscar(
    userId: string,
    id: string,
  ): Promise<{ ciudad: string; codigo_postal: string }> {
    const { data } = await this.supabase
      .from("direcciones_envio")
      .select("ciudad, codigo_postal")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) throw new NotFoundException("Dirección no encontrada");
    return data as { ciudad: string; codigo_postal: string };
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
