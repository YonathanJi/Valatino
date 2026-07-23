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
import { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateRolDto } from "./dto/update-rol.dto";
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

  @Patch(":id")
  async updateUsuario(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    const rol = await this.fetchRol(id);
    if (rol !== "admin" && rol !== "asesor") {
      throw new NotFoundException("Usuario no encontrado en el staff");
    }

    const authUpdate: {
      email?: string;
      email_confirm?: boolean;
      user_metadata?: { nombre: string };
    } = {};
    if (dto.email !== undefined) {
      authUpdate.email = dto.email.toLowerCase();
      authUpdate.email_confirm = true;
    }
    if (dto.nombre !== undefined) authUpdate.user_metadata = { nombre: dto.nombre };

    if (Object.keys(authUpdate).length > 0) {
      const { error } = await this.supabase.auth.admin.updateUserById(id, authUpdate);
      if (error) {
        if (error.code === "email_exists") {
          throw new ConflictException("Ya existe un usuario con ese email");
        }
        throw new InternalServerErrorException(`No se pudo actualizar el usuario: ${error.message}`);
      }
    }

    // Reflejar los cambios en profiles (auth.users no dispara el trigger en updates).
    const profileUpdate: { email?: string; nombre?: string } = {};
    if (dto.email !== undefined) profileUpdate.email = dto.email.toLowerCase();
    if (dto.nombre !== undefined) profileUpdate.nombre = dto.nombre;
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await this.supabase.from("profiles").update(profileUpdate).eq("id", id);
      if (error) throw new InternalServerErrorException("No se pudo actualizar el perfil");
    }

    return { message: "Usuario actualizado" };
  }

  @Patch(":id/password")
  async resetPassword(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    const rol = await this.fetchRol(id);
    if (rol !== "admin" && rol !== "asesor") {
      throw new NotFoundException("Usuario no encontrado en el staff");
    }

    const { error } = await this.supabase.auth.admin.updateUserById(id, {
      password: dto.password,
    });
    if (error) {
      throw new InternalServerErrorException(
        `No se pudo restablecer la contraseña: ${error.message}`,
      );
    }
    return { message: "Contraseña restablecida" };
  }

  @Patch(":id/rol")
  async updateRol(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateRolDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    if (id === editor.sub) {
      throw new BadRequestException("No puedes cambiar tu propio rol");
    }

    const rolActual = await this.fetchRol(id);
    if (rolActual !== "admin" && rolActual !== "asesor") {
      throw new NotFoundException("Usuario no encontrado en el staff");
    }

    const { data: rolesData, error: rolesError } = await this.supabase
      .from("roles")
      .select("id, nombre")
      .in("nombre", ["admin", "asesor"]);
    if (rolesError || !rolesData) {
      throw new InternalServerErrorException("No se pudieron cargar los roles");
    }
    const roleIdPorNombre = new Map(
      (rolesData as { id: string; nombre: UserRole }[]).map((r) => [r.nombre, r.id]),
    );
    const nuevoRoleId = roleIdPorNombre.get(dto.rol);
    const adminRoleId = roleIdPorNombre.get("admin");
    if (!nuevoRoleId || !adminRoleId) {
      throw new InternalServerErrorException("Configuración de roles incompleta");
    }

    // Degradar un admin: nunca dejar el sistema sin administradores.
    if (rolActual === "admin" && dto.rol !== "admin") {
      const { count } = await this.supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role_id", adminRoleId);
      if ((count ?? 0) <= 1) {
        throw new BadRequestException("No puedes degradar al último administrador");
      }
    }

    // user_roles tiene PK compuesta (user_id, role_id): reemplazar = borrar + insertar
    // garantiza un único rol por usuario.
    if (dto.rol !== rolActual) {
      const { error: delError } = await this.supabase
        .from("user_roles")
        .delete()
        .eq("user_id", id);
      if (delError) throw new InternalServerErrorException("No se pudo actualizar el rol");

      const { error: insError } = await this.supabase.from("user_roles").insert({
        user_id: id,
        role_id: nuevoRoleId,
        asignado_por: editor.sub,
      });
      if (insError) throw new InternalServerErrorException("No se pudo asignar el nuevo rol");
    }

    // Módulos: un admin ve todo (sin filas explícitas); un asesor tiene los indicados.
    if (dto.rol === "admin") {
      const { error } = await this.supabase.from("staff_modulos").delete().eq("user_id", id);
      if (error) throw new InternalServerErrorException("No se pudieron limpiar los módulos");
    } else if (dto.modulos !== undefined) {
      await this.reemplazarModulos(id, dto.modulos, editor.sub);
    } else if (rolActual === "admin") {
      // Promoción admin→asesor sin módulos indicados: arranca sin módulos.
      await this.reemplazarModulos(id, [], editor.sub);
    }

    return { message: "Rol actualizado", rol: dto.rol };
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
