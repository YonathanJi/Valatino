import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CalificacionesService } from "./calificaciones.service";
import { CalificarDto } from "./dto/calificar.dto";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";

/**
 * Calificar la compra — ruta PÚBLICA, autorizada por el token del pedido.
 *
 * Sin JWT a propósito: se compra como invitado (el registro es por OTP y solo
 * captura el email), así que exigir sesión dejaría fuera a la mayoría de los
 * compradores. El token es un UUID que solo se entrega a quien acredita haber
 * pagado, igual que `GET /pedidos/por-referencia/:ref`.
 *
 * Límite más estricto que el global: aquí no hay sesión que identifique a nadie,
 * así que el token es lo único que frena a quien quiera probar UUIDs al azar.
 */
@Controller("calificaciones")
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class CalificacionesPublicController {
  constructor(private readonly calificaciones: CalificacionesService) {}

  /** Lo ya opinado, para que el formulario aparezca relleno si vuelve a la página. */
  @Get(":token")
  async porToken(@Param("token", ParseUUIDPipe) token: string) {
    // Siempre 200 con `null` cuando no hay nada que devolver, y NO se distingue
    // «token válido sin calificar» de «token que no existe». Es deliberado: si
    // respondiera distinto, esta ruta se convertiría en un oráculo para saber qué
    // UUIDs son pedidos reales. Quien tiene el token de verdad no necesita la
    // diferencia, y quien lo está adivinando no debe obtenerla.
    const calificacion = await this.calificaciones.porToken(token);
    return { calificacion };
  }

  @Post(":token")
  @HttpCode(HttpStatus.OK)
  async calificar(
    @Param("token", ParseUUIDPipe) token: string,
    @Body() dto: CalificarDto,
  ) {
    const calificacion = await this.calificaciones.calificar(token, dto);

    // Mismo mensaje para un token inventado que para uno de otro pedido:
    // enumerar tokens no debe dar ninguna información.
    if (!calificacion) throw new NotFoundException("Pedido no encontrado");

    return calificacion;
  }
}

/**
 * Lectura para el panel.
 *
 * Vive dentro del módulo `dashboard` y no en uno nuevo: es una métrica de
 * gerencia y quien mira las ventas es quien debe mirar esto al lado. Un módulo
 * propio obligaría a tocar el CHECK de `modulo` en la BD, el tipo
 * `StaffModulo`, el sidebar y las plantillas de los seis cargos, sin ganar nada.
 *
 * `lectura` incluye los comentarios (decisión de Jonathan): el texto del cliente
 * es justamente lo accionable, y esconderlo a quien puede ver las medias dejaría
 * la pantalla sin su parte útil.
 */
@Controller("admin/calificaciones")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("dashboard")
@Nivel("lectura")
export class CalificacionesAdminController {
  constructor(private readonly calificaciones: CalificacionesService) {}

  @Get()
  panel(@Query("dias") dias?: string) {
    const ventana = Number(dias);
    return this.calificaciones.panel(
      Number.isFinite(ventana) && ventana > 0 && ventana <= 365 ? ventana : undefined,
    );
  }
}
