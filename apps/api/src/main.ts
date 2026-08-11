import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

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
   * con más de los reales se lee un valor que pone el atacante. Por eso 1.
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

  // CORS_ORIGIN admite una lista separada por comas (localhost + dominio de
  // producción).
  const origenesPermitidos = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Preview URLs de Vercel: se aceptan SOLO las del propio proyecto, indicando
  // su prefijo en CORS_VERCEL_PREVIEW_PREFIX (p.ej. "valatino" habilita
  // https://valatino-<hash>.vercel.app). Antes se admitía cualquier
  // *.vercel.app, así que bastaba con desplegar ahí para hablar con esta API
  // con `credentials: true` y manipular carrito y checkout de invitados.
  const prefijoPreview = process.env.CORS_VERCEL_PREVIEW_PREFIX?.trim();
  const previewVercel = prefijoPreview
    ? new RegExp(`^${prefijoPreview.replace(/[^a-zA-Z0-9-]/g, "")}-[a-z0-9-]+\\.vercel\\.app$`)
    : null;

  const origenPermitido = (origin: string): boolean => {
    if (origenesPermitidos.includes(origin)) return true;
    if (!previewVercel) return false;
    try {
      const { hostname, protocol } = new URL(origin);
      return protocol === "https:" && previewVercel.test(hostname);
    } catch {
      return false; // Origin malformado
    }
  };

  app.enableCors({
    origin: (origin, callback) => {
      // Peticiones sin Origin (curl, health checks, server-to-server) se permiten
      if (!origin) return callback(null, true);
      // Se deniega sin lanzar: pasar un Error aquí lo convierte en un 500, y un
      // origen no autorizado no es un fallo del servidor. Sin la cabecera
      // Access-Control-Allow-Origin el navegador bloquea igual, pero la
      // respuesta es limpia y no llena los logs de errores internos.
      callback(null, origenPermitido(origin));
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
