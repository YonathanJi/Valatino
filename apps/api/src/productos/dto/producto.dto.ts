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
import {
  CATEGORIAS_PRODUCTO,
  IVA_PORCENTAJES,
  TIPOS_VARIANTE,
  type IvaPorcentaje,
  type TipoVariante,
} from "@valatino/types";

const MENSAJE_CATEGORIA = `La categoría debe ser una de: ${CATEGORIAS_PRODUCTO.join(", ")}`;
const MENSAJE_IVA = `El IVA debe ser ${IVA_PORCENTAJES.join(", ")}`;

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

  /**
   * Obligatorio, y **sin valor por defecto a propósito** (migración 062).
   *
   * Un defecto sería inventarse un número que acaba en el modelo 303, y lo peor
   * de un número inventado es que parece puesto. Antes de esto el IVA de una
   * venta no era calculable: el precio es un número sin tipo asociado y el
   * catálogo mezcla el 4, el 10 y el 21.
   */
  @IsIn(IVA_PORCENTAJES, { message: MENSAJE_IVA })
  iva_pct!: IvaPorcentaje;

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

  /**
   * Familia, variante y tipo: **los tres o ninguno** (CHECK de la 057). Es lo que
   * declara que dos productos son el mismo artículo en dos presentaciones, y
   * sustituye a la vieja convención de meterlo en el nombre.
   *
   * Se validan por separado porque el DTO no puede expresar «los tres juntos»;
   * la base de datos es la que lo garantiza de verdad.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  familia?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  variante?: string | null;

  @IsOptional()
  @IsIn(TIPOS_VARIANTE, { message: "variante_tipo debe ser 'sabor' o 'formato'" })
  variante_tipo?: TipoVariante | null;
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

  /**
   * ⚠️ Cambiarlo NO reescribe los pedidos ya vendidos: cada línea guarda su
   * propia copia del tipo (migración 062). Es lo correcto —una factura emitida
   * no cambia sola— pero conviene saberlo si se corrige una errata.
   */
  @IsOptional()
  @IsIn(IVA_PORCENTAJES, { message: MENSAJE_IVA })
  iva_pct?: IvaPorcentaje;

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

  /** Ver `CreateProductoDto`. `null` en los tres saca al producto de su familia. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  familia?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  variante?: string | null;

  @IsOptional()
  @IsIn(TIPOS_VARIANTE, { message: "variante_tipo debe ser 'sabor' o 'formato'" })
  variante_tipo?: TipoVariante | null;
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
