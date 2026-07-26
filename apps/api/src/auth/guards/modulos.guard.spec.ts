import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ModulosGuard } from "./modulos.guard";
import { MODULO_KEY, NIVEL_KEY } from "../decorators/modulo.decorator";
import { NIVELES_PERMISO } from "@valatino/types";
import type { JwtPayload, NivelPermiso, PermisoModulo, StaffModulo } from "@valatino/types";

interface Metadatos {
  moduloClase?: StaffModulo[];
  moduloHandler?: StaffModulo[];
  nivelClase?: NivelPermiso;
  nivelHandler?: NivelPermiso;
}

/**
 * Doble del Reflector: getAllAndOverride([handler, clase]) resuelve el metadato
 * del handler y, si no lo hay, el de la clase. Se reproduce esa precedencia
 * porque la herencia clase→handler es justo lo que sostiene el patrón de
 * "módulo una vez en la clase, nivel por handler".
 */
function montarReflector(meta: Metadatos) {
  const tabla: Record<string, { HANDLER?: unknown; CLASE?: unknown }> = {
    [MODULO_KEY]: { HANDLER: meta.moduloHandler, CLASE: meta.moduloClase },
    [NIVEL_KEY]: { HANDLER: meta.nivelHandler, CLASE: meta.nivelClase },
  };
  return {
    getAllAndOverride: (clave: string, [handler, clase]: unknown[]) => {
      const porClave = tabla[clave] ?? {};
      return porClave[handler as "HANDLER"] ?? porClave[clase as "CLASE"];
    },
  } as unknown as Reflector;
}

function montarContexto(user: Partial<JwtPayload> | undefined): ExecutionContext {
  return {
    getHandler: () => "HANDLER",
    getClass: () => "CLASE",
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function asesor(...modulos: PermisoModulo[]): Partial<JwtPayload> {
  return { sub: "u-1", role: "asesor", modulos };
}

const admin: Partial<JwtPayload> = { sub: "a-1", role: "admin" };

describe("ModulosGuard", () => {
  describe("puerta de entrada", () => {
    it("deja pasar cuando la ruta no declara módulo", () => {
      const guard = new ModulosGuard(montarReflector({}));
      expect(guard.canActivate(montarContexto(undefined))).toBe(true);
    });

    it("el admin pasa sin tener filas en staff_modulos", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["pedidos"], nivelClase: "total" }),
      );
      expect(guard.canActivate(montarContexto(admin))).toBe(true);
    });

    it("una petición sin usuario recibe 403", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["pedidos"], nivelClase: "lectura" }),
      );
      expect(() => guard.canActivate(montarContexto(undefined))).toThrow(ForbiddenException);
    });

    it("un cliente no entra al backoffice aunque lleve el módulo en el token", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["pedidos"], nivelClase: "lectura" }),
      );
      const cliente: Partial<JwtPayload> = {
        sub: "c-1",
        role: "cliente",
        modulos: [{ modulo: "pedidos", nivel: "total" }],
      };
      expect(() => guard.canActivate(montarContexto(cliente))).toThrow(ForbiddenException);
    });

    it("el asesor sin el módulo recibe 403 aunque tenga otros", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["pedidos"], nivelClase: "lectura" }),
      );
      expect(() =>
        guard.canActivate(montarContexto(asesor({ modulo: "catalogo", nivel: "total" }))),
      ).toThrow(ForbiddenException);
    });
  });

  describe("matriz de niveles: otorgado × exigido", () => {
    // lectura < edicion < total, acumulativos.
    const esperado: Record<NivelPermiso, Record<NivelPermiso, boolean>> = {
      lectura: { lectura: true, edicion: false, total: false },
      edicion: { lectura: true, edicion: true, total: false },
      total: { lectura: true, edicion: true, total: true },
    };

    for (const otorgado of NIVELES_PERMISO) {
      for (const exigido of NIVELES_PERMISO) {
        const pasa = esperado[otorgado][exigido];
        it(`${otorgado} ante una ruta que exige ${exigido} → ${pasa ? "pasa" : "403"}`, () => {
          const guard = new ModulosGuard(
            montarReflector({ moduloClase: ["pedidos"], nivelClase: exigido }),
          );
          const contexto = montarContexto(asesor({ modulo: "pedidos", nivel: otorgado }));

          if (pasa) expect(guard.canActivate(contexto)).toBe(true);
          else expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
        });
      }
    }
  });

  describe("nivel por defecto", () => {
    it("una ruta con @Modulo pero sin @Nivel exige total", () => {
      const guard = new ModulosGuard(montarReflector({ moduloClase: ["pedidos"] }));

      expect(() =>
        guard.canActivate(montarContexto(asesor({ modulo: "pedidos", nivel: "edicion" }))),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(montarContexto(asesor({ modulo: "pedidos", nivel: "total" }))),
      ).toBe(true);
    });
  });

  describe("varios módulos en la misma ruta", () => {
    it("basta con tener nivel suficiente en uno de ellos", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["catalogo", "inventario"], nivelClase: "lectura" }),
      );

      expect(
        guard.canActivate(montarContexto(asesor({ modulo: "inventario", nivel: "lectura" }))),
      ).toBe(true);
      expect(
        guard.canActivate(montarContexto(asesor({ modulo: "catalogo", nivel: "edicion" }))),
      ).toBe(true);
    });

    it("no tener ninguno de los dos sigue siendo 403", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["catalogo", "inventario"], nivelClase: "lectura" }),
      );
      expect(() =>
        guard.canActivate(montarContexto(asesor({ modulo: "pedidos", nivel: "total" }))),
      ).toThrow(ForbiddenException);
    });
  });

  describe("herencia clase → handler", () => {
    it("el nivel del handler sube el listón del que declara la clase", () => {
      const guard = new ModulosGuard(
        montarReflector({ moduloClase: ["pedidos"], nivelClase: "lectura", nivelHandler: "total" }),
      );
      expect(() =>
        guard.canActivate(montarContexto(asesor({ modulo: "pedidos", nivel: "edicion" }))),
      ).toThrow(ForbiddenException);
    });

    it("el módulo del handler sustituye al de la clase", () => {
      const guard = new ModulosGuard(
        montarReflector({
          moduloClase: ["catalogo"],
          moduloHandler: ["inventario"],
          nivelClase: "edicion",
        }),
      );
      expect(
        guard.canActivate(montarContexto(asesor({ modulo: "inventario", nivel: "edicion" }))),
      ).toBe(true);
      expect(() =>
        guard.canActivate(montarContexto(asesor({ modulo: "catalogo", nivel: "total" }))),
      ).toThrow(ForbiddenException);
    });
  });
});
