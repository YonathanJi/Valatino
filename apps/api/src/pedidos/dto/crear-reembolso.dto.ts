import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * Un artículo del pedido que se devuelve.
 *
 * No lleva importe: el precio sale de `pedido_items` en el servidor. Aceptarlo
 * del navegador sería creerle a quien pide el dinero cuánto dinero es.
 */
export class LineaReembolsoDto {
  @IsUUID("4", { message: "pedido_item_id debe ser un identificador válido" })
  pedido_item_id!: string;

  @IsInt({ message: "cantidad debe ser un número entero de unidades" })
  @Min(1, { message: "cantidad debe ser al menos 1" })
  // Tope defensivo: nadie compra 10.000 unidades y así un entero absurdo no
  // llega a multiplicarse por un precio.
  @Max(10_000)
  cantidad!: number;
}

export class CrearReembolsoDto {
  /**
   * Importe a devolver. Si se omite —y no vienen `lineas`— se devuelve todo lo
   * que quede pendiente: así el "reembolso total" no depende de que el panel
   * calcule bien la resta cuando ya hubo devoluciones parciales.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "importe admite como máximo 2 decimales" })
  @Min(0.01, { message: "importe debe ser mayor que 0" })
  importe?: number;

  /**
   * Artículos concretos que se devuelven. Excluyente con `importe`: el total a
   * devolver sale de multiplicar cantidades por precios, y admitir las dos
   * cosas obligaría a decidir cuál gana cuando no cuadran. El servicio rechaza
   * que vengan juntas.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Elige al menos un artículo para devolver" })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaReembolsoDto)
  lineas?: LineaReembolsoDto[];

  /**
   * Si las unidades devueltas vuelven al inventario. Solo se mira cuando hay
   * `lineas`: con un importe suelto no se sabe qué unidades serían.
   */
  @IsOptional()
  @IsBoolean()
  reponer_stock?: boolean;

  /** Nota interna para la traza contable. No se le muestra al cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
