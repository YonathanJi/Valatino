import { SetMetadata } from "@nestjs/common";
import type { StaffModulo } from "@valatino/types";

export const MODULO_KEY = "modulo";

/**
 * Exige acceso a un módulo del backoffice.
 * El rol admin pasa siempre; los asesores necesitan el módulo otorgado en staff_modulos.
 */
export const Modulo = (modulo: StaffModulo) => SetMetadata(MODULO_KEY, modulo);
