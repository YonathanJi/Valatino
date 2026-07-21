import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  NotEquals,
} from "class-validator";
import { CATEGORIAS_PRODUCTO } from "@valatino/types";

const MENSAJE_CATEGORIA = `La categoría debe ser una de: ${CATEGORIAS_PRODUCTO.join(", ")}`;

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "El precio debe ser mayor que cero" })
  precio!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagenes?: string[];

  @IsString()
  @IsIn(CATEGORIAS_PRODUCTO, { message: MENSAJE_CATEGORIA })
  categoria!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock_disponible?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug debe ser kebab-case (minúsculas, números y guiones)",
  })
  slug?: string;
}

export class UpdateProductoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "El precio debe ser mayor que cero" })
  precio?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagenes?: string[];

  @IsOptional()
  @IsString()
  @IsIn(CATEGORIAS_PRODUCTO, { message: MENSAJE_CATEGORIA })
  categoria?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug debe ser kebab-case (minúsculas, números y guiones)",
  })
  slug?: string;
}

export class AjustarStockDto {
  @IsInt({ message: "cantidad debe ser un número entero" })
  @NotEquals(0, { message: "El ajuste no puede ser cero" })
  cantidad!: number;
}
