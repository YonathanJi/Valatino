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

  /**
   * Si esta devolución incluye además los gastos de envío (084).
   *
   * Petición del dueño: hasta ahora el porte solo se devolvía al cerrar el pedido
   * por completo, y en una devolución parcial no había forma de devolverlo. El
   * caso real es el pedido que llegó tarde o llegó mal y se le compensa el envío
   * sin que el cliente devuelva la mercancía.
   *
   * ⚠️ Se puede combinar con `lineas` («devuelvo estos artículos Y el porte») o ir
   * sola («solo el porte»), pero NO con `importe`: el importe suelto lo escribe
   * una persona y ya puede incluir lo que quiera, así que sumarle el porte encima
   * cobraría de más sin que nadie lo hubiera pedido. El servicio lo rechaza.
   *
   * ⚠️⚠️ Y NO ES IDEMPOTENTE POR SÍ SOLA: el porte de un pedido se devuelve UNA
   * vez. Si ya estaba devuelto —en un parcial anterior o al cerrar el pedido—, el
   * servicio se niega en vez de cobrarlo otra vez.
   */
  @IsOptional()
  @IsBoolean()
  devolver_envio?: boolean;

  /** Nota interna para la traza contable. No se le muestra al cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
