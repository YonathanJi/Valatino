import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "nombre debe tener al menos 2 caracteres" })
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsEmail({}, { message: "email debe ser un correo válido" })
  email?: string;
}
