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
import { HealthController } from "./health.controller";
import { SessionMiddleware } from "./carrito/session.middleware";

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
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplicar el middleware de session_id a todas las rutas excepto webhooks
    consumer
      .apply(SessionMiddleware)
      .exclude(
        { path: "pagos/stripe/webhook", method: RequestMethod.POST },
        { path: "pagos/paypal/webhook", method: RequestMethod.POST },
      )
      .forRoutes("*");
  }
}
