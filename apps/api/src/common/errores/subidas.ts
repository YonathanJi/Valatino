import { HttpStatus } from "@nestjs/common";

/**
 * Traduce los errores de límite de Multer a una respuesta controlada.
 *
 * Sin esto acaban en el 500 genérico del filtro: el cliente ve «Error interno
 * del servidor» cuando lo que pasa es que su fichero pesa demasiado, y no tiene
 * forma de saber que la culpa es suya ni cómo arreglarlo.
 *
 * ⚠️ Se reconoce por pato (`name` + `code`) y NO importando `MulterError`.
 * Multer no es dependencia directa de la API: entra por
 * `@nestjs/platform-express`. Importarlo aquí ataría este fichero a un paquete
 * que no declaramos, y que además hoy vive con un override de versión.
 */

const MENSAJES: Record<string, { status: number; message: string }> = {
  LIMIT_FILE_SIZE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: "El archivo supera el tamaño máximo permitido",
  },
  LIMIT_FIELD_VALUE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: "Uno de los campos del formulario es demasiado largo",
  },
  LIMIT_FILE_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "Solo se admite un archivo por envío",
  },
  LIMIT_FIELD_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "El formulario trae más campos de los admitidos",
  },
  LIMIT_PART_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "El formulario trae más partes de las admitidas",
  },
  LIMIT_FIELD_KEY: {
    status: HttpStatus.BAD_REQUEST,
    message: "El nombre de uno de los campos es demasiado largo",
  },
  LIMIT_UNEXPECTED_FILE: {
    status: HttpStatus.BAD_REQUEST,
    message: "El envío incluye un archivo en un campo que no se esperaba",
  },
};

export function traducirErrorDeSubida(
  exception: unknown,
): { status: number; message: string } | null {
  if (typeof exception !== "object" || exception === null) return null;

  const { name, code } = exception as { name?: unknown; code?: unknown };
  if (name !== "MulterError" || typeof code !== "string") return null;

  // Un LIMIT_* que no esté en la tabla sigue siendo culpa de la petición, no
  // del servidor: mejor un 400 que un 500 que dispara alertas por nada.
  return (
    MENSAJES[code] ?? {
      status: HttpStatus.BAD_REQUEST,
      message: "El archivo enviado no se ha podido procesar",
    }
  );
}
