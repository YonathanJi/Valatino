import { Injectable, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "@nestjs/config";
import type { CreateDireccionDto } from "./dto/direccion.dto";

@Injectable()
export class DireccionesService {
  private readonly supabase: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.supabase = createClient(
      config.getOrThrow("SUPABASE_URL"),
      config.getOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }

  async findByUser(userId: string) {
    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .select("*")
      .eq("user_id", userId)
      .order("es_predeterminada", { ascending: false });

    if (error) throw new InternalServerErrorException("Error al gestionar la dirección");
    return data;
  }

  async create(userId: string, dto: CreateDireccionDto) {
    if (dto.esPredeterminada) {
      await this.supabase
        .from("direcciones_envio")
        .update({ es_predeterminada: false })
        .eq("user_id", userId);
    }

    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .insert({
        user_id: userId,
        nombre_destinatario: dto.nombreDestinatario,
        linea1: dto.linea1,
        linea2: dto.linea2 ?? null,
        ciudad: dto.ciudad,
        codigo_postal: dto.codigoPostal,
        provincia: dto.provincia,
        pais: dto.pais ?? "ES",
        es_predeterminada: dto.esPredeterminada ?? false,
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException("Error al gestionar la dirección");
    return data;
  }

  async update(userId: string, id: string, dto: Partial<CreateDireccionDto>) {
    if (dto.esPredeterminada) {
      await this.supabase
        .from("direcciones_envio")
        .update({ es_predeterminada: false })
        .eq("user_id", userId)
        .neq("id", id);
    }

    const { data, error } = await this.supabase
      .from("direcciones_envio")
      .update({
        ...(dto.nombreDestinatario && { nombre_destinatario: dto.nombreDestinatario }),
        ...(dto.linea1 && { linea1: dto.linea1 }),
        ...(dto.linea2 !== undefined && { linea2: dto.linea2 }),
        ...(dto.ciudad && { ciudad: dto.ciudad }),
        ...(dto.codigoPostal && { codigo_postal: dto.codigoPostal }),
        ...(dto.provincia && { provincia: dto.provincia }),
        ...(dto.pais && { pais: dto.pais }),
        ...(dto.esPredeterminada !== undefined && { es_predeterminada: dto.esPredeterminada }),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException("DirecciÃ³n no encontrada");
    return data;
  }

  async remove(userId: string, id: string) {
    const { error } = await this.supabase
      .from("direcciones_envio")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw new InternalServerErrorException("Error al gestionar la dirección");
  }
}
