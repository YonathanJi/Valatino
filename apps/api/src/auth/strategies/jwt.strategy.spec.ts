import { Logger, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { SupabaseClient } from "@supabase/supabase-js";

// jwks-rsa arrastra jose v6, que es solo ESM y Jest (CJS) no puede cargar.
// Se sustituye por un proveedor de clave inerte: la verificación de la FIRMA
// del token la hace passport-jwt antes de llegar a validate(), y aquí se prueba
// lo que pasa DESPUÉS — de dónde sale el rol de un token ya verificado.
jest.mock("jwks-rsa", () => ({
  passportJwtSecret: () => (_req: unknown, _token: unknown, done: (e: null, k: string) => void) =>
    done(null, "clave-de-prueba"),
}));

import { JwtStrategy } from "./jwt.strategy";

/**
 * El rol sale de user_roles y de ningún otro sitio.
 *
 * La mitad de estos tests existen para que no vuelva el respaldo
 * `payload.user_metadata?.role`: en Supabase ese campo lo escribe el propio
 * dueño de la cuenta (supabase.auth.updateUser), así que un token legítimo
 * puede traer "role": "admin" dentro. Son pruebas negativas de autorización
 * — comprueban lo que NO se puede conseguir.
 */

type Respuesta = { data: unknown; error: { message: string } | null };

function montarSupabase(porTabla: Record<string, Respuesta>): SupabaseClient {
  return {
    from: (tabla: string) => ({
      select: () => ({
        eq: () => Promise.resolve(porTabla[tabla] ?? { data: [], error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const config = {
  getOrThrow: () => "https://proyecto.supabase.co",
} as unknown as ConfigService;

function montarEstrategia(porTabla: Record<string, Respuesta>): JwtStrategy {
  return new JwtStrategy(config, montarSupabase(porTabla));
}

function conRol(nombre: string): Respuesta {
  return { data: [{ roles: { nombre } }], error: null };
}

const SIN_FILA: Respuesta = { data: [], error: null };

/**
 * Un token de Supabase con `user_metadata` dentro. El tipo SupabaseJwt ya no
 * declara ese campo a propósito, así que hay que colarlo con un cast — que es
 * justo lo que hace la realidad: el campo llega en el token igualmente.
 */
function token(user_metadata?: Record<string, string>) {
  const payload = {
    sub: "u-1",
    email: "alguien@ejemplo.com",
    iat: 1_700_000_000,
    exp: 1_700_003_600,
    ...(user_metadata ? { user_metadata } : {}),
  };
  return payload as unknown as Parameters<JwtStrategy["validate"]>[0];
}

describe("JwtStrategy — el rol solo puede venir de user_roles", () => {
  beforeEach(() => {
    // Denegar deja rastro en el log a propósito (es un criterio de la
    // auditoría). Se silencia el Logger de Nest, no console: no escribe ahí.
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("toma el rol de user_roles", async () => {
    const estrategia = montarEstrategia({ user_roles: conRol("admin") });

    await expect(estrategia.validate(token())).resolves.toMatchObject({
      sub: "u-1",
      role: "admin",
    });
  });

  it("IGNORA user_metadata.role aunque el token diga admin", async () => {
    const estrategia = montarEstrategia({ user_roles: conRol("cliente") });

    const { role } = await estrategia.validate(token({ role: "admin" }));

    expect(role).toBe("cliente");
  });

  it("una cuenta sin fila en user_roles es cliente, NO lo que diga su metadata", async () => {
    const estrategia = montarEstrategia({ user_roles: SIN_FILA });

    // Este era el camino exacto de escalada: sin fila, el respaldo antiguo
    // (`dbRole ?? payload.user_metadata?.role`) devolvía "admin".
    const { role } = await estrategia.validate(token({ role: "admin" }));

    expect(role).toBe("cliente");
  });

  it("un metadata con rol de asesor tampoco carga módulos", async () => {
    const estrategia = montarEstrategia({
      user_roles: SIN_FILA,
      staff_modulos: { data: [{ modulo: "ti", nivel: "total" }], error: null },
    });

    const resultado = await estrategia.validate(token({ role: "asesor" }));

    expect(resultado.role).toBe("cliente");
    expect(resultado.modulos).toBeUndefined();
  });

  it("si falla la consulta del rol, deniega en vez de degradar a cliente", async () => {
    const estrategia = montarEstrategia({
      user_roles: { data: null, error: { message: "connection reset" } },
    });

    await expect(estrategia.validate(token({ role: "admin" }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("el error de la consulta no se le cuenta al navegador", async () => {
    const estrategia = montarEstrategia({
      user_roles: { data: null, error: { message: 'relation "user_roles" does not exist' } },
    });

    await expect(estrategia.validate(token())).rejects.toThrow(
      "No se ha podido verificar tu sesión",
    );
  });

  it("con dos roles deniega, en vez de quedarse con el primero que salga", async () => {
    const estrategia = montarEstrategia({
      user_roles: {
        data: [{ roles: { nombre: "cliente" } }, { roles: { nombre: "admin" } }],
        error: null,
      },
    });

    // La 058 lo hace imposible en la BD. Esto cubre el día que alguien la quite:
    // sin ORDER BY, quedarse con filas[0] es dejar que Postgres elija el rol.
    await expect(estrategia.validate(token())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("el asesor sí carga sus módulos de staff_modulos", async () => {
    const estrategia = montarEstrategia({
      user_roles: conRol("asesor"),
      staff_modulos: {
        data: [{ modulo: "pedidos", nivel: "edicion" }],
        error: null,
      },
    });

    const resultado = await estrategia.validate(token());

    expect(resultado.role).toBe("asesor");
    expect(resultado.modulos).toEqual([{ modulo: "pedidos", nivel: "edicion" }]);
  });

  it("el admin no arrastra módulos: su acceso no depende de staff_modulos", async () => {
    const estrategia = montarEstrategia({ user_roles: conRol("admin") });

    const resultado = await estrategia.validate(token());

    expect(resultado.modulos).toBeUndefined();
  });
});
