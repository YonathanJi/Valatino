import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { passportJwtSecret } from "jwks-rsa";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { JwtPayload, StaffModulo, UserRole } from "@valatino/types";

interface SupabaseJwt {
  sub: string;
  email: string;
  user_metadata?: { role?: string; nombre?: string };
  session_id?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly supabase: SupabaseClient;

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>("SUPABASE_URL");

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ["RS256", "ES256"],
    });

    this.supabase = createClient(
      supabaseUrl,
      config.getOrThrow<string>("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }

  async validate(payload: SupabaseJwt): Promise<JwtPayload> {
    const dbRole = await this.fetchRoleFromDb(payload.sub);
    const role = dbRole ?? (payload.user_metadata?.role as UserRole) ?? "cliente";

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

  private async fetchRoleFromDb(userId: string): Promise<UserRole | null> {
    const { data } = await this.supabase
      .from("user_roles")
      .select("roles(nombre)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const role = (data as { roles?: { nombre?: string } } | null)?.roles?.nombre;
    return (role as UserRole) ?? null;
  }

  private async fetchModulosFromDb(userId: string): Promise<StaffModulo[]> {
    const { data } = await this.supabase
      .from("staff_modulos")
      .select("modulo")
      .eq("user_id", userId);

    return ((data as { modulo: StaffModulo }[] | null) ?? []).map((m) => m.modulo);
  }
}
