import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { UsuariosController } from "./usuarios.controller";
import { PermisosService } from "./permisos.service";

// No se registra JwtModule: la API no firma tokens, solo verifica los de
// Supabase — y eso lo hace JwtStrategy contra el JWKS del proyecto. El
// JwtModule que había aquí exigía SUPABASE_JWT_SECRET con getOrThrow (la API no
// arrancaba sin ella) pero JwtService no se inyectaba en ninguna parte.
@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" })],
  controllers: [UsuariosController],
  providers: [JwtStrategy, JwtGuard, RolesGuard, PermisosService],
  exports: [JwtGuard, RolesGuard, PassportModule, PermisosService],
})
export class AuthModule {}