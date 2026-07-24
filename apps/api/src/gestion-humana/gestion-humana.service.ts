import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { Cargo, Empleado, EmpleadoHistorialMensual } from "@valatino/types";
import type { CrearEmpleadoDto } from "./dto/crear-empleado.dto";
import type { ActualizarEmpleadoDto } from "./dto/actualizar-empleado.dto";

interface EmpleadoRow extends Record<string, unknown> {
  cargos: { codigo: string; nombre: string } | null;
}

@Injectable()
export class GestionHumanaService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  private mapEmpleado(row: EmpleadoRow): Empleado {
    const { cargos, ...rest } = row;
    return {
      ...(rest as unknown as Empleado),
      cargo_codigo: cargos?.codigo,
      cargo_nombre: cargos?.nombre,
    };
  }

  async listarCargos(): Promise<Cargo[]> {
    const { data, error } = await this.supabase
      .from("cargos")
      .select("*")
      .eq("activo", true)
      .order("codigo");
    if (error) throw new InternalServerErrorException("No se pudieron cargar los cargos");
    return (data ?? []) as Cargo[];
  }

  async listarEmpleados(): Promise<Empleado[]> {
    const { data, error } = await this.supabase
      .from("empleados")
      .select("*, cargos(codigo, nombre)")
      .order("nombre_completo");
    if (error) throw new InternalServerErrorException("No se pudieron cargar los empleados");
    return ((data ?? []) as EmpleadoRow[]).map((r) => this.mapEmpleado(r));
  }

  async obtenerEmpleado(
    id: string,
  ): Promise<{ empleado: Empleado; historial: EmpleadoHistorialMensual[] }> {
    const { data, error } = await this.supabase
      .from("empleados")
      .select("*, cargos(codigo, nombre)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new InternalServerErrorException("No se pudo cargar el empleado");
    if (!data) throw new NotFoundException("Empleado no encontrado");

    const { data: hist } = await this.supabase
      .from("empleado_historial_mensual")
      .select("*")
      .eq("empleado_id", id)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false });

    return {
      empleado: this.mapEmpleado(data as EmpleadoRow),
      historial: (hist ?? []) as EmpleadoHistorialMensual[],
    };
  }

  /** Elimina la ficha del empleado (y su histórico en cascada). Bloqueado si aún
   *  tiene cuenta de acceso: TI debe eliminarla primero (separación por capas). */
  async eliminarEmpleado(id: string): Promise<{ message: string }> {
    const { data, error } = await this.supabase
      .from("empleados")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new InternalServerErrorException("No se pudo comprobar el empleado");
    if (!data) throw new NotFoundException("Empleado no encontrado");
    if ((data as { user_id: string | null }).user_id) {
      throw new ConflictException(
        "El empleado tiene una cuenta de acceso. Pide a TI que la elimine antes de borrar la ficha.",
      );
    }

    const { error: delError } = await this.supabase.from("empleados").delete().eq("id", id);
    if (delError) throw new InternalServerErrorException("No se pudo eliminar el empleado");
    return { message: "Empleado eliminado" };
  }

  async crear(dto: CrearEmpleadoDto): Promise<Empleado> {
    const { data, error } = await this.supabase
      .from("empleados")
      .insert({
        nombre_completo: dto.nombreCompleto,
        documento: dto.documento.trim(),
        telefono: dto.telefono ?? null,
        correo_personal: dto.correoPersonal?.toLowerCase() ?? null,
        correo_empresa: dto.correoEmpresa.toLowerCase(),
        cargo_id: dto.cargoId,
        tipo_contratacion: dto.tipoContratacion,
        fecha_vinculacion: dto.fechaVinculacion,
        salario: dto.salario ?? null,
        notas: dto.notas ?? null,
      })
      .select("*, cargos(codigo, nombre)")
      .single();
    if (error) this.traducirError(error);
    return this.mapEmpleado(data as EmpleadoRow);
  }

  async actualizar(id: string, dto: ActualizarEmpleadoDto): Promise<Empleado> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.nombreCompleto !== undefined) update.nombre_completo = dto.nombreCompleto;
    if (dto.documento !== undefined) update.documento = dto.documento.trim();
    if (dto.telefono !== undefined) update.telefono = dto.telefono || null;
    if (dto.correoPersonal !== undefined)
      update.correo_personal = dto.correoPersonal ? dto.correoPersonal.toLowerCase() : null;
    if (dto.correoEmpresa !== undefined) update.correo_empresa = dto.correoEmpresa.toLowerCase();
    if (dto.cargoId !== undefined) update.cargo_id = dto.cargoId;
    if (dto.tipoContratacion !== undefined) update.tipo_contratacion = dto.tipoContratacion;
    if (dto.fechaVinculacion !== undefined) update.fecha_vinculacion = dto.fechaVinculacion;
    if (dto.fechaDesvinculacion !== undefined)
      update.fecha_desvinculacion = dto.fechaDesvinculacion || null;
    if (dto.salario !== undefined) update.salario = dto.salario;
    if (dto.activo !== undefined) update.activo = dto.activo;
    if (dto.notas !== undefined) update.notas = dto.notas || null;

    const { data, error } = await this.supabase
      .from("empleados")
      .update(update)
      .eq("id", id)
      .select("*, cargos(codigo, nombre)")
      .maybeSingle();
    if (error) this.traducirError(error);
    if (!data) throw new NotFoundException("Empleado no encontrado");
    return this.mapEmpleado(data as EmpleadoRow);
  }

  async generarHistorial(
    anio: number,
    mes: number,
  ): Promise<{ generados: number; anio: number; mes: number }> {
    const { data, error } = await this.supabase.rpc("generar_historial_gh", {
      p_anio: anio,
      p_mes: mes,
    });
    if (error) {
      throw new InternalServerErrorException(`No se pudo generar el histórico: ${error.message}`);
    }
    return { generados: (data as number) ?? 0, anio, mes };
  }

  async listarHistorial(anio: number, mes: number): Promise<EmpleadoHistorialMensual[]> {
    const { data, error } = await this.supabase
      .from("empleado_historial_mensual")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes)
      .order("nombre_completo");
    if (error) throw new InternalServerErrorException("No se pudo cargar el histórico");
    return (data ?? []) as EmpleadoHistorialMensual[];
  }

  /** Traduce errores de Postgres a excepciones HTTP legibles. Siempre lanza. */
  private traducirError(error: { code?: string; message?: string }): never {
    if (error.code === "23505") {
      if (error.message?.includes("documento")) {
        throw new ConflictException("Ya existe un empleado con ese documento");
      }
      if (error.message?.includes("correo_empresa")) {
        throw new ConflictException("Ya existe un empleado con ese correo de empresa");
      }
      if (error.message?.includes("user_id")) {
        throw new ConflictException("Esa cuenta ya está vinculada a otro empleado");
      }
      throw new ConflictException("Registro duplicado");
    }
    if (error.code === "23503") {
      throw new BadRequestException("El cargo o la cuenta indicados no son válidos");
    }
    throw new InternalServerErrorException(
      `No se pudo guardar el empleado: ${error.message ?? "error desconocido"}`,
    );
  }
}
