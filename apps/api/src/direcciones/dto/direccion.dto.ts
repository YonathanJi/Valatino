import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class CreateDireccionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombreDestinatario!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  linea1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linea2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ciudad!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigoPostal!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provincia!: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;

  @IsOptional()
  @IsBoolean()
  esPredeterminada?: boolean;
}

export class UpdateDireccionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombreDestinatario?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  linea1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linea2?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  codigoPostal?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provincia?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;

  @IsOptional()
  @IsBoolean()
  esPredeterminada?: boolean;
}
