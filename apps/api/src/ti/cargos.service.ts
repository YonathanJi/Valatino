import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type {
  Cargo,
  CargoConPlantilla,
  EmpleadoAfectado,
  PermisoModulo,
  ResultadoReaplicar,
} from "@valatino/types";

/** Fila cruda de la RPC aplicar_plantilla_cargo. */
interface FilaAplicacion {
  empleado_id: string;
  user_id: string | null;
  nombre: string;
  aplicado: boolean;
  motivo: string | null;
}

@Injectable()
export class CargosService {
  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /** Cargos con su plantilla y cuántas personas los ocupan. */
  async listar(): Promise<CargoConPlantilla[]> {
    const [{ data: cargos, error: errorCargos }, { data: permisos }, { data: empleados }] =
      await Promise.all([
        this.supabase.from("cargos").select("*").order("codigo"),
        this.supabase.from("cargo_modulos").select("cargo_id, modulo, nivel"),
        this.supabase.from("empleados").select("cargo_id").eq("activo", true),
      ]);

    if (errorCargos) throw new InternalServerErrorException("No se pudieron cargar los cargos");

    const plantillas = new Map<string, PermisoModulo[]>();
    for (const p of (permisos ?? []) as ({ cargo_id: string } & PermisoModulo)[]) {
      const lista = plantillas.get(p.cargo_id) ?? [];
      lista.push({ modulo: p.modulo, nivel: p.nivel });
      plantillas.set(p.cargo_id, lista);
    }

    const ocupantes = new Map<string, number>();
    for (const e of (empleados ?? []) as { cargo_id: string }[]) {
      ocupantes.set(e.cargo_id, (ocupantes.get(e.cargo_id) ?? 0) + 1);
    }

    return ((cargos ?? []) as Cargo[]).map((c) => ({
      ...c,
      permisos: plantillas.get(c.id) ?? [],
      empleados_activos: ocupantes.get(c.id) ?? 0,
    }));
  }

  async obtenerPlantilla(cargoId: string): Promise<{ cargo: Cargo; permisos: PermisoModulo[] }> {
    const { data: cargo } = await this.supabase
      .from("cargos")
      .select("*")
      .eq("id", cargoId)
      .maybeSingle();
    if (!cargo) throw new NotFoundException("Cargo no encontrado");

    const { data, error } = await this.supabase
      .from("cargo_modulos")
      .select("modulo, nivel")
      .eq("cargo_id", cargoId);
    if (error) throw new InternalServerErrorException("No se pudo cargar la plantilla");

    return { cargo: cargo as Cargo, permisos: (data ?? []) as PermisoModulo[] };
  }

  /**
   * Reemplaza la plantilla completa. Guardar la plantilla NO toca a nadie: los
   * permisos de quien ya tiene cuenta solo cambian si se pulsa «reaplicar», y
   * esa acción es la que muestra antes a quién va a afectar.
   */
  async guardarPlantilla(
    cargoId: string,
    permisos: PermisoModulo[],
    editorId: string,
  ): Promise<{ permisos: PermisoModulo[] }> {
    await this.obtenerPlantilla(cargoId); // 404 si el cargo no existe

    const { error: errorBorrado } = await this.supabase
      .from("cargo_modulos")
      .delete()
      .eq("cargo_id", cargoId);
    if (errorBorrado) throw new InternalServerErrorException("No se pudo limpiar la plantilla");

    if (permisos.length > 0) {
      const { error } = await this.supabase.from("cargo_modulos").insert(
        permisos.map((p) => ({
          cargo_id: cargoId,
          modulo: p.modulo,
          nivel: p.nivel,
          actualizado_por: editorId,
          updated_at: new Date().toISOString(),
        })),
      );
      if (error) throw new InternalServerErrorException(`No se pudo guardar: ${error.message}`);
    }

    return { permisos };
  }

