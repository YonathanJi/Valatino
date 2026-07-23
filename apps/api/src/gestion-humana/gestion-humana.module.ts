import { Module } from "@nestjs/common";
import { GestionHumanaController } from "./gestion-humana.controller";
import { GestionHumanaService } from "./gestion-humana.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [GestionHumanaController],
  providers: [GestionHumanaService],
})
export class GestionHumanaModule {}
