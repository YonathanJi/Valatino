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
  IsUUID,
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

/**
 * Abrir bultos de un producto para vender sus unidades sueltas.
 *
 * Caja y unidad son productos independientes con stock propio, y esta operación
 * es la que ocurre de verdad en la tienda: se abre una caja y aparecen N
 * unidades. Va en una sola transacción (RPC `desempaquetar_producto`) porque
 * hacerlo con dos ajustes de stock a mano permite olvidar el segundo, y entonces
 * o sobran o faltan unidades sin que nadie sepa por qué.
 */
export class DesempaquetarDto {
  /** El bulto que se abre (la caja, el paquete) */
  @IsUUID("4")
  origen_id!: string;

  /** El producto que se obtiene (la unidad suelta) */
  @IsUUID("4")
  destino_id!: string;

  @IsInt({ message: "bultos debe ser un número entero" })
  @Min(1, { message: "Hay que desempaquetar al menos un bulto" })
  bultos!: number;

  @IsInt({ message: "unidades_por_bulto debe ser un número entero" })
  @Min(1, { message: "Cada bulto tiene que traer al menos una unidad" })
  unidades_por_bulto!: number;
}
