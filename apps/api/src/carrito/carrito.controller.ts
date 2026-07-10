import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { CarritoService } from "./carrito.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { AddItemDto, UpdateItemDto } from "./dto/carrito.dto";

type SessionRequest = Request & { sessionId?: string; user?: { sub: string } };

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
  addItem(@Req() req: SessionRequest, @Body() dto: AddItemDto) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.addItem(sessionId, dto.producto_id, dto.cantidad, userId);
  }

  @Patch("items/:id")
  updateItem(
    @Req() req: SessionRequest,
    @Param("id", new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.updateItem(sessionId, itemId, dto.cantidad, userId);
  }

  @Delete("items/:id")
  removeItem(
    @Req() req: SessionRequest,
    @Param("id", new ParseUUIDPipe()) itemId: string,
  ) {
    const { sessionId, userId } = this.getSession(req);
    return this.carritoService.removeItem(sessionId, itemId, userId);
  }

  @Post("fusionar")
  @UseGuards(JwtGuard)
  fusionar(@Req() req: SessionRequest) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user!.sub;
    return this.carritoService.fusionarCarrito(sessionId, userId);
  }
}
