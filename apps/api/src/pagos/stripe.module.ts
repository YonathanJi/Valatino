import { Module } from "@nestjs/common";
import { StripeService } from "./stripe.service";

/**
 * StripeService en su propio módulo porque lo consumen dos módulos que ya están
 * encadenados: PagosModule (webhooks, PaymentIntents) y PedidosModule (los
 * reembolsos desde el backoffice). PagosModule importa PedidosModule, así que
 * hacerlo al revés crearía una dependencia circular y obligaría a forwardRef.
 * El servicio solo depende de ConfigService, de modo que aislarlo no arrastra
 * nada más.
 */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
