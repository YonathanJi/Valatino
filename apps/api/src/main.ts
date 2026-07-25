import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,           // requerido para verificar firmas de webhooks
    bodyParser: true,
    logger: ["error", "warn", "log"],
  });

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
