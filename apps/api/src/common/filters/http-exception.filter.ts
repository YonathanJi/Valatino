import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { traducirErrorDeSubida } from "../errores/subidas";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let error: string;
    /**
     * Id de correlación: solo en los 500. El navegador se lleva un mensaje
     * genérico y este código; el detalle se queda en el log con el mismo código
     * al lado. Así se puede atender un «me sale error» sin publicar nombres de
     * tablas ni mensajes de Supabase o Stripe, y sin pedirle al cliente que
     * describa lo indescriptible.
     *
     * En los 4xx no se pone: son errores de la petición, ya llevan su motivo, y
     * un código de incidencia en un «falta el teléfono» solo asusta.
     */
    let incidencia: string | undefined;

    // Los límites de Multer no son HttpException, así que sin esto caerían en
    // el 500 genérico: el cliente vería «error interno» cuando lo que pasa es
    // que su fichero pesa demasiado.
    const limiteSuperado = traducirErrorDeSubida(exception);

    if (limiteSuperado) {
      status = limiteSuperado.status;
      message = limiteSuperado.message;
      error = "PayloadRechazado";
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === "object" &&
        "message" in (exceptionResponse as object)
          ? (exceptionResponse as { message: string | object }).message
          : exception.message;
      error = exception.name;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "";
      error = "InternalServerError";
    }

    /**
     * ⚠️ AQUÍ se corta la fuga, y a propósito en el borde y no en cada sitio
     * que lanza.
     *
     * Por la API hay una docena de `InternalServerErrorException` que
     * interpolan el mensaje del proveedor (`No se pudo crear la cuenta:
     * ${error.message}`). Eso le cuenta al navegador nombres de tablas,
     * restricciones y mensajes crudos de Supabase o Stripe.
     *
     * Depurarlo sitio a sitio es volver a la trampa de la 055: funciona hasta
     * que alguien añade el número trece y no se acuerda. Aquí NINGÚN 5xx puede
     * salir con detalle, lo lance quien lo lance.
     *
     * Y el detalle no se pierde: se va entero al log junto al mismo código que
     * ve el cliente. Los 4xx no se tocan — son errores de la petición y su
     * mensaje es justo lo que el usuario necesita para arreglarla.
     */
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      incidencia = randomUUID().slice(0, 8);

      this.logger.error(
        `[${incidencia}] ${request.method} ${request.originalUrl} -> ${status}` +
          (message ? ` | ${typeof message === "string" ? message : JSON.stringify(message)}` : ""),
        exception instanceof Error ? exception.stack : String(exception),
      );

      message = `Error interno del servidor (incidencia ${incidencia})`;
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(incidencia ? { incidencia } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
