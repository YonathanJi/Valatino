import { registerDecorator, type ValidationOptions } from "class-validator";
import { nifValido } from "@valatino/types";

/**
 * Valida un NIF, NIE o CIF español reutilizando la regla de `@valatino/types`.
 *
 * Mismo criterio que `EsTelefono`: la aritmética del dígito de control vive en
 * un solo sitio, que es el que comparten la web y la API. Un `@Matches` con la
 * forma copiada aquí comprobaría menos —la forma no ve un dígito de control
 * malo— y se desincronizaría del CHECK de la base en cuanto alguien tocara uno.
 *
 * ⚠️ La base de datos comprueba la FORMA (`nif_forma_valida`, migración 073) y
 * esto comprueba forma **y** dígito. Que la API sea más estricta que la BD es
 * deliberado: así el error sale del formulario, con una explicación, en vez de
 * salir de Postgres como una violación de CHECK que no dice nada.
 */
export function EsNif(options?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: "esNif",
      target: objeto.constructor,
      propertyName: propiedad,
      options: {
        message: "$property debe ser un NIF, NIE o CIF válido (p. ej. 12345678Z o A58818501)",
        ...options,
      },
      validator: {
        validate(valor: unknown) {
          // La cadena vacía se deja pasar: en el emisor significa «todavía no
          // está configurado», y ahí el guardia es `emisor_fiscal()`, que
          // devuelve NULL mientras falte algo. Quien lo exija usa @IsNotEmpty.
          if (valor === "" || valor === null || valor === undefined) return true;
          return typeof valor === "string" && nifValido(valor);
        },
      },
    });
  };
}
