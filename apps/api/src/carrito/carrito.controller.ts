import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { CarritoService } from "./carrito.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { AddItemDto, UpdateItemDto, AplicarCodigoDto } from "./dto/carrito.dto";
import { LIMITE_CARRITO, LIMITE_CODIGO_DESCUENTO } from "../common/limites-peticiones";

type SessionRequest = Request & { sessionId?: string; user?: { sub: string } };

// El carrito es de invitado: no hace falta cuenta para escribir en él, así que
// el techo por IP es lo único que hay. Va en las ESCRITURAS y no en el
// controlador entero: el GET lo pide la barra de navegación en cada carga de
// página, y ahogarlo dejaría la tienda pareciendo rota sin que nadie abusara.
@Controller("carrito")
@UseGuards(OptionalJwtGuard)
export class CarritoController {
  constructor(private readonly carritoService: CarritoService) {}

  private getSession(req: SessionRequest) {
    return {
      sessionId: req.sessionId ?? "",
      userId: req.user?.sub,
    };
  }

  @Get()
  getCarrito(@Req() req: SessionRequest) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.getCarrito(sessionId, userId);
  }

  @Post("items")
  @Throttle(LIMITE_CARRITO)
  addItem(@Req() req: SessionRequest, @Body() dto: AddItemDto) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.addItem(sessionId, dto.producto_id, dto.cantidad, userId);
  }

  @Patch("items/:id")
  @Throttle(LIMITE_CARRITO)
  updateItem(
    @Req() req: SessionRequest,
    @Param("id", new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.updateItem(sessionId, itemId, dto.cantidad, userId);
  }

  @Delete("items/:id")
  @Throttle(LIMITE_CARRITO)
  removeItem(
    @Req() req: SessionRequest,
    @Param("id", new ParseUUIDPipe()) itemId: string,
  ) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.removeItem(sessionId, itemId, userId);
  }

  /**
   * Aplica un código de descuento al carrito.
   *
   * ⚠️ PUT y no POST: aplicar el mismo código dos veces deja el carrito en el mismo
   * estado, así que es idempotente y un reintento del navegador no hace daño.
   *
   * ⚠️⚠️ Y CON SU PROPIO TECHO, mucho más bajo que el del resto del carrito: esta
   * ruta es un oráculo que dice si un código existe, y el carrito no exige cuenta.
   * Ver `LIMITE_CODIGO_DESCUENTO`.
   *
   * Devuelve el carrito entero, no solo el descuento: la pantalla necesita el total
   * nuevo y el porte —que un código de envío gratis también cambia— y pedirlos en
   * otra llamada abriría una ventana en la que enseña dos números que no encajan.
   */
  @Put("codigo")
  @Throttle(LIMITE_CODIGO_DESCUENTO)
  aplicarCodigo(@Req() req: SessionRequest, @Body() dto: AplicarCodigoDto) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.aplicarCodigo(dto.codigo, sessionId, userId);
  }

  /**
   * Quita el código del carrito. Idempotente: quitar el que no hay no es un error.
   *
   * ⚠️ Este NO es un oráculo —no dice nada de ningún código— así que lleva el techo
   * normal del carrito.
   */
  @Delete("codigo")
  @Throttle(LIMITE_CARRITO)
  quitarCodigo(@Req() req: SessionRequest) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.quitarCodigo(sessionId, userId);
  }

  @Post("fusionar")
  @Throttle(LIMITE_CARRITO)
  @UseGuards(JwtGuard)
  fusionar(@Req() req: SessionRequest) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user!.sub;
    return this.carritoService.fusionarCarrito(sessionId, userId);
  }
}
