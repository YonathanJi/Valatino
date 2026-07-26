import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { EventosModule } from "../eventos/eventos.module";

@Global()
@Module({
  imports: [EventosModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}