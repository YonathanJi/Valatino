import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FavoritosService } from "./favoritos.service";
import { FusionarFavoritosDto } from "./dto/favoritos.dto";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LIMITE_FAVORITOS } from "../common/limites-peticiones";
import type { FavoritosIds, JwtPayload } from "@valatino/types";

/**
 * Los favoritos de quien tiene cuenta.
 *
 * ⚠️⚠️ VA CON `JwtGuard` Y NO CON `OptionalJwtGuard`, al revés que el carrito. No es
 * un descuido: **un invitado no llama aquí nunca.** Sus favoritos viven en el
 * `localStorage` del navegador y solo suben al iniciar sesión, por `fusionar`. Poner
 * el guard opcional invitaría a que alguien añadiera un camino de invitado por
 * detrás y se perdería la razón de todo el diseño (ver la cabecera de la 085: la API
 * duerme 42,5 s y un corazón no puede esperar a que despierte).
 */
@Controller("favoritos")
@UseGuards(JwtGuard)
export class FavoritosController {
  constructor(private readonly favoritosService: FavoritosService) {}

  /**
   * ⚠️ Sin `@Throttle`: esto lo pide la barra de navegación en cada carga de página
   * para pintar el número del corazón. Ahogarlo dejaría la tienda pareciendo rota sin
   * que nadie estuviera abusando. Es el mismo criterio que el `GET` del carrito.
   */
  @Get()
  async listar(@CurrentUser() user: JwtPayload): Promise<FavoritosIds> {
    return { productoIds: await this.favoritosService.listar(user.sub) };
  }

  @Put(":productoId")
  @Throttle(LIMITE_FAVORITOS)
  @HttpCode(204)
  guardar(
    @CurrentUser() user: JwtPayload,
    @Param("productoId", new ParseUUIDPipe()) productoId: string,
  ): Promise<void> {
    return this.favoritosService.guardar(user.sub, productoId);
  }

  @Delete(":productoId")
  @Throttle(LIMITE_FAVORITOS)
  @HttpCode(204)
  quitar(
    @CurrentUser() user: JwtPayload,
    @Param("productoId", new ParseUUIDPipe()) productoId: string,
  ): Promise<void> {
    return this.favoritosService.quitar(user.sub, productoId);
  }

  /**
   * Al iniciar sesión: sube lo que el invitado tenía en su navegador y devuelve la
   * lista ya unida.
   *
   * ⚠️ Se llama junto a `/carrito/fusionar` y `/pedidos/vincular`, que ya van en
   * paralelo en `AuthForms` y en el callback de acceso. Como los tres son
   * idempotentes, repetirlos no rompe nada.
   */
  @Post("fusionar")
  @Throttle(LIMITE_FAVORITOS)
  async fusionar(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FusionarFavoritosDto,
  ): Promise<FavoritosIds> {
    return { productoIds: await this.favoritosService.fusionar(user.sub, dto.productoIds) };
  }
}
