import { ForbiddenException, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { OrigenCsrfMiddleware } from "./origen-csrf.middleware";

/**
 * Lo que hay que sostener aquí es el matiz: se rechaza cuando la petición DICE
 * venir de otro sitio, no cuando no dice nada. Los navegadores ponen Origin en
 * todo lo que escribe, así que la ausencia significa «esto no es un navegador»
 * — Stripe llamando al webhook, un health check, curl— y rechazarlos rompería
 * las integraciones sin frenar ningún ataque.
 */

const ENV_BASE = {
  CORS_ORIGIN: "https://valatino.es,https://www.valatino.es",
  CORS_VERCEL_PREVIEW_PREFIX: "valatino",
} as NodeJS.ProcessEnv;

function montar(env: NodeJS.ProcessEnv = ENV_BASE) {
  const anterior = process.env;
  process.env = { ...anterior, ...env };
  const middleware = new OrigenCsrfMiddleware();
  process.env = anterior;
  return middleware;
}

function peticion(method: string, cabeceras: Record<string, string> = {}): Request {
  return {
    method,
    originalUrl: "/carrito/items",
    headers: cabeceras,
  } as unknown as Request;
}

const RES = {} as Response;

describe("OrigenCsrfMiddleware", () => {
  let middleware: OrigenCsrfMiddleware;
  let siguiente: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    middleware = montar();
    siguiente = jest.fn();
  });

  afterEach(() => jest.restoreAllMocks());

  describe("lo que frena", () => {
    it("rechaza un POST desde una web ajena", () => {
      const req = peticion("POST", { origin: "https://tienda-falsa.example" });

      expect(() => middleware.use(req, RES, siguiente)).toThrow(ForbiddenException);
      expect(siguiente).not.toHaveBeenCalled();
    });

    it("rechaza también DELETE y PATCH", () => {
      for (const metodo of ["DELETE", "PATCH", "PUT"]) {
        const req = peticion(metodo, { origin: "https://tienda-falsa.example" });
        expect(() => middleware.use(req, RES, siguiente)).toThrow(ForbiddenException);
      }
    });

    it("no publica qué orígenes son válidos en el mensaje", () => {
      const req = peticion("POST", { origin: "https://tienda-falsa.example" });

      try {
        middleware.use(req, RES, siguiente);
        fail("tenía que haber lanzado");
      } catch (e) {
        expect((e as Error).message).not.toContain("valatino.es");
      }
    });

    it("un subdominio parecido no cuela", () => {
      const req = peticion("POST", { origin: "https://valatino.es.evil.example" });

      expect(() => middleware.use(req, RES, siguiente)).toThrow(ForbiddenException);
    });

    it("si no hay Origin pero el Referer es ajeno, también se rechaza", () => {
      const req = peticion("POST", { referer: "https://tienda-falsa.example/pagina" });

      expect(() => middleware.use(req, RES, siguiente)).toThrow(ForbiddenException);
    });
  });

  describe("lo que deja pasar", () => {
    it("el propio dominio", () => {
      middleware.use(peticion("POST", { origin: "https://valatino.es" }), RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("el www", () => {
      middleware.use(peticion("POST", { origin: "https://www.valatino.es" }), RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("una preview del propio proyecto en Vercel", () => {
      const req = peticion("POST", { origin: "https://valatino-a1b2c3.vercel.app" });

      middleware.use(req, RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("⚠️ sin Origin ni Referer pasa: no hay navegador detrás", () => {
      middleware.use(peticion("POST"), RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("las lecturas no se tocan, ni con Origin ajeno", () => {
      middleware.use(peticion("GET", { origin: "https://tienda-falsa.example" }), RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("un Referer ilegible se trata como si no viniera", () => {
      middleware.use(peticion("POST", { referer: "no-es-una-url" }), RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });

    it("Origin manda sobre Referer cuando están los dos", () => {
      const req = peticion("POST", {
        origin: "https://valatino.es",
        referer: "https://tienda-falsa.example/pagina",
      });

      middleware.use(req, RES, siguiente);

      expect(siguiente).toHaveBeenCalled();
    });
  });

  describe("sin prefijo de preview configurado", () => {
    it("ninguna URL de Vercel vale", () => {
      const sinPreview = montar({ CORS_ORIGIN: "https://valatino.es" });
      const req = peticion("POST", { origin: "https://valatino-a1b2c3.vercel.app" });

      expect(() => sinPreview.use(req, RES, siguiente)).toThrow(ForbiddenException);
    });
  });
});
