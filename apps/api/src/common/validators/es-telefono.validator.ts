import { registerDecorator, type ValidationOptions } from "class-validator";
import { telefonoValido } from "@valatino/types";

/**
 * Valida un teléfono español reutilizando la regla de `@valatino/types`.
 *
 * La misma función la usa el formulario del checkout, así que lo que la web
 * acepta es exactamente lo que la API autoriza. Un `@Matches` con la regex
 * copiada aquí se habría desincronizado en cuanto alguien tocara una de las
 * dos, que es lo que ya pasó con el CHECK de `modulo` en la BD.
 *
 * Acepta los espacios y el prefijo `+34` con los que la gente escribe su
 * número; la normalización a 9 dígitos la hace el servicio antes de guardar.
 */
export function EsTelefono(options?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: "esTelefono",
      target: objeto.constructor,
      propertyName: propiedad,
      options: {
        message: "$property debe ser un teléfono español válido (9 dígitos, p. ej. 600 11 22 33)",
        ...options,
      },
      validator: {
        validate(valor: unknown) {
          // La cadena vacía se deja pasar: significa «borrar el teléfono» y el
          // servicio la convierte en NULL. Quien quiera exigirlo usa @IsNotEmpty.
          if (valor === "" || valor === null || valor === undefined) return true;
          return typeof valor === "string" && telefonoValido(valor);
        },
      },
    });
  };
}
