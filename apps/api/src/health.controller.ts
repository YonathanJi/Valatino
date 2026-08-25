import { Controller, Get } from "@nestjs/common";

/**
 * El commit desplegado, o `local` cuando se corre en casa.
 *
 * ⚠️⚠️ POR QUÉ EXISTE, Y SON DOS SESIONES PAGADAS EN LA WEB MÁS UNA EN LA API.
 *
 * La web tiene `HuellaDiagnostico` desde el 23/08 porque el 22/08 se perdió media hora
 * sin poder distinguir «Vercel todavía no ha desplegado» de «el arreglo no sirve». La
 * API se quedó sin lo mismo, y el 25/08 —desplegando la 084— volvió a pasar exacto:
 * `/health` devolvía `{"status":"ok"}` igual antes y después del despliegue, así que la
 * única forma de saber si Render había terminado era mirar el panel o adivinar por la
 * latencia de un arranque en frío.
 *
 * Con esto, «¿está desplegada la API?» es un `curl | grep`, igual que en la web:
 *
 *     curl -s https://api.valatino.es/health
 *     {"status":"ok","commit":"7b5d230"}
 *
 * ⚠️ `RENDER_GIT_COMMIT` lo pone Render en el build. Se recorta a 7 como en la web
 * (`HUELLA_DESPLIEGUE`) para que las dos huellas se puedan comparar de un vistazo: si
 * la web y la API no dicen el mismo commit, hay una ventana de despliegue abierta — y
 * en este proyecto esa ventana ya ha roto la tienda una vez.
 *
 * ⚠️⚠️ NO ES ANDAMIO Y NO SE QUITA. Y NO ES UNA FUGA: el hash de un commit no dice
 * nada de lo que hay dentro —el repositorio es privado— y el mismo dato ya sale en el
 * HTML público de las páginas legales desde la 083. Lo que sí sería una fuga es añadir
 * aquí la versión de las dependencias o el entorno, así que no se añaden.
 */
const COMMIT = (process.env.RENDER_GIT_COMMIT ?? "local").slice(0, 7);

/** Endpoint público de salud para el health check del proveedor de hosting */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    // `status` va primero y con el mismo valor de siempre: el health check de Render
    // mira el 200, pero cualquier otra cosa que lea este cuerpo esperaba esta forma.
    return { status: "ok", commit: COMMIT };
  }
}
