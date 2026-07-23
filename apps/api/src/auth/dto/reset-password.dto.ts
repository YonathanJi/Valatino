import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: "password debe tener al menos 8 caracteres" })
  @MaxLength(72)
  password!: string;
}
