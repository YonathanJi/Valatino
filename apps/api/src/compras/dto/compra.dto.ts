import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { z } from "zod";
import { IVA_PORCENTAJES, type IvaPorcentaje } from "@valatino/types";

/**
 * El alta de compra llega como multipart/form-data (PDF de la factura +
 * campos de texto), por lo que `items` viaja como JSON serializado y se
 * valida con zod en el controlador (class-validator no puede validar dentro
 * de un string).
 */
export class CrearCompraDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroFactura?: string;

  /** UUID del proveedor (resuelto por CIF en el formulario) */
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;

  /** JSON: [{ "productoId": uuid, "cantidad": entero > 0, "costoUnitario": >= 0 }, ...] */
  @IsString()
  items!: string;
}

export const compraItemsSchema = z
  .array(
    z.object({
      productoId: z.string().uuid(),
      cantidad: z.number().int().positive(),
      costoUnitario: z
        .number()
        .nonnegative("El costo unitario no puede ser negativo")
        // multipleOf con floats es impreciso: validar 4 decimales a mano
        .refine(
          (v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-6,
          "El costo unitario admite hasta 4 decimales",
        ),
      ivaPct: z
        .number()
        .refine((v) => IVA_PORCENTAJES.includes(v as IvaPorcentaje), {
          message: "El IVA de cada línea debe ser 4, 10 o 21",
        }),
    }),
  )
  .min(1, "La compra debe tener al menos una línea")
  .max(200, "Máximo 200 líneas por compra");

export type CompraItemInput = z.infer<typeof compraItemsSchema>[number];
