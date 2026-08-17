import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ProductosController } from "./productos.controller";
import { ProductosService } from "./productos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";

/**
 * Un solo tema: que **subir una imagen funcione**.
 *
 * Parece de perogrullo y por eso no estaba probado, y por eso estuvo roto seis
 * días (11/08 → 17/08) sin que ningún test se enterara: los límites del
 * multipart vivían en un objeto literal que nadie ejecutaba. `parts: 1` no
 * admite una parte, admite cero — busboy hace `if (++parts === limite)` — y
 * cada intento moría con un `Too many parts` en inglés antes de tocar Storage.
 *
 * Lo que se fija aquí no son los números, es la CONSECUENCIA: que el fichero
 * llegue al servicio. Si mañana alguien vuelve a apretar `parts`, o añade un
 * campo al formulario sin subir `fields`, esto se pone rojo en local en vez de
 * en el móvil de Jonathan.
 *
 * Va con `supertest` contra la app de verdad y no con un `req` de mentira a
 * propósito: el primer intento de reproducirlo con un `Readable` falso daba
 * «sin fichero» hasta con los límites buenos, o sea que habría «probado» un
 * fallo que no existe y dejado pasar el que sí.
 */

/** WebP mínimo con la firma que exige `esImagenValida()`: "RIFF"…"WEBP" */
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.from("VP8 relleno-de-prueba"),
]);

/** Un PNG de verdad, para el caso de que el navegador no dé WebP */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("relleno"),
]);

describe("ProductosController · subir imagen", () => {
  let app: INestApplication;
  let subidas: Array<{ bytes: number; mimetype: string }>;

  beforeAll(async () => {
    subidas = [];
    const pasa = { canActivate: () => true };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductosController],
      providers: [
        {
          provide: ProductosService,
          useValue: {
            subirImagen: (imagen: Buffer, mimetype: string) => {
              subidas.push({ bytes: imagen.length, mimetype });
              return { url: "https://proyecto.supabase.co/…/nueva.webp" };
            },
          },
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue(pasa)
      .overrideGuard(RolesGuard)
      .useValue(pasa)
      .overrideGuard(ModulosGuard)
      .useValue(pasa)
      .overrideGuard(OptionalJwtGuard)
      .useValue(pasa)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    subidas = [];
  });

  // EL test. Es exactamente lo que manda ProductoForm.subirImagen(): un
  // fichero llamado `imagen` y ningún campo de texto.
  it("acepta el envío del panel —un fichero, cero campos— y se lo pasa al servicio", async () => {
    const res = await request(app.getHttpServer())
      .post("/productos/imagen")
      .attach("imagen", WEBP, { filename: "imagen.webp", contentType: "image/webp" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: "https://proyecto.supabase.co/…/nueva.webp" });
    expect(subidas).toEqual([{ bytes: WEBP.length, mimetype: "image/webp" }]);
  });

  // Safari viejo no da WebP en canvas.toBlob() y cae a PNG, con el nombre
  // «imagen.webp» igualmente: manda el mimetype, no la extensión.
  it("acepta PNG aunque el fichero se llame .webp", async () => {
    const res = await request(app.getHttpServer())
      .post("/productos/imagen")
      .attach("imagen", PNG, { filename: "imagen.webp", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(subidas).toEqual([{ bytes: PNG.length, mimetype: "image/png" }]);
  });

  // La holgura de `fields` existe para que añadir un campo al formulario no
  // vuelva a tumbar la subida entera con un mensaje incomprensible.
  it("sigue aceptando la imagen si el formulario gana un campo de texto", async () => {
    const res = await request(app.getHttpServer())
      .post("/productos/imagen")
      .field("alt", "Quipitos de fresa")
      .attach("imagen", WEBP, { filename: "imagen.webp", contentType: "image/webp" });

    expect(res.status).toBe(201);
    expect(subidas).toHaveLength(1);
  });

  it("rechaza lo que no es una imagen, y no lo sube", async () => {
    const res = await request(app.getHttpServer())
      .post("/productos/imagen")
      .attach("imagen", Buffer.from("%PDF-1.7 esto es un pdf"), {
        filename: "factura.webp",
        contentType: "image/webp",
      });

    expect(res.status).toBe(400);
    expect(subidas).toEqual([]);
  });

  it("pide una imagen cuando no se adjunta ninguna", async () => {
    const res = await request(app.getHttpServer()).post("/productos/imagen");

    expect(res.status).toBe(400);
    expect(subidas).toEqual([]);
  });
});
