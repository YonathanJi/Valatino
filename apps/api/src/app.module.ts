import { Module, MiddlewareConsumer, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "./supabase/supabase.module";
import { AuthModule } from "./auth/auth.module";
import { ProductosModule } from "./productos/productos.module";
import { CarritoModule } from "./carrito/carrito.module";
import { PagosModule } from "./pagos/pagos.module";
import { PedidosModule } from "./pedidos/pedidos.module";
import { DireccionesModule } from "./direcciones/direcciones.module";
import { InventarioModule } from "./inventario/inventario.module";
import { EmailModule } from "./email/email.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ComprasModule } from "./compras/compras.module";
import { ClientesModule } from "./clientes/clientes.module";
import { GestionHumanaModule } from "./gestion-humana/gestion-humana.module";
import { TiModule } from "./ti/ti.module";
import { EventosModule } from "./eventos/eventos.module";
import { CalificacionesModule } from "./calificaciones/calificaciones.module";
import { HealthController } from "./health.controller";
import { SessionMiddleware } from "./carrito/session.middleware";
import { OrigenCsrfMiddleware } from "./common/origen-csrf.middleware";

/**
 * Los webhooks de los proveedores de pago. Quedan fuera de los middlewares que
 * asumen un navegador detrás: ni traen cookie de sesión ni cabecera Origin, y
 * lo que los autentica es la firma que verifica su propio controlador.
 */
const WEBHOOKS = [
  { path: "pagos/stripe/webhook", method: RequestMethod.POST },
  { path: "pagos/paypal/webhook", method: RequestMethod.POST },
] as const;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    SupabaseModule,
    AuthModule,
    ProductosModule,
    CarritoModule,
    PagosModule,
    PedidosModule,
    DireccionesModule,
    InventarioModule,
    EmailModule,
    DashboardModule,
    ComprasModule,
    ClientesModule,
    GestionHumanaModule,
    TiModule,
    EventosModule,
    CalificacionesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar el middleware de session_id a todas las rutas excepto webhooks
    consumer
      .apply(SessionMiddleware)
      .exclude(...WEBHOOKS)
      .forRoutes("*");

    // Y el freno de CSRF, con la misma exclusión y por el mismo motivo: los
    // webhooks no vienen de un navegador y se autentican con su firma.
    // Va en middleware y no en guard para rechazar antes de tocar nada.
    consumer
      .apply(OrigenCsrfMiddleware)
      .exclude(...WEBHOOKS)
      .forRoutes("*");
  }
}
