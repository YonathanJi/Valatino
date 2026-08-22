import { Controller, Get } from "@nestjs/common";
import { IdentidadService } from "./identidad.service";

/**
 * Lo que la tienda cuenta de sí misma a quien todavía no ha comprado.
 *
 * ⚠️⚠️ ES PÚBLICO A PROPÓSITO Y SIN GUARDS. El art. 10 de la LSSI-CE exige que la
 * identidad del vendedor sea de acceso «permanente, fácil, directo y gratuito»:
 * pedir sesión para ver quién vende sería justo lo contrario de lo que la norma
 * pide, además de inútil comercialmente — quien duda de si la tienda es real es
 * exactamente quien no tiene cuenta.
 *
 * Lo que hace esto seguro no es quién llama, es QUÉ DEVUELVE: la RPC
 * `identidad_publica()` de la 081 acota los campos en la base, no aquí.
 */
@Controller("tienda")
export class TiendaController {
  constructor(private readonly identidad: IdentidadService) {}

  /** Quién vende y por dónde se le pregunta. Lo pinta el pie y `/aviso-legal`. */
  @Get("identidad")
  publica() {
    return this.identidad.publica();
  }
}
