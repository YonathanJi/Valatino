import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { normalizarTelefono } from "@valatino/types";
import type { Cliente, ClienteDetalle, DireccionEnvio, Pedido } from "@valatino/types";
import type { ActualizarClienteDto } from "./dto/actualizar-cliente.dto";

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Listado con métricas por cliente. La agregación vive en la RPC
   * `listar_clientes` (SQL): traerse todos los pedidos para sumarlos en Node
   * chocaría con el límite de 1000 filas de PostgREST sin avisar.
   */
  async findAll(): Promise<Cliente[]> {
    const { data, error } = await this.supabase.rpc("listar_clientes");

    if (error) {
      this.logger.error(`Error al listar clientes: ${error.message}`);
      throw new InternalServerErrorException("No se pudieron cargar los clientes");
    }

    return ((data ?? []) as Cliente[]).map((c) => ({
      ...c,
      total_gastado: Number(c.total_gastado),
    }));
  }

  /** Ficha completa. Solo para clientes con cuenta: un invitado no tiene id. */
  async findOne(userId: string): Promise<ClienteDetalle> {
    const clientes = await this.findAll();
    const cliente = clientes.find((c) => c.user_id === userId);

    if (!cliente) throw new NotFoundException("Cliente no encontrado");

    const [{ data: pedidos }, { data: direcciones }] = await Promise.all([
      this.supabase
        .from("pedidos")
        .select("*, pedido_items(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      this.supabase
        .from("direcciones_envio")
        .select("*")
        .eq("user_id", userId)
        .order("es_predeterminada", { ascending: false }),
    ]);

    return {
      cliente,
      pedidos: (pedidos as Pedido[]) ?? [],
      direcciones: (direcciones as DireccionEnvio[]) ?? [],
    };
  }

  /**
   * Actualiza los datos de contacto en `profiles`. El perfil puede no existir
   * todavía (se crea por trigger al registrarse, pero un backfill podría
   * faltar), así que se hace upsert.
   */
  async actualizar(userId: string, dto: ActualizarClienteDto): Promise<{ message: string }> {
    await this.asegurarCliente(userId);

    const cambios: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre.trim();
    // Normalizado a 9 dígitos, igual que en el checkout: el panel y la tienda
    // escriben en la misma columna y tienen que dejarla igual.
    if (dto.telefono !== undefined) cambios.telefono = normalizarTelefono(dto.telefono) || null;
    if (dto.documento !== undefined) cambios.documento = dto.documento.trim() || null;

    if (Object.keys(cambios).length === 2) {
      throw new BadRequestException("No hay cambios que guardar");
    }

    const { error } = await this.supabase.from("profiles").upsert(cambios);

    if (error) {
      // documento es UNIQUE en profiles: dos clientes no pueden compartirlo
      if (error.code === "23505") {
        throw new ConflictException("Ya existe otro cliente con ese documento");
      }
      this.logger.error(`Error al actualizar el cliente ${userId}: ${error.message}`);
      throw new InternalServerErrorException("No se pudo actualizar el cliente");
    }

    return { message: "Cliente actualizado" };
  }

  /**
   * Elimina la cuenta de acceso del cliente.
   *
   * Los pedidos SE CONSERVAN: `pedidos.user_id` es ON DELETE SET NULL y el
   * pedido guarda su propio snapshot (email_cliente, envio_*), así que el
   * histórico contable queda intacto — necesario porque en España la
   * documentación de las ventas se conserva años.
   *
   * Sus direcciones guardadas sí caen en cascada (son datos personales que solo
   * servían para su checkout).
   */
  async eliminar(userId: string): Promise<{ message: string; pedidos_conservados: number }> {
    await this.asegurarCliente(userId);

    const { count } = await this.supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) {
      this.logger.error(`Error al eliminar el cliente ${userId}: ${error.message}`);
      throw new InternalServerErrorException("No se pudo eliminar la cuenta del cliente");
    }

    return { message: "Cuenta de cliente eliminada", pedidos_conservados: count ?? 0 };
  }

  /**
   * Solo se opera sobre clientes: ni admins ni asesores. Este módulo no es una
   * puerta trasera para tocar cuentas del staff (eso vive en TI, con sus
   * propios permisos).
   */
  private async asegurarCliente(userId: string): Promise<void> {
    const { data } = await this.supabase
      .from("user_roles")
      .select("roles(nombre)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const rol = (data as { roles?: { nombre?: string } } | null)?.roles?.nombre;

    if (!rol) throw new NotFoundException("Cliente no encontrado");
    if (rol !== "cliente") {
      throw new BadRequestException(
        "Esa cuenta pertenece al personal: gestiónala desde TI → Usuarios",
      );
    }
  }
}
