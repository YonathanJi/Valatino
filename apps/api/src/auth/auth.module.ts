import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { UsuariosController } from "./usuarios.controller";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("SUPABASE_JWT_SECRET"),
        signOptions: { expiresIn: "1h" },
      }),
    }),
  ],
  controllers: [UsuariosController],
  providers: [JwtStrategy, JwtGuard, RolesGuard],
  exports: [JwtGuard, RolesGuard, PassportModule],
})
export class AuthModule {}