import { Module } from "@nestjs/common";
import { ComprasController } from "./compras.controller";
import { ComprasService } from "./compras.service";
import { ProveedoresController } from "./proveedores.controller";
import { ProveedoresService } from "./proveedores.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ComprasController, ProveedoresController],
  providers: [ComprasService, ProveedoresService],
})
export class ComprasModule {}
