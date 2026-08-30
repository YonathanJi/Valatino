import { Module } from "@nestjs/common";
import { FavoritosService } from "./favoritos.service";
import { FavoritosController } from "./favoritos.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [FavoritosController],
  providers: [FavoritosService],
  exports: [FavoritosService],
})
export class FavoritosModule {}
