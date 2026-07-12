import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { JwtGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./decorators/roles.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AssignRoleDto } from "./dto/assign-role.dto";
import { CreateAsesorDto } from "./dto/create-asesor.dto";
import { UpdateModulosDto } from "./dto/update-modulos.dto";
import type { JwtPayload, StaffModulo, UserRole } from "@valatino/types";

interface StaffMiembro {
  user_id: string;
  email: string | null;
  nombre: string | null;
  rol: UserRole;
  modulos: StaffModulo[];
  created_at: string;
}

@Controller("admin/usuarios")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin")
export class UsuariosController {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  @Get()
  async findAll(): Promise<StaffMiembro[]> {
    const { data, error } = await this.supabase
      .from("user_roles")
      .select("user_id, created_at, roles!inner(nombre)")
      .in("roles.nombre", ["admin", "asesor"]);

    if (error) throw new InternalServerErrorException("No se pudieron cargar los usuarios");

    const rows = (data ?? []) as unknown as {
      user_id: string;
      created_at: string;
      roles: { nombre: UserRole };
    }[];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.user_id);

    const [{ data: modulosData }, { data: profilesData }] = await Promise.all([
      this.supabase.from("staff_modulos").select("user_id, modulo").in("user_id", userIds),
      this.supabase.from("profiles").select("id, email, nombre").in("id", userIds),
    ]);

    const modulosPorUsuario = new Map<string, StaffModulo[]>();
    for (const m of (modulosData ?? []) as { user_id: string; modulo: StaffModulo }[]) {
      const lista = modulosPorUsuario.get(m.user_id) ?? [];
      lista.push(m.modulo);
      modulosPorUsuario.set(m.user_id, lista);
    }

    const perfilPorUsuario = new Map(
      ((profilesData ?? []) as { id: string; email: string | null; nombre: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );

    return rows.map((r) => ({
      user_id: r.user_id,
      email: perfilPorUsuario.get(r.user_id)?.email ?? null,
      nombre: perfilPorUsuario.get(r.user_id)?.nombre ?? null,
      rol: r.roles.nombre,
      modulos: r.roles.nombre === "admin" ? [] : (modulosPorUsuario.get(r.user_id) ?? []),
      created_at: r.created_at,
    }));
  }

  @Post()
  async createAsesor(
    @Body() dto: CreateAsesorDto,
    @CurrentUser() creator: JwtPayload,
  ): Promise<StaffMiembro> {
    const { data: created, error: createError } = await this.supabase.auth.admin.createUser({
      email: dto.email.toLowerCase(),
      password: dto.password,
      email_confirm: true,
      user_metadata: { nombre: dto.nombre },
    });

    if (createError) {
      if (createError.code === "email_exists") {
        throw new ConflictException("Ya existe un usuario con ese email");
      }
      throw new InternalServerErrorException(`No se pudo crear el usuario: ${createError.message}`);
    }

    const userId = created.user.id;

    const { data: rolAsesor } = await this.supabase
      .from("roles")
      .select("id")
      .eq("nombre", "asesor")
      .single();

    if (!rolAsesor) throw new InternalServerErrorException("Rol 'asesor' no encontrado");

    // El trigger handle_new_user asigna 'cliente' por defecto: se reemplaza por 'asesor'.
    const { error: deleteRolError } = await this.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (deleteRolError) {
      throw new InternalServerErrorException("No se pudo limpiar el rol por defecto");
    }

    const { error: rolError } = await this.supabase.from("user_roles").insert({
      user_id: userId,
      role_id: (rolAsesor as { id: string }).id,
      asignado_por: creator.sub,
    });
    if (rolError) throw new InternalServerErrorException("No se pudo asignar el rol asesor");

    await this.reemplazarModulos(userId, dto.modulos, creator.sub);

    return {
      user_id: userId,
      email: dto.email.toLowerCase(),
      nombre: dto.nombre,
      rol: "asesor",
      modulos: dto.modulos,
      created_at: created.user.created_at,
    };
  }

  @Patch(":id/modulos")
  async updateModulos(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateModulosDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    const rol = await this.fetchRol(id);
    if (!rol) throw new NotFoundException("Usuario no encontrado en el staff");
    if (rol !== "asesor") {
      throw new BadRequestException("Solo los asesores tienen módulos configurables");
    }

    await this.reemplazarModulos(id, dto.modulos, editor.sub);
    return { message: "Módulos actualizados", modulos: dto.modulos };
  }

  @Delete(":id")
  async removeAsesor(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() editor: JwtPayload,
  ) {
    if (id === editor.sub) throw new BadRequestException("No puedes eliminarte a ti mismo");

    const rol = await this.fetchRol(id);
    if (rol !== "asesor") {
      throw new BadRequestException("Solo se pueden eliminar cuentas de asesor");
    }

    const { error } = await this.supabase.auth.admin.deleteUser(id);
    if (error) throw new InternalServerErrorException("No se pudo eliminar el asesor");

    // user_roles y staff_modulos caen en cascada con auth.users.
    return { message: "Asesor eliminado" };
  }

  @Post("roles")
  async assignRole(@Body() dto: AssignRoleDto, @CurrentUser() assigner: JwtPayload) {
    const { data: rol } = await this.supabase
      .from("roles")
      .select("id")
      .eq("nombre", dto.role)
      .single();

    if (!rol) throw new NotFoundException(`Rol '${dto.role}' no encontrado`);

    const { error } = await this.supabase.from("user_roles").upsert({
      user_id: dto.user_id,
      role_id: (rol as { id: string }).id,
      asignado_por: assigner.sub,
    });

    if (error) throw new InternalServerErrorException("No se pudo asignar el rol");
    return { message: `Rol ${dto.role} asignado correctamente` };
  }

  private async fetchRol(userId: string): Promise<UserRole | null> {
    const { data } = await this.supabase
      .from("user_roles")
      .select("roles(nombre)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    return ((data as { roles?: { nombre?: UserRole } } | null)?.roles?.nombre) ?? null;
  }

  private async reemplazarModulos(
    userId: string,
    modulos: StaffModulo[],
    otorgadoPor: string,
  ): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from("staff_modulos")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw new InternalServerErrorException("No se pudieron limpiar los módulos");

    if (modulos.length === 0) return;

    const { error: insertError } = await this.supabase.from("staff_modulos").insert(
      modulos.map((modulo) => ({ user_id: userId, modulo, otorgado_por: otorgadoPor })),
    );
    if (insertError) throw new InternalServerErrorException("No se pudieron guardar los módulos");
  }
}
