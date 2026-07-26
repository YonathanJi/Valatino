import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ModulosGuard } from "./modulos.guard";
import type { JwtPayload, StaffModulo } from "@valatino/types";

/**
 * Doble del Reflector: el guard solo usa getAllAndOverride([handler, clase]),
 * que resuelve el metadato del handler y, si no lo hay, el de la clase. Se
 * reproduce esa precedencia para poder fijar la herencia clase→handler.
 */
function montarReflector(metadatos: { handler?: unknown; clase?: unknown }) {
  return {
    getAllAndOverride: (_clave: string, [handler, clase]: unknown[]) => {
      const valores = new Map<unknown, unknown>([
        ["HANDLER", metadatos.handler],
        ["CLASE", metadatos.clase],
      ]);
      return valores.get(handler) ?? valores.get(clase);
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

function asesor(modulos: StaffModulo[]): Partial<JwtPayload> {
  return { sub: "u-1", role: "asesor", modulos };
}

describe("ModulosGuard", () => {
  it("deja pasar cuando la ruta no declara módulo", () => {
    const guard = new ModulosGuard(montarReflector({}));
    expect(guard.canActivate(montarContexto(undefined))).toBe(true);
  });

  it("el admin pasa sin tener filas en staff_modulos", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    expect(guard.canActivate(montarContexto({ sub: "a-1", role: "admin" }))).toBe(true);
  });

  it("el asesor pasa si tiene el módulo otorgado", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    expect(guard.canActivate(montarContexto(asesor(["pedidos", "catalogo"])))).toBe(true);
  });

  it("el asesor sin el módulo recibe 403", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    expect(() => guard.canActivate(montarContexto(asesor(["catalogo"])))).toThrow(
      ForbiddenException,
    );
  });

  it("el asesor sin ningún módulo recibe 403", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    expect(() => guard.canActivate(montarContexto(asesor([])))).toThrow(ForbiddenException);
  });

  it("un cliente no entra al backoffice aunque lleve el módulo en el token", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    const cliente = { sub: "c-1", role: "cliente" as const, modulos: ["pedidos" as StaffModulo] };
    expect(() => guard.canActivate(montarContexto(cliente))).toThrow(ForbiddenException);
  });

  it("una petición sin usuario recibe 403", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "pedidos" }));
    expect(() => guard.canActivate(montarContexto(undefined))).toThrow(ForbiddenException);
  });

  it("el módulo declarado en el handler tiene prioridad sobre el de la clase", () => {
    const guard = new ModulosGuard(montarReflector({ clase: "catalogo", handler: "inventario" }));
    expect(guard.canActivate(montarContexto(asesor(["inventario"])))).toBe(true);
    expect(() => guard.canActivate(montarContexto(asesor(["catalogo"])))).toThrow(
      ForbiddenException,
    );
  });
});
