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
 *
 * ⚠️⚠️ Y HAY QUE RECONOCERLOS TAMBIÉN POR EL MENSAJE, que no es cinturón y
 * tirantes: es el único camino que se recorre de verdad.
 *
 * `FileInterceptor` pasa el error por `transformException()` de
 * `@nestjs/platform-express` ANTES de que lo vea ningún filtro, y ahí deja de
 * ser un `MulterError`: se convierte en un `BadRequestException` (o
 * `PayloadTooLargeException`) cuyo mensaje es la cadena **en inglés** de
 * Multer. Para cuando llega aquí, `name` ya no es "MulterError" y el `code` se
 * ha perdido por el camino.
 *
 * O sea que mirar solo `name`+`code` dejaba esta traducción sin ejecutarse
 * NUNCA en producción — mientras su test seguía en verde, porque el test
 * fabricaba a mano un `MulterError` que Nest jamás entrega. Jonathan vio un
 * «Too many parts» en inglés el 17/08 con esta tabla ya escrita desde antes.
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
  // Los tres de «cuenta»: el formulario manda lo que manda, así que si no
  // cabe es que el límite del servidor está mal puesto, no que el usuario
  // haya hecho nada raro. El mensaje lo dice, porque un «más partes de las
  // admitidas» a secas se lee como culpa propia y no se reporta: eso son los
  // seis días que estuvo rota la subida de imágenes.
  LIMIT_FILE_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "Esta pantalla admite menos archivos de los que ha enviado. Es un fallo nuestro: avísanos",
  },
  LIMIT_FIELD_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "Esta pantalla admite menos campos de los que ha enviado. Es un fallo nuestro: avísanos",
  },
  LIMIT_PART_COUNT: {
    status: HttpStatus.BAD_REQUEST,
    message: "Esta pantalla admite menos partes de las que ha enviado. Es un fallo nuestro: avísanos",
  },
  LIMIT_FIELD_KEY: {
    status: HttpStatus.BAD_REQUEST,
    message: "El nombre de uno de los campos es demasiado largo",
  },
  LIMIT_UNEXPECTED_FILE: {
    status: HttpStatus.BAD_REQUEST,
    message: "El envío incluye un archivo en un campo que no se esperaba. Es un fallo nuestro: avísanos",
  },
  MISSING_FIELD_NAME: {
    status: HttpStatus.BAD_REQUEST,
    message: "El envío trae un campo sin nombre. Es un fallo nuestro: avísanos",
  },
  // Los de busboy: el cuerpo llegó a medias o cortado. Casi siempre es la
  // conexión, así que lo que toca decir es «vuelve a intentarlo».
  MULTIPART_MALFORMADO: {
    status: HttpStatus.BAD_REQUEST,
    message: "El envío se ha cortado antes de llegar entero. Inténtalo de nuevo",
  },
};

/**
 * El mensaje EN INGLÉS con el que Nest sustituye el error → su código.
 *
 * Las cadenas son las de `multerExceptions` y `busboyExceptions`
 * (`@nestjs/platform-express/multer/multer/multer.constants.js`). Van
 * copiadas y no importadas por lo mismo que arriba: ese paquete no es
 * dependencia directa nuestra, y son subrutas internas suyas.
 *
 * ⚠️ Esto empareja por texto, así que en teoría podría secuestrar un
 * `BadRequestException` nuestro que dijera exactamente «Too many parts». En la
 * práctica no pasa: los mensajes de esta API están todos en castellano, y esa
 * es justo la señal de que el error viene de Multer y no de nosotros.
 */
const CODIGO_POR_MENSAJE: Record<string, string> = {
  "Too many parts": "LIMIT_PART_COUNT",
  "File too large": "LIMIT_FILE_SIZE",
  "Too many files": "LIMIT_FILE_COUNT",
  "Field name too long": "LIMIT_FIELD_KEY",
  "Field value too long": "LIMIT_FIELD_VALUE",
  "Too many fields": "LIMIT_FIELD_COUNT",
  "Unexpected field": "LIMIT_UNEXPECTED_FILE",
  "Field name missing": "MISSING_FIELD_NAME",
  "Multipart: Boundary not found": "MULTIPART_MALFORMADO",
  "Multipart: Malformed part header": "MULTIPART_MALFORMADO",
  "Multipart: Unexpected end of form": "MULTIPART_MALFORMADO",
  "Multipart: Unexpected end of file": "MULTIPART_MALFORMADO",
};

export function traducirErrorDeSubida(
  exception: unknown,
): { status: number; message: string } | null {
  if (typeof exception !== "object" || exception === null) return null;

  const { name, code, message } = exception as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  // 1. El MulterError crudo. Hoy no llega ninguno por `FileInterceptor` —lo
  //    transforma Nest antes—, pero se deja por si algún día se parsea un
  //    multipart a mano, y porque es el reconocimiento fiable.
  if (name === "MulterError" && typeof code === "string") return traducirCodigo(code);

  // 2. El caso REAL: ya transformado por Nest, con el mensaje en inglés.
  if (typeof message === "string") {
    const codigo = CODIGO_POR_MENSAJE[message];
    if (codigo) return traducirCodigo(codigo);
  }

  return null;
}

/**
 * Un LIMIT_* que no esté en la tabla sigue siendo culpa de la petición, no del
 * servidor: mejor un 400 que un 500 que dispara alertas por nada.
 */
function traducirCodigo(code: string): { status: number; message: string } {
  return (
    MENSAJES[code] ?? {
      status: HttpStatus.BAD_REQUEST,
      message: "El archivo enviado no se ha podido procesar",
    }
  );
}
