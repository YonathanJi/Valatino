import { SetMetadata } from "@nestjs/common";
import type { NivelPermiso, StaffModulo } from "@valatino/types";

export const MODULO_KEY = "modulo";
export const NIVEL_KEY = "nivel_modulo";

/**
 * Módulo(s) del backoffice a los que pertenece la ruta.
 *
 * Varios módulos se leen como O: basta tener nivel suficiente en UNO. Lo exige
 * el listado de productos con borradores, que sirve tanto a Catálogo como a
 * Inventario. Mismo criterio que @Roles("admin", "asesor").
 */
export const Modulo = (...modulos: StaffModulo[]) => SetMetadata(MODULO_KEY, modulos);

/**
 * Nivel mínimo que exige la ruta. Va aparte de @Modulo para que la clase
 * declare el módulo una sola vez y cada handler solo tenga que subir el listón:
 *
 *   @Controller("admin/pedidos") @Modulo("pedidos") @Nivel("lectura")
 *   class … {
 *     @Get()                        findAll()    {}   // hereda lectura
 *     @Patch(":id/estado") @Nivel("edicion") … {}
 *     @Post(":id/reembolso") @Nivel("total") … {}
 *   }
 *
 * Una ruta con @Modulo pero sin @Nivel exige `total`: olvidarlo cierra la
 * pantalla y se ve en la primera prueba, mientras que un default permisivo
 * dejaría abierto de par en par el siguiente POST que alguien añada.
 */
export const Nivel = (nivel: NivelPermiso) => SetMetadata(NIVEL_KEY, nivel);
