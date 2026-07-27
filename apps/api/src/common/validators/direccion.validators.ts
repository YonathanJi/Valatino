import { registerDecorator, type ValidationArguments, type ValidationOptions } from "class-validator";
import { codigoPostalValido } from "@valatino/types";
import { municipioCanonico } from "../datos/municipios";

/**
 * Código postal español: 5 dígitos cuyos dos primeros son una provincia real.
 *
 * Antes la API solo comprobaba `MaxLength(10)`, así que aceptaba «abc» y el
 * front era la única red. Ya sabemos lo que pasa cuando conviven dos versiones
 * de la web: la validación que solo vive en el navegador no existe.
 */
export function EsCodigoPostal(options?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: "esCodigoPostal",
      target: objeto.constructor,
      propertyName: propiedad,
      options: {
        message: "$property debe ser un código postal español de 5 dígitos",
        ...options,
      },
      validator: {
        validate(valor: unknown) {
          return typeof valor === "string" && codigoPostalValido(valor);
        },
      },
    });
  };
}

/**
 * El municipio tiene que existir EN LA PROVINCIA del código postal.
 *
 * No basta con que exista en España: «Barcelona» con un CP de Madrid es un
 * error de datos, no una dirección. Se valida contra el diccionario del INE, y
 * la comparación ignora mayúsculas y acentos — quien teclea no tiene que
 * acertar la tilde, pero lo que se guarda es el nombre oficial.
 *
 * @param campoCP nombre de la propiedad hermana que lleva el código postal
 */
export function EsMunicipioDelCP(campoCP: string, options?: ValidationOptions) {
  return function (objeto: object, propiedad: string) {
    registerDecorator({
      name: "esMunicipioDelCP",
      target: objeto.constructor,
      propertyName: propiedad,
      constraints: [campoCP],
      options: {
        message:
          "$property no es un municipio de la provincia que corresponde al código postal",
        ...options,
      },
      validator: {
        validate(valor: unknown, args?: ValidationArguments) {
          if (typeof valor !== "string") return false;
          const cp = (args?.object as Record<string, unknown>)?.[campoCP];
          // Si el CP no es válido, su propio decorador ya lo señala: aquí no se
          // añade un segundo error sobre el mismo fallo.
          if (typeof cp !== "string" || !codigoPostalValido(cp)) return true;
          return municipioCanonico(cp, valor) !== null;
        },
      },
    });
  };
}
