import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { construirOrigenesPermitidos } from "./common/origenes-permitidos";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,           // requerido para verificar firmas de webhooks
    bodyParser: true,
    logger: ["error", "warn", "log"],
  });

  /**
   * ⚠️ Sin esto el límite de peticiones no limita a quien tú crees.
   *
   * Detrás de Render la conexión la abre SU proxy, así que `req.ip` es la IP
   * del proxy y no la del cliente: TODO el mundo comparte el mismo cubo de
   * 100/min. Con cuatro personas navegando a la vez ya se reparten la cuota, y
   * a una sola le basta con gastarla para tumbar la tienda a los demás. Es un
   * problema de disponibilidad tanto como de seguridad.
   *
   * ⚠️⚠️ Y el arreglo fácil es peor: `trust proxy: true` hace que Express se
   * crea el `X-Forwarded-For` ENTERO, y esa cabecera la escribe quien quiera.
   * Cualquiera se inventaría una IP nueva por petición y no habría límite
   * ninguno. Por eso se confía en un número de saltos concreto, nunca en true.
   *
   * Se toma de TRUST_PROXY_HOPS y **por defecto 0** (no confiar en nadie), que
   * es lo correcto en local, donde no hay proxy delante y la cabecera la pone
   * quien llama. NO se deduce de NODE_ENV a propósito: en Render está puesto a
   * `development` (ver ESTADO.md), así que decidir esto con esa variable dejaría
   * producción con la configuración de local.
   *
   * Quedarse CORTO es seguro y pasarse no: con menos saltos de los reales se
   * agrupa gente bajo una IP intermedia (impreciso, pero nadie la falsifica);
   * con más de los reales se lee un valor que pone el atacante.
   *
   * ⚠️⚠️ ESTUVO EN 1 Y ERA DEMASIADO CORTO, y «corto pero seguro» resultó ser
   * también «inútil». La topología real, medida contra producción el 17/08 con
   * `/diagnostico/red`, tiene TRES saltos y no uno:
   *
   *   cliente → Cloudflare → balanceador de Render → el proceso
   *   X-Forwarded-For = "94.73.34.5, 172.71.146.191, 10.199.135.225"
   *
   * Con 1 salto, `req.ip` salía `10.199.135.225` —una IP INTERNA de Render— y
   * además cambiante entre peticiones. O sea que el límite de 100/min no
   * agrupaba por cliente ni por nada estable: no protegía de nada y encima
   * repartía la cuota a ciegas. Es peor que impreciso.
   *
   * Por qué 3 y no 4, que también «funciona» en el caso normal: con 4 se lee
   * una entrada que puede haber escrito el cliente. Medido con las cadenas
   * reales — mandando un X-Forwarded-For inventado a mano:
   *
   *   hops=3 → req.ip = 94.73.34.5      (la de verdad; la mentira se ignora)
   *   hops=4 → req.ip = 198.51.100.99   (la mentira gana)
   *
   * Funciona porque Cloudflare AÑADE la IP real detrás de lo que traiga el
   * cliente, y Render añade dos más: el cliente de verdad queda siempre a
   * profundidad 3, por muchas mentiras que se pongan delante. Comprobado con
   * una y con tres.
   *
   * ⚠️ Y esto se sostiene sobre que NO exista forma de llegar con menos saltos.
   * Comprobado: tanto `api.valatino.es` como `valatino.onrender.com` responden
   * con `Server: cloudflare` y `CF-RAY`. Si algún día se sirviera la API por un
   * host que no pase por Cloudflare, este 3 pasaría a ser falsificable.
   *
   * Lo que 3 NO arregla es el tráfico que entra por el proxy /api de Vercel,
   * que lleva un salto más: ahí `req.ip` es la IP de Vercel y toda la tienda
   * comparte cubo. Eso lo resuelve `throttler-ip-real.guard.ts`, y son
   * complementarios, no alternativos.
   */
  const saltosDeProxy = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10);
  if (Number.isInteger(saltosDeProxy) && saltosDeProxy > 0) {
    app.set("trust proxy", saltosDeProxy);
    Logger.log(`Confiando en ${saltosDeProxy} salto(s) de proxy para la IP`, "Bootstrap");
  } else {
    Logger.warn(
      "TRUST_PROXY_HOPS sin definir: el limite de peticiones agrupara a todo el mundo bajo la IP del proxy",
      "Bootstrap",
    );
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // La lista vive en common/origenes-permitidos.ts porque la comparten CORS y
  // la comprobación de Origin que frena el CSRF: dos listas separadas acaban
  // divergiendo, y el fallo solo se vería al escribir y en producción.
  const origenes = construirOrigenesPermitidos(process.env);

  app.enableCors({
    origin: (origin, callback) => {
      // Peticiones sin Origin (curl, health checks, server-to-server) se permiten
      if (!origin) return callback(null, true);
      // Se deniega sin lanzar: pasar un Error aquí lo convierte en un 500, y un
      // origen no autorizado no es un fallo del servidor. Sin la cabecera
      // Access-Control-Allow-Origin el navegador bloquea igual, pero la
      // respuesta es limpia y no llena los logs de errores internos.
      callback(null, origenes.permite(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  const port = process.env.PORT ?? 4000;
  // 0.0.0.0: obligatorio en Render/contenedores para exponer el puerto
  await app.listen(port, "0.0.0.0");

  Logger.log(`API Valatino escuchando en el puerto ${port}`, "Bootstrap");
}

void bootstrap();
