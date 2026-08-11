import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

/**
 * Lo que este filtro tiene que garantizar:
 *
 * 1. Ningún 5xx cuenta detalle al navegador, lo lance quien lo lance. Es la
 *    razón de hacerlo en el borde y no en cada sitio: una docena de sitios
 *    interpolan el mensaje de Supabase en un InternalServerErrorException, y la
 *    docena siguiente tampoco se acordará.
 * 2. Ese detalle no se pierde: va al log con el mismo codigo de incidencia que
 *    ve el cliente.
 * 3. Los 4xx pasan su mensaje tal cual — el usuario lo necesita para arreglar
 *    su peticion.
 * 4. Los limites de Multer salen como 413/400, no como 500.
 */

interface Respuesta {
  statusCode: number;
  error: string;
  message: string;
  incidencia?: string;
}

function montarHost(metodo = "POST", url = "/admin/compras") {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: metodo, originalUrl: url }),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    codigoHttp: () => status.mock.calls[0][0] as number,
    cuerpo: () => json.mock.calls[0][0] as Respuesta,
  };
}

function errorDeMulter(code: string) {
  const e = new Error("multer") as Error & { code: string };
  e.name = "MulterError";
  e.code = code;
  return e;
}

describe("HttpExceptionFilter", () => {
  let filtro: HttpExceptionFilter;
  let log: jest.SpyInstance;

  beforeEach(() => {
    filtro = new HttpExceptionFilter();
    log = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe("los 5xx no cuentan nada", () => {
    const DETALLE = 'No se pudo crear la cuenta: duplicate key value violates unique constraint "profiles_pkey"';

    it("depura el mensaje del proveedor aunque el sitio que lanza lo interpole", () => {
      const { host, codigoHttp, cuerpo } = montarHost();

      filtro.catch(new InternalServerErrorException(DETALLE), host);

      expect(codigoHttp()).toBe(500);
      expect(cuerpo().message).not.toContain("profiles_pkey");
      expect(cuerpo().message).not.toContain("duplicate key");
      expect(cuerpo().message).toMatch(/^Error interno del servidor \(incidencia \w{8}\)$/);
    });

    it("el detalle depurado sí va al log, con la misma incidencia", () => {
      const { host, cuerpo } = montarHost();

      filtro.catch(new InternalServerErrorException(DETALLE), host);

      const registrado = log.mock.calls[0].join(" ");
      expect(registrado).toContain(cuerpo().incidencia);
      expect(registrado).toContain("profiles_pkey");
      expect(registrado).toContain("POST /admin/compras");
    });

    it("un error que no es HttpException tampoco filtra su mensaje", () => {
      const { host, codigoHttp, cuerpo } = montarHost();

      filtro.catch(new Error("connect ECONNREFUSED 10.0.0.5:5432"), host);

      expect(codigoHttp()).toBe(500);
      expect(cuerpo().message).not.toContain("ECONNREFUSED");
      expect(cuerpo().incidencia).toHaveLength(8);
    });

    it("dos errores no comparten incidencia", () => {
      const a = montarHost();
      const b = montarHost();

      filtro.catch(new Error("uno"), a.host);
      filtro.catch(new Error("dos"), b.host);

      expect(a.cuerpo().incidencia).not.toBe(b.cuerpo().incidencia);
    });
  });

  describe("los 4xx explican qué pasó", () => {
    it("el mensaje pasa tal cual", () => {
      const { host, codigoHttp, cuerpo } = montarHost();

      filtro.catch(new BadRequestException("Adjunta el PDF de la factura"), host);

      expect(codigoHttp()).toBe(400);
      expect(cuerpo().message).toBe("Adjunta el PDF de la factura");
    });

    it("y no llevan incidencia: no son una avería", () => {
      const { host, cuerpo } = montarHost();

      filtro.catch(new ConflictException("Ya hay una compra con ese número"), host);

      expect(cuerpo().incidencia).toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    });
  });

  describe("límites de subida", () => {
    it("un fichero demasiado grande es 413, no 500", () => {
      const { host, codigoHttp, cuerpo } = montarHost();

      filtro.catch(errorDeMulter("LIMIT_FILE_SIZE"), host);

      expect(codigoHttp()).toBe(413);
      expect(cuerpo().message).toContain("tamaño máximo");
      expect(cuerpo().incidencia).toBeUndefined();
    });

    it("demasiadas partes es 400", () => {
      const { host, codigoHttp } = montarHost();

      filtro.catch(errorDeMulter("LIMIT_PART_COUNT"), host);

      expect(codigoHttp()).toBe(400);
    });

    it("un límite que no conocemos sigue siendo culpa de la petición", () => {
      const { host, codigoHttp } = montarHost();

      filtro.catch(errorDeMulter("LIMIT_QUE_NO_EXISTIA_AYER"), host);

      expect(codigoHttp()).toBe(400);
    });

    it("un Error normal con name distinto NO se confunde con uno de Multer", () => {
      const { host, codigoHttp } = montarHost();
      const impostor = new Error("boom") as Error & { code: string };
      impostor.code = "LIMIT_FILE_SIZE";

      filtro.catch(impostor, host);

      expect(codigoHttp()).toBe(500);
    });
  });
});
