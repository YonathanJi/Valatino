import { Module } from "@nestjs/common";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [CargosController],
  providers: [CargosService],
})
export class TiModule {}
