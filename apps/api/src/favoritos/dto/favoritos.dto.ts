import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";
import { TOPE_FAVORITOS } from "@valatino/types";

/**
 * La lista de favoritos que traía el invitado en su navegador, al iniciar sesión.
 *
 * ⚠️⚠️ ESTO SE APARTA DE `fusionarCarrito`, Y HAY QUE SABERLO. Allí el carrito
 * anónimo está en la base y el servidor lo LEE: nada de lo que fusiona viene de
 * fuera. Aquí la lista la **manda el cliente**, porque los favoritos de invitado
 * viven en su `localStorage` y el servidor no los ha visto nunca. Es entrada
 * externa y se valida como tal: que sean UUID y que no sean demasiados.
 *
 * ⚠️ El tope es `TOPE_FAVORITOS` importado y no un número escrito aquí. Es el
 * mismo que aplica el navegador al guardar; si divergieran, la fusión recortaría
 * en silencio justo lo que el cliente creía tener guardado.
 */
export class FusionarFavoritosDto {
  @IsArray({ message: "productoIds tiene que ser una lista" })
  @ArrayMaxSize(TOPE_FAVORITOS, {
    message: `No se pueden guardar más de ${TOPE_FAVORITOS} favoritos`,
  })
  @IsUUID("4", { each: true, message: "Cada favorito tiene que ser un UUID válido" })
  productoIds!: string[];
}
