import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CrearProveedorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cif!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}

export class UpdateProveedorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cif?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;
}

/** CIF/NIF canónico: mayúsculas, sin espacios ni guiones */
export function normalizarCif(cif: string): string {
  return cif.toUpperCase().replace(/[\s-]+/g, "");
}
