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
  // producción). Además se permiten los despliegues de Vercel (*.vercel.app)
  // para que las preview URLs funcionen sin reconfigurar en cada deploy.
  const origenesPermitidos = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Peticiones sin Origin (curl, health checks, server-to-server) se permiten
      if (!origin) return callback(null, true);
      const permitido =
        origenesPermitidos.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname);
      callback(permitido ? null : new Error(`Origen no permitido por CORS: ${origin}`), permitido);
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
