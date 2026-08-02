import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ReembolsosService } from "./reembolsos.service";
import { TransferenciaService } from "./transferencia.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { nivelEfectivo } from "../auth/nivel-efectivo";
import { UpdateEstadoDto } from "./dto/update-estado.dto";
import { CrearReembolsoDto } from "./dto/crear-reembolso.dto";
import type { JwtPayload, ResultadoReembolso } from "@valatino/types";

@Controller("admin/pedidos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("pedidos")
@Nivel("lectura")
export class AdminPedidosController {
  constructor(
    private readonly pedidosService: PedidosService,
    private readonly reembolsosService: ReembolsosService,
    private readonly transferenciaService: TransferenciaService,
  ) {}

  @Get()
  findAll(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    // Los pedidos que nunca se pagaron y quedaron cancelados al cambiar el
    // cliente de forma de pago. Fuera por defecto: son un paso del checkout
    // ajeno, no trabajo del equipo.
    @Query("incluir_intentos") incluirIntentos?: string,
  ) {
    return this.pedidosService.findAll(
      page,
      limit,
      estado,
      desde,
      hasta,
      incluirIntentos === "true",
    );
  }

  /**
   * Ficha completa: líneas del pedido, datos de envío e historial de todo lo
   * que le ha pasado. Basta con lectura: que el equipo entero pueda ver quién
   * tocó un pedido es justamente el objetivo.
   */
  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.pedidosService.findOneDetalle(id);
  }

  /**
   * El guard solo comprueba el permiso grueso (`edicion` en pedidos); qué
   * transiciones concretas caben depende además del nivel, y eso lo decide
   * transicionesPermitidas: cancelar exige `total`.
   */
  @Patch(":id/estado")
  @Nivel("edicion")
  updateEstado(
    @Param("id") id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidosService.updateEstado(
      id,
      dto.estado,
      nivelEfectivo(user, "pedidos") ?? "lectura",
      user.sub,
    );
  }

  /**
   * Devuelve dinero de un pedido, total o parcialmente. Exige `total` en
   * pedidos: mover dinero fuera es irreversible, igual que cancelar.
   *
   * Antes era @Roles("admin"). Dejarlo así vaciaría de contenido el nivel
   * `total`, que es justo el que se le da a un Director Comercial para que
   * pueda resolver una devolución sin tener acceso a TI.
   *
   * No es un cambio de estado más — cobra el reembolso en Stripe — por eso vive
   * en su propia ruta y no en PATCH :id/estado.
   */
  @Post(":id/reembolso")
  @Nivel("total")
  reembolsar(
    @Param("id") id: string,
    @Body() dto: CrearReembolsoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ResultadoReembolso> {
    return this.reembolsosService.reembolsar(id, dto, user.email, user.sub);
  }

  /**
   * Da por recibida la transferencia de un pedido: pasa a PROCESANDO y su stock
   * —retenido desde que se hizo el pedido— se consume.
   *
   * Exige `total` por lo mismo que el reembolso: es afirmar que ha entrado
   * dinero, y de esa afirmación cuelga que la mercancía salga por la puerta.
   * Quien lo pulsa tiene que ser quien mira el extracto del banco.
   */
  @Post(":id/confirmar-transferencia")
  @Nivel("total")
  confirmarTransferencia(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.transferenciaService.confirmarPago(id, user.sub);
  }
}
