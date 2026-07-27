import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { EsTelefono } from "../../common/validators/es-telefono.validator";
import {
  EsCodigoPostal,
  EsMunicipioDelCP,
} from "../../common/validators/direccion.validators";

// Los campos van en snake_case: es el formato en el que la API devuelve las
// direcciones (filas de la tabla) y el que ya usa DireccionSnapshotDto en el
// checkout. Antes eran camelCase y el ValidationPipe global (whitelist +
// forbidNonWhitelisted) rechazaba con 400 todo lo que enviaba /cuenta/perfil.
export class CreateDireccionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_destinatario!: string;

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
  @EsMunicipioDelCP("codigo_postal")
  ciudad!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @EsCodigoPostal()
  codigo_postal!: string;

  /**
   * Se acepta pero **no se usa**: el servicio la recalcula desde el código
   * postal, cuyos dos primeros dígitos son el código de provincia del INE.
   *
   * Sigue siendo opcional en el DTO en vez de desaparecer porque el pipe global
   * usa `forbidNonWhitelisted`: quitarla haría que la web anterior —que la
   * envía— recibiera un 400 al guardar una dirección durante el despliegue.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;

  /** Teléfono de contacto de la entrega. Ver la nota de `DireccionSnapshotDto`. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @EsTelefono()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  es_predeterminada?: boolean;
}

export class UpdateDireccionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_destinatario?: string;

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
  @EsMunicipioDelCP("codigo_postal")
  ciudad?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @EsCodigoPostal()
  codigo_postal?: string;

  /** Ignorada: se recalcula desde el CP. Ver la nota de `CreateDireccionDto`. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "pais debe ser código ISO de 2 letras" })
  pais?: string;

  /** Cadena vacía = borrar el teléfono guardado. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @EsTelefono()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  es_predeterminada?: boolean;
}
