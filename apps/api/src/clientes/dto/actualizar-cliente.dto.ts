import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Datos de contacto editables de un cliente.
 *
 * El email NO se toca a propósito: es su usuario de acceso (recibe el código
 * OTP ahí) y además el trigger de vinculación por email reasignaría pedidos al
 * cambiarlo, con el riesgo de quitarle o regalarle el historial de otra persona.
 */
export class ActualizarClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "nombre debe tener al menos 2 caracteres" })
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documento?: string;
}