  /**
   * A quién afectaría reaplicar, y qué cambiaría en cada persona.
   *
   * `divergente` marca a quien tiene hoy algo distinto de la plantilla: son los
   * ajustes individuales que el reemplazo va a borrar, y la razón por la que
   * esta consulta existe. La alternativa —fusionar en vez de reemplazar— nunca
   * convergería a la plantilla y todo el mundo acabaría acumulando permisos.
   */
  async afectados(cargoId: string): Promise<{ total: number; empleados: EmpleadoAfectado[] }> {
    const { permisos: plantilla } = await this.obtenerPlantilla(cargoId);

    const { data: empleados, error } = await this.supabase
      .from("empleados")
      .select("id, user_id, nombre_completo, activo")
      .eq("cargo_id", cargoId)
      .order("nombre_completo");
    if (error) throw new InternalServerErrorException("No se pudieron cargar los empleados");

    const filas = (empleados ?? []) as {
      id: string;
      user_id: string | null;
      nombre_completo: string;
      activo: boolean;
    }[];

    const userIds = filas.map((e) => e.user_id).filter((v): v is string => v != null);
    const actuales = new Map<string, PermisoModulo[]>();
    const admins = new Set<string>();

    if (userIds.length > 0) {
      const [{ data: permisosData }, { data: rolesData }] = await Promise.all([
        this.supabase.from("staff_modulos").select("user_id, modulo, nivel").in("user_id", userIds),
        this.supabase
          .from("user_roles")
          .select("user_id, roles!inner(nombre)")
          .in("user_id", userIds)
          .eq("roles.nombre", "admin"),
      ]);

      for (const p of (permisosData ?? []) as ({ user_id: string } & PermisoModulo)[]) {
        const lista = actuales.get(p.user_id) ?? [];
        lista.push({ modulo: p.modulo, nivel: p.nivel });
        actuales.set(p.user_id, lista);
      }
      for (const r of (rolesData ?? []) as { user_id: string }[]) admins.add(r.user_id);
    }

    const resultado: EmpleadoAfectado[] = filas.map((e) => {
      const motivo = !e.user_id
        ? "sin_cuenta"
        : admins.has(e.user_id)
          ? "es_admin"
          : !e.activo
            ? "inactivo"
            : null;

      const actual = e.user_id ? (actuales.get(e.user_id) ?? []) : [];
      const cambios = motivo ? [] : this.diff(actual, plantilla);

      return {
        empleado_id: e.id,
        user_id: e.user_id,
        nombre: e.nombre_completo,
        omitido_por: motivo,
        divergente: cambios.length > 0,
        cambios,
      };
    });

    return { total: resultado.filter((e) => e.omitido_por === null).length, empleados: resultado };
  }

  /** Qué módulos cambiarían de nivel al pasar de `actual` a `objetivo`. */
  private diff(actual: PermisoModulo[], objetivo: PermisoModulo[]) {
    const de = new Map(actual.map((p) => [p.modulo, p.nivel]));
    const a = new Map(objetivo.map((p) => [p.modulo, p.nivel]));
    const modulos = new Set([...de.keys(), ...a.keys()]);

    return [...modulos]
      .filter((m) => de.get(m) !== a.get(m))
      .map((modulo) => ({ modulo, de: de.get(modulo) ?? null, a: a.get(modulo) ?? null }));
  }

  /**
   * Copia la plantilla a quien ocupa el cargo. El trabajo real (y las
   * exclusiones de admin, sin cuenta e inactivo) vive en la RPC, para que el
   * reemplazo de cada persona sea transaccional.
   */
  async reaplicar(
    cargoId: string,
    editorId: string,
    editorEsAdmin: boolean,
    opciones: { userIds?: string[]; incluirme?: boolean } = {},
  ): Promise<ResultadoReaplicar> {
    await this.obtenerPlantilla(cargoId);

    // Un TI que edita la plantilla de su propio cargo puede echarse a sí mismo
    // sin darse cuenta. No se le impide, se le obliga a decirlo.
    if (!editorEsAdmin && !opciones.incluirme) {
      const { empleados } = await this.afectados(cargoId);
      if (empleados.some((e) => e.user_id === editorId && e.omitido_por === null)) {
        throw new BadRequestException(
          "Este cargo es el tuyo: reaplicar la plantilla cambiará tus propios permisos. " +
            "Confirma marcando «incluirme» si es lo que quieres.",
        );
      }
    }

    const { data, error } = await this.supabase.rpc("aplicar_plantilla_cargo", {
      p_cargo_id: cargoId,
      p_otorgado_por: editorId,
      p_user_ids: opciones.userIds ?? null,
    });
    if (error) {
      throw new InternalServerErrorException(`No se pudo reaplicar: ${error.message}`);
    }

    const filas = (data ?? []) as FilaAplicacion[];
    return {
      aplicados: filas.filter((f) => f.aplicado).length,
      omitidos: filas
        .filter((f) => !f.aplicado)
        .map((f) => ({ user_id: f.user_id, nombre: f.nombre, motivo: f.motivo ?? "desconocido" })),
    };
  }
}
