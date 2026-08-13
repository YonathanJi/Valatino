import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { z } from "zod";
import { IVA_PORCENTAJES, type IvaPorcentaje } from "@valatino/types";

/**
 * El alta de compra llega como multipart/form-data (PDF de la factura +
 * campos de texto), por lo que `items` viaja como JSON serializado y se
 * valida con zod en el controlador (class-validator no puede validar dentro
 * de un string).
 */
export class CrearCompraDto {
  /**
   * Obligatorio y único (migración 054).
   *
   * No es un dato administrativo: **es lo que impide registrar dos veces la
   * misma compra**, y un doble registro duplica el stock porque la RPC suma las
   * unidades de cada línea. Sin él, la única forma de detectar el duplicado era
   * que alguien se acordara.
   */
  @IsString()
  @IsNotEmpty({ message: "El número de la factura es obligatorio" })
  @MaxLength(100)
  numeroFactura!: string;

  /**
   * Fecha de EXPEDICIÓN de la factura del proveedor, `YYYY-MM-DD`.
   *
   * Obligatoria desde la migración 068: es un dato del libro registro de
   * facturas recibidas. La base la acepta nula a propósito, para no romper la
   * API desplegada durante la ventana del despliegue (ver el apartado 3 de la
   * 068); quien la garantiza hoy es este DTO, y la 069 la exigirá también abajo.
   *
   * ⚠️ NO es la fecha que decide en qué trimestre se deduce el IVA: eso lo hace
   * `created_at`, el momento en que la factura queda anotada.
   */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "La fecha de la factura debe ser YYYY-MM-DD",
  })
  fechaFactura!: string;

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
