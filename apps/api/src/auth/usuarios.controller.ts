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
  ForbiddenException,
  InternalServerErrorException,
  Inject,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { JwtGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { ModulosGuard } from "./guards/modulos.guard";
import { Roles } from "./decorators/roles.decorator";
import { Modulo, Nivel } from "./decorators/modulo.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { UpdateModulosDto } from "./dto/update-modulos.dto";
import { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateRolDto } from "./dto/update-rol.dto";
import { ProvisionarCuentaDto } from "./dto/provisionar-cuenta.dto";
import { BloqueoDto } from "./dto/bloqueo.dto";
import { PermisosService } from "./permisos.service";
import type { JwtPayload, PermisoModulo, UserRole } from "@valatino/types";

interface StaffMiembro {
  user_id: string;
  email: string | null;
  nombre: string | null;
  rol: UserRole;
  /** Cargo de RRHH; null si la cuenta no está vinculada a una ficha de empleado. */
  cargo_nombre: string | null;
  permisos: PermisoModulo[];
  bloqueado: boolean;
  created_at: string;
}

// Usuarios vive dentro del módulo "TI". Aquí NO hay un `edicion` con contenido
// seguro: cambiar la contraseña o el correo de otra persona es apropiarse de su
// cuenta, y crear una cuenta es poder fabricarse permisos. Por eso los únicos
// niveles con sentido son `lectura` (auditar quién tiene qué) y `total`
// (administrar), y la clase exige `total` por defecto bajando solo en las
// consultas.
//
// Dos capas distintas conviven a propósito:
//   - @Nivel protege el negocio.
//   - @Roles("admin") protege la frontera del propio sistema de permisos:
//     cambiar el rol, bloquear y eliminar cuentas. Si un `ti:total` pudiera
//     cambiar roles se auto-promovería a admin y la distinción súper admin /
//     directivo dejaría de existir.
// Sobre una cuenta admin solo actúa otro admin (ver asegurarStaffEditable).
@Controller("admin/usuarios")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("ti")
@Nivel("total")
export class UsuariosController {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly permisos: PermisosService,
  ) {}

  @Get()
  @Nivel("lectura")
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

    const [permisosPorUsuario, { data: profilesData }, { data: empleadosData }, { data: usersData }] =
      await Promise.all([
        this.permisos.porUsuario(userIds),
        this.supabase.from("profiles").select("id, email, nombre").in("id", userIds),
        // El cargo va por service_role: `empleados` tiene RLS sin policies.
        this.supabase.from("empleados").select("user_id, cargos(nombre)").in("user_id", userIds),
        this.supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
      ]);

    const ahora = new Date();
    const bloqueados = new Set(
      ((usersData?.users ?? []) as { id: string; banned_until?: string | null }[])
        .filter((u) => u.banned_until != null && new Date(u.banned_until) > ahora)
        .map((u) => u.id),
    );

    const perfilPorUsuario = new Map(
      ((profilesData ?? []) as { id: string; email: string | null; nombre: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );

    const cargoPorUsuario = new Map(
      (
        (empleadosData ?? []) as unknown as {
          user_id: string;
          cargos: { nombre: string } | null;
        }[]
      ).map((e) => [e.user_id, e.cargos?.nombre ?? null]),
    );

    return rows.map((r) => ({
      user_id: r.user_id,
      email: perfilPorUsuario.get(r.user_id)?.email ?? null,
      nombre: perfilPorUsuario.get(r.user_id)?.nombre ?? null,
      rol: r.roles.nombre,
      cargo_nombre: cargoPorUsuario.get(r.user_id) ?? null,
      // El admin no tiene filas: su acceso no sale de staff_modulos.
      permisos: r.roles.nombre === "admin" ? [] : (permisosPorUsuario.get(r.user_id) ?? []),
      bloqueado: bloqueados.has(r.user_id),
      created_at: r.created_at,
    }));
  }

  // Aquí vivía POST /admin/usuarios, que creaba una cuenta de asesor suelta con
  // nombre y correo tecleados a mano. Se retira: producía cuentas sin ficha de
  // RRHH y, por tanto, sin cargo y sin plantilla de permisos — justo lo que este
  // trabajo viene a evitar. El único camino de alta es ahora
  // RRHH crea el empleado -> TI provisiona la cuenta (POST /provisionar).
  //
  // No hay riesgo de quedarse sin poder dar de alta a nadie: el súper admin
  // tiene acceso implícito tanto a gestion_humana como a ti, así que puede dar
  // los dos pasos él mismo.

  /**
   * Empleados creados por RRHH que aún no tienen cuenta de acceso, con la
   * plantilla de permisos de su cargo ya resuelta para que la pantalla de
   * provisión llegue rellena y TI vea exactamente lo que va a guardar.
   */
  @Get("empleados-pendientes")
  @Nivel("lectura")
  async empleadosPendientes() {
    const { data, error } = await this.supabase
      .from("empleados")
      .select("id, codigo_empleado, nombre_completo, correo_empresa, cargo_id, cargos(codigo, nombre)")
      .is("user_id", null)
      .order("nombre_completo");
    if (error) {
      throw new InternalServerErrorException("No se pudieron cargar los empleados pendientes");
    }
    const filas = (data ?? []) as unknown as {
      id: string;
      codigo_empleado: string;
      nombre_completo: string;
      correo_empresa: string;
      cargo_id: string | null;
      cargos: { codigo: string; nombre: string } | null;
    }[];

    const cargoIds = [...new Set(filas.map((r) => r.cargo_id).filter((v): v is string => v != null))];
    const plantillaPorCargo = await this.plantillaPorCargo(cargoIds);

    return filas.map((r) => ({
      id: r.id,
      codigo_empleado: r.codigo_empleado,
      nombre_completo: r.nombre_completo,
      correo_empresa: r.correo_empresa,
      cargo_id: r.cargo_id,
      cargo_codigo: r.cargos?.codigo ?? null,
      cargo_nombre: r.cargos?.nombre ?? null,
      plantilla: (r.cargo_id ? plantillaPorCargo.get(r.cargo_id) : undefined) ?? [],
    }));
  }

  /** Plantillas de permisos de varios cargos, indexadas por cargo. */
  private async plantillaPorCargo(cargoIds: string[]): Promise<Map<string, PermisoModulo[]>> {
    const mapa = new Map<string, PermisoModulo[]>();
    if (cargoIds.length === 0) return mapa;

    const { data, error } = await this.supabase
      .from("cargo_modulos")
      .select("cargo_id, modulo, nivel")
      .in("cargo_id", cargoIds);
    if (error) throw new InternalServerErrorException("No se pudieron cargar las plantillas");

    for (const fila of (data ?? []) as ({ cargo_id: string } & PermisoModulo)[]) {
      const lista = mapa.get(fila.cargo_id) ?? [];
      lista.push({ modulo: fila.modulo, nivel: fila.nivel });
      mapa.set(fila.cargo_id, lista);
    }
    return mapa;
  }

  /** TI provisiona la cuenta de un empleado: crea el acceso, rol y permisos y lo vincula. */
  @Post("provisionar")
  async provisionarCuenta(
    @Body() dto: ProvisionarCuentaDto,
    @CurrentUser() creator: JwtPayload,
  ) {
    const { data: emp, error: empError } = await this.supabase
      .from("empleados")
      .select("id, user_id, nombre_completo")
      .eq("id", dto.empleadoId)
      .maybeSingle();
    if (empError) throw new InternalServerErrorException("No se pudo comprobar el empleado");
    if (!emp) throw new NotFoundException("Empleado no encontrado");
    if ((emp as { user_id: string | null }).user_id) {
      throw new ConflictException("El empleado ya tiene una cuenta asignada");
    }

    const { data: created, error: createError } = await this.supabase.auth.admin.createUser({
      email: dto.email.toLowerCase(),
      password: dto.password,
      email_confirm: true,
      user_metadata: { nombre: (emp as { nombre_completo: string }).nombre_completo },
    });
    if (createError) {
      if (createError.code === "email_exists") {
        throw new ConflictException("Ya existe un usuario con ese email");
      }
      throw new InternalServerErrorException(`No se pudo crear la cuenta: ${createError.message}`);
    }
    const userId = created.user.id;

    try {
      const { data: rolAsesor } = await this.supabase
        .from("roles")
        .select("id")
        .eq("nombre", "asesor")
        .single();
      if (!rolAsesor) throw new InternalServerErrorException("Rol 'asesor' no encontrado");

      // El trigger asigna 'cliente' por defecto: se reemplaza por 'asesor'.
      await this.supabase.from("user_roles").delete().eq("user_id", userId);
      const { error: rolError } = await this.supabase.from("user_roles").insert({
        user_id: userId,
        role_id: (rolAsesor as { id: string }).id,
        asignado_por: creator.sub,
      });
      if (rolError) throw new InternalServerErrorException("No se pudo asignar el rol asesor");

      await this.permisos.reemplazar(userId, dto.permisos, creator.sub);

      const { error: linkError } = await this.supabase
        .from("empleados")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", dto.empleadoId);
      if (linkError) throw new InternalServerErrorException("No se pudo vincular la cuenta");
    } catch (e) {
      // Rollback: si algo falla tras crear el acceso, se elimina para no dejar huérfanos.
      await this.supabase.auth.admin.deleteUser(userId);
      throw e;
    }

    return { message: "Cuenta provisionada", user_id: userId };
  }

  @Patch(":id")
  async updateUsuario(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    await this.asegurarStaffEditable(id, editor);

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
    @CurrentUser() editor: JwtPayload,
  ) {
    await this.asegurarStaffEditable(id, editor);

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
  @Roles("admin")
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
    } else if (dto.permisos !== undefined) {
      await this.permisos.reemplazar(id, dto.permisos, editor.sub);
    } else if (rolActual === "admin") {
      // Promoción admin→asesor sin módulos indicados: arranca sin módulos.
      await this.permisos.reemplazar(id, [], editor.sub);
    }

    return { message: "Rol actualizado", rol: dto.rol };
  }

  @Patch(":id/modulos")
  async updateModulos(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: UpdateModulosDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    // Nadie que no sea admin se edita sus propios permisos: un `ti:total` podía
    // quitarse `ti` a sí mismo y quedarse fuera de la única pantalla desde la
    // que recuperarlo. Los hermanos de este handler (rol, bloqueo, borrado) ya
    // llevaban su versión de este freno; a este le faltaba.
    if (id === editor.sub && editor.role !== "admin") {
      throw new BadRequestException("No puedes cambiar tus propios permisos");
    }

    const rol = await this.fetchRol(id);
    if (!rol) throw new NotFoundException("Usuario no encontrado en el staff");
    if (rol !== "asesor") {
      throw new BadRequestException("El súper admin tiene acceso a todo; no lleva permisos por módulo");
    }

    await this.permisos.reemplazar(id, dto.permisos, editor.sub);
    return { message: "Permisos actualizados", permisos: dto.permisos };
  }

  @Patch(":id/bloqueo")
  @Roles("admin")
  async setBloqueo(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: BloqueoDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    if (id === editor.sub) throw new BadRequestException("No puedes bloquear tu propia cuenta");

    const rol = await this.fetchRol(id);
    if (rol !== "asesor") {
      throw new BadRequestException("Solo se pueden bloquear cuentas de asesor");
    }

    const { error } = await this.supabase.auth.admin.updateUserById(id, {
      // ban_duration "none" desbloquea; una duración larga bloquea el acceso.
      ban_duration: dto.bloquear ? "876000h" : "none",
    });
    if (error) {
      throw new InternalServerErrorException(`No se pudo actualizar el bloqueo: ${error.message}`);
    }
    return {
      message: dto.bloquear ? "Cuenta bloqueada" : "Cuenta desbloqueada",
      bloqueado: dto.bloquear,
    };
  }

  @Delete(":id")
  @Roles("admin")
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

    // user_roles y staff_modulos caen en cascada con auth.users; empleados.user_id
    // queda a null (ON DELETE SET NULL): la persona sigue en Gestión Humana.
    return { message: "Asesor eliminado" };
  }

  /**
   * Comprueba que el objetivo es staff y que el editor puede tocarlo.
   * Un asesor de TI gestiona cuentas de asesor, pero NO las de un admin: si
   * pudiera cambiarle el email o la contraseña se apropiaría de la cuenta y el
   * `@Roles("admin")` de updateRol/setBloqueo/removeAsesor no valdría de nada.
   */
  private async asegurarStaffEditable(userId: string, editor: JwtPayload): Promise<UserRole> {
    const rol = await this.fetchRol(userId);
    if (rol !== "admin" && rol !== "asesor") {
      throw new NotFoundException("Usuario no encontrado en el staff");
    }
    if (rol === "admin" && editor.role !== "admin") {
      throw new ForbiddenException(
        "Solo un administrador puede modificar la cuenta de otro administrador",
      );
    }
    return rol;
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

}
