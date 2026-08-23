import { IsInt, IsString, IsUUID, Length, Min, Max } from "class-validator";

export class AddItemDto {
  @IsUUID("4", { message: "producto_id debe ser un UUID válido" })
  producto_id!: string;

  @IsInt({ message: "cantidad debe ser un número entero" })
  @Min(1, { message: "cantidad debe ser al menos 1" })
  @Max(99, { message: "cantidad máxima por operación: 99" })
  cantidad!: number;
}

export class UpdateItemDto {
  @IsInt({ message: "cantidad debe ser un número entero" })
  @Min(0, { message: "cantidad no puede ser negativa" })
  @Max(99, { message: "cantidad máxima por operación: 99" })
  cantidad!: number;
}

/**
 * El código que el cliente teclea en el carrito (083).
 *
 * ⚠️ NO se valida la FORMA del código más allá de la longitud, y es a propósito: el
 * formato lo elige quien lo crea en el panel, y una regex aquí sería una segunda
 * opinión sobre qué es un código válido. Si existe o no lo dice
 * `codigo_descuento_aplicable`, que es el único sitio que decide.
 *
 * ⚠️ Los límites 3–40 son los MISMOS que el CHECK de `codigos_descuento.codigo`. Si
 * alguien cambia uno tiene que cambiar el otro: aquí es para dar un 400 con un
 * mensaje legible en vez de un error de base, no para decidir nada.
 *
 * ⚠️⚠️ Y `ValidationPipe` va con `forbidNonWhitelisted`, así que este campo tenía que
 * existir aquí o la petición se rechazaba con un 400 antes de llegar al servicio.
 */
export class AplicarCodigoDto {
  @IsString({ message: "El código tiene que ser texto" })
  @Length(3, 40, { message: "Ese código no tiene la longitud de un código de descuento" })
  codigo!: string;
}
