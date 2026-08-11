import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { passportJwtSecret } from "jwks-rsa";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../supabase/supabase.module";
import type { JwtPayload, PermisoModulo, UserRole } from "@valatino/types";

/**
 * Lo que se usa del token de Supabase. `user_metadata` NO está aquí a
 * propósito: el propietario de la cuenta puede escribirlo (supabase.auth
 * .updateUser), así que nada de lo que contenga puede decidir permisos.
 * Si algún día hace falta el nombre para mostrarlo, que entre por otra vía y
 * no por este tipo, que es el que alimenta la autorización.
 */
interface SupabaseJwt {
  sub: string;
  email: string;
  session_id?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${config.getOrThrow<string>("SUPABASE_URL")}/auth/v1/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ["RS256", "ES256"],
    });
  }

  async validate(payload: SupabaseJwt): Promise<JwtPayload> {
    const role = await this.fetchRoleFromDb(payload.sub);

    return {
      sub: payload.sub,
      email: payload.email,
      role,
      modulos: role === "asesor" ? await this.fetchModulosFromDb(payload.sub) : undefined,
      session_id: payload.session_id,
      iat: payload.iat,
      exp: payload.exp,
    };
  }

  /**
   * `user_roles` es la ÚNICA fuente del rol. Tres salidas, y las tres cierran
   * hacia abajo:
   *
   * - una fila  -> ese rol.
   * - sin fila  -> "cliente". Es el mínimo privilegio, no un permiso: lo que
   *   abre el panel es tener 'admin'/'asesor', no la ausencia de fila. Un
   *   cliente normal SÍ tiene la suya (la pone el trigger assign_default_role);
   *   quedarse sin ella es raro, y por eso se registra.
   * - error o más de una fila -> se deniega. Un fallo al leer el rol no puede
   *   convertirse en un permiso, y con dos filas el rol es indeterminado
   *   (la 058 lo hace imposible en BD; esto cubre el día que alguien la quite).
   *
   * Al navegador solo le llega un mensaje genérico; el detalle queda en el log.
   *
   * OJO al denegar: en las rutas con OptionalJwtGuard (carrito, checkout) el
   * guard se traga la excepción y la petición sigue como anónima, no como 401.
   * Es la degradación correcta —sin privilegios—, pero explica por qué un
   * usuario identificado podría verse como invitado si Supabase falla.
   */
  private async fetchRoleFromDb(userId: string): Promise<UserRole> {
    const { data, error } = await this.supabase
      .from("user_roles")
      .select("roles(nombre)")
      .eq("user_id", userId);

    if (error) {
      this.logger.error(`No se pudo leer el rol de ${userId}: ${error.message}`);
      throw new UnauthorizedException("No se ha podido verificar tu sesión");
    }

    const filas = (data as { roles?: { nombre?: string } }[] | null) ?? [];

    if (filas.length > 1) {
      this.logger.error(`${userId} tiene ${filas.length} roles; se deniega el acceso`);
      throw new UnauthorizedException("No se ha podido verificar tu sesión");
    }

    const role = filas[0]?.roles?.nombre;
    if (!role) {
      this.logger.warn(`${userId} no tiene fila en user_roles; se trata como cliente`);
      return "cliente";
    }

    return role as UserRole;
  }

  private async fetchModulosFromDb(userId: string): Promise<PermisoModulo[]> {
    const { data } = await this.supabase
      .from("staff_modulos")
      .select("modulo, nivel")
      .eq("user_id", userId);

    return ((data as PermisoModulo[] | null) ?? []).map(({ modulo, nivel }) => ({ modulo, nivel }));
  }
}
