/**
 * Genera los iconos de marca de Valatino a partir de la geometría del logo.
 *
 *   node scripts/generar-marca.mjs
 *
 * La marca es la **V con el trazo diagonal separado** que pasó Jonathan el 11/09.
 * Se define UNA vez, aquí, en coordenadas 0–100, y de ahí salen los seis ficheros
 * que necesitan las plataformas. El motivo de que sea un generador y no seis
 * imágenes sueltas es el de siempre en este proyecto: **el mismo dato en seis
 * sitios se desincroniza.** El día que el logo cambie se toca este fichero y se
 * vuelve a correr; si en vez de eso hubiera seis PNG en `public/`, el día que se
 * cambie el favicon el icono de Android se quedaría con el logo viejo y nadie se
 * enteraría hasta que alguien instalara la tienda en un móvil.
 *
 * ── POR QUÉ NO USA `sharp` NI NINGUNA LIBRERÍA ──
 *
 * Rasteriza a mano y escribe el PNG con `zlib`, que viene en node. Añadir `sharp`
 * al lockfile —un binario nativo que se compila por plataforma— para cuatro
 * ficheros que se generan una vez cada varios meses no valía el cambio. Son 40
 * líneas de rasterizador y el resultado se ha mirado en pantalla, no supuesto.
 *
 * ⚠️ Lo que este fichero NO hace: no toca `app/portada.png`, que es la foto de la
 * tienda y sigue siendo la imagen social (`og:image`). Solo el LOGO pasa a ser la
 * marca de verdad.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** El negro de la tienda: `--primary: 0 0% 9%` del storefront en `globals.css`. */
const TINTA = [23, 23, 23];

/**
 * Fondo BLANCO y no transparente, y es una decisión, no un descuido:
 *
 *   · En una pestaña de tema oscuro, una V negra sobre transparente desaparece.
 *   · iOS no respeta la transparencia en el icono de pantalla de inicio: la pinta
 *     de negro, y saldría un cuadrado negro con una V negra dentro.
 */
const PAPEL = [255, 255, 255];

/**
 * La V. Siete vértices en orden: borde superior del brazo izquierdo, bajada por su
 * interior hasta la muesca, subida por el interior del brazo derecho, su borde
 * superior, bajada por el exterior hasta la punta, y la punta.
 *
 * Las proporciones son las del logo original (brazo izquierdo pesado, brazo derecho
 * fino, punta achatada), medidas sobre la imagen y normalizadas.
 */
const V = [
  [6.0, 12.0],
  [31.0, 12.0],
  [42.4, 60.9],
  [69.4, 12.0],
  [80.8, 12.0],
  [46.0, 88.0],
  [36.0, 88.0],
];

/**
 * El trazo separado. Su pendiente es EXACTAMENTE la del borde exterior derecho de
 * la V (−0,4575), así que el hueco blanco entre los dos mide lo mismo arriba que
 * abajo. Con pendientes distintas el hueco se abre en cuña y a tamaño pequeño se
 * lee como un borrón.
 *
 * ⚠️⚠️ EL HUECO SON 10 UNIDADES Y ESO ES UNA DECISIÓN DE TAMAÑO PEQUEÑO, no de
 * estética. Ha subido dos veces y las dos por lo mismo:
 *
 *   · 3,9 — lo que salía de medir el logo original. A 32 px son 1,25 px: el
 *     antialiasing lo vuelve un gris y la marca se lee como una V gruesa a secas.
 *   · 6 — corregía eso, hasta que el icono pasó a dibujarse **al 72 %** para darle
 *     aire (ver `ESCALA_ICONO`). Ese 72 % encoge también el hueco: 6 × 0,72 = 4,3
 *     unidades, o sea **1,4 px a 32**, y volvió a verse pegado. Lo dijo Jonathan
 *     mirando la pestaña.
 *   · 10 — con el 72 % aplicado quedan 7,2 unidades, o sea **2,3 px a 32 px**.
 *
 * ⭐ La lección, que vale para cualquier icono: **un detalle no se mide en las
 * unidades del dibujo, se mide en los píxeles del tamaño más pequeño donde tiene que
 * verse.** Al encoger la marca para darle margen, encogí el hueco sin darme cuenta.
 */
const BARRA = [
  [87.2, 19.8],
  [97.1, 19.8],
  [65.9, 88.0],
  [56.0, 88.0],
];

/**
 * ⚠️⚠️ CUÁNTO SE ENCOGE LA MARCA EN EL ICONO **MASKABLE**, y esto es un fallo que
 * casi se desplegó mal: el manifest declaraba `purpose: "maskable"` sobre el icono
 * normal, con el comentario de que «la marca se genera con margen». Era una
 * racionalización, no una medición. **Al medirlo, los CINCO vértices exteriores
 * estaban fuera de la zona segura** — el más lejano a radio 58,1.
 *
 * Un icono maskable se lo queda el sistema para recortarlo a la forma de su
 * lanzador (círculo, cuadrado redondeado, gota…), y solo garantiza que se vea lo
 * que cae dentro del **círculo centrado del 80 %**, o sea radio 40 sobre 100. Todo
 * lo de fuera es zona de sacrificio. Declarar maskable un icono que la pisa es
 * pedirle a Android que recorte las puntas de la V — justo lo que el comentario
 * decía querer evitar.
 *
 * 0,65 y no el 0,69 justo que sale de la medición: la holgura es gratis aquí, y
 * los lanzadores no recortan todos igual.
 */
const ESCALA_MASKABLE = 0.65;

/**
 * ⚠️⚠️ CUÁNTO RESPIRA LA MARCA DENTRO DEL ICONO, y esto lo trajo una comparación
 * concreta: Jonathan puso al lado la pestaña de Anthropic y la de Valatino —«el suyo
 * se ve con bordes suaves, la letra no tan grande, más premium, más centrada»— y
 * tenía razón en las tres cosas.
 *
 * La de fondo es esta: **nuestra V ocupaba el 87 % del ancho del cuadro** y la suya
 * ronda el 55 %. Un logotipo pegado a los bordes se lee como si no cupiera; el aire
 * alrededor es lo que hace que parezca colocado y no metido con calzador. No es
 * refinamiento gratuito: a 16 px en una pestaña, un icono sin margen se confunde con
 * el borde de la propia pestaña.
 *
 * 0,72 deja la marca en un 63 % de ancho — con aire de sobra sin que la V se vuelva
 * un garabato a 16 px, que es donde de verdad se juega esto.
 */
const ESCALA_ICONO = 0.72;

/**
 * El radio de las esquinas del cuadro, en las mismas unidades de 0–100.
 *
 * ⚠️ Redondear obliga a que el PNG lleve **canal alfa**: fuera del redondeo no puede
 * haber blanco, tiene que no haber nada. Eso cambia el formato de RGB a RGBA (ver
 * `png`), y es la razón de que este cambio toque el rasterizador y no solo un número.
 *
 * ⚠️⚠️ Y NO SE APLICA A TODOS LOS ICONOS. `apple-icon` y los del manifest siguen
 * siendo cuadrados plenos **a propósito**: iOS y Android recortan ellos el icono a la
 * forma de su sistema, y darles uno ya redondeado produce una esquina doble —el
 * redondeo de ellos comiéndose el nuestro— que se ve fatal. El redondeo es solo para
 * donde nadie lo va a recortar: la pestaña del navegador y el resultado de Google.
 */
const RADIO_ICONO = 22;

/** La caja que ocupa un conjunto de formas: `[x0, y0, x1, y1]`. */
function caja(formas) {
  const xs = formas.flat().map(([x]) => x);
  const ys = formas.flat().map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Encoge la marca al factor pedido y la **centra ópticamente** en el lienzo.
 *
 * ⚠️⚠️ CENTRAR NO ES ESCALAR RESPECTO AL PUNTO (50,50), que es lo que hacía antes y
 * funcionaba de casualidad: solo da el mismo resultado si la marca ya estaba centrada.
 * En cuanto se tocó la geometría —al separar el trazo de la V el 12/09— la marca dejó
 * de estarlo y se habría quedado pegada a un lado sin que nada avisara.
 *
 * ⭐ Ahora se mide la caja real de las formas y se lleva su centro al del lienzo, así
 * que **la geometría se puede cambiar sin volver a cuadrar nada a mano**.
 */
function encajar(formas, factor) {
  const [x0, y0, x1, y1] = caja(formas);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return formas.map((poli) =>
    poli.map(([x, y]) => [50 + (x - cx) * factor, 50 + (y - cy) * factor]),
  );
}

/** Las dos formas que son la marca. */
const MARCA = [V, BARRA];

/** La marca con aire, para los iconos que se ven tal cual. */
const MARCA_ICONO = encajar(MARCA, ESCALA_ICONO);

/** La misma marca dentro de la zona segura de un icono maskable. */
const MARCA_MASKABLE = encajar(MARCA, ESCALA_MASKABLE);

const dentro = (poli, x, y) => {
  let si = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i];
    const [xj, yj] = poli[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
};

/**
 * Si un punto cae dentro del cuadro con las esquinas redondeadas.
 *
 * Dentro del rectángulo central siempre; en las cuatro esquinas, solo si está a menos
 * de `radio` del centro del arco. Es la definición de un rectángulo redondeado sin
 * necesidad de dibujarlo.
 */
function dentroDelCuadro(x, y, radio) {
  if (radio <= 0) return true;
  const cx = x < radio ? radio : x > 100 - radio ? 100 - radio : x;
  const cy = y < radio ? radio : y > 100 - radio ? 100 - radio : y;
  return Math.hypot(x - cx, y - cy) <= radio;
}

/**
 * Cuánta tinta y cuánto cuadro cubren un píxel, con supersampling 4×4.
 *
 * ⭐ Devuelve las dos cosas de una pasada porque se calculan sobre las mismas
 * muestras: la tinta pinta el color y el cuadro pinta el alfa. Y la tinta se recorta
 * contra el cuadro —`dentroDelCuadro` en la misma condición— para que la marca no
 * asome por fuera del redondeo si algún día crece.
 */
function cobertura(px, py, lado, formas, radio) {
  const M = 4;
  let conTinta = 0;
  let enCuadro = 0;
  for (let sy = 0; sy < M; sy++) {
    for (let sx = 0; sx < M; sx++) {
      const x = ((px + (sx + 0.5) / M) / lado) * 100;
      const y = ((py + (sy + 0.5) / M) / lado) * 100;
      const dentroCuadro = dentroDelCuadro(x, y, radio);
      if (dentroCuadro) enCuadro++;
      if (dentroCuadro && formas.some((f) => dentro(f, x, y))) conTinta++;
    }
  }
  return { tinta: conTinta / (M * M), cuadro: enCuadro / (M * M) };
}

// ── PNG, escrito a pelo ──────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/**
 * Un PNG cuadrado de `lado` píxeles.
 *
 * ⚠️⚠️ SALE EN RGB O EN RGBA SEGÚN SI LLEVA ESQUINAS REDONDEADAS, y no es una
 * preferencia: fuera del redondeo no puede haber blanco —se vería el pico de un
 * cuadrado— sino **nada**, y «nada» necesita canal alfa. Con `radio = 0` se queda en
 * RGB, que es un tercio más pequeño y es lo que quieren iOS y Android.
 *
 * ⚠️ El interior sigue siendo BLANCO y no transparente, y eso no cambia: en una
 * pestaña de tema oscuro, una V negra sobre transparente desaparece. Lo único que se
 * vuelve transparente son las cuatro esquinas.
 */
function png(lado, formas = MARCA_ICONO, radio = 0) {
  const conAlfa = radio > 0;
  const canales = conAlfa ? 4 : 3;
  const filas = [];

  for (let y = 0; y < lado; y++) {
    // El primer byte de cada fila es el filtro de PNG; 0 = sin filtro.
    const fila = Buffer.alloc(1 + lado * canales);
    for (let x = 0; x < lado; x++) {
      const { tinta, cuadro } = cobertura(x, y, lado, formas, radio);
      const base = 1 + x * canales;
      for (let c = 0; c < 3; c++) {
        fila[base + c] = Math.round(PAPEL[c] * (1 - tinta) + TINTA[c] * tinta);
      }
      if (conAlfa) fila[base + 3] = Math.round(cuadro * 255);
    }
    filas.push(fila);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = conAlfa ? 6 : 2; // tipo de color: 6 = RGBA, 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Un `.ico` con VARIOS tamaños dentro.
 *
 * ⚠️ Hace falta aunque ya haya un `icon.svg`: **`/favicon.ico` es la ruta que se
 * pide sola**, sin leer el HTML, y hasta el 11/09 daba 404. La piden agentes que no
 * ejecutan nada y algún rastreador. Un ICO con PNG dentro lo entiende cualquier
 * navegador de esta década.
 *
 * ⚠️⚠️ Y LLEVA UN 48 DENTRO POR UN REQUISITO DE GOOGLE QUE NO SE CUMPLÍA. Para
 * enseñar el favicon junto al resultado de búsqueda, Google pide que sea **un
 * cuadrado múltiplo de 48 px** (48, 96, 144…). El primer ICO se generó a 32×32 —el
 * tamaño clásico de la pestaña— y 32 no es múltiplo de 48, así que en los resultados
 * salía el globo gris genérico mientras en la pestaña se veía la marca. Lo notó
 * Jonathan el 12/09.
 *
 * ⭐ Van los tres (48, 32 y 16) y no solo el 48, porque cada uno sirve a un sitio: el
 * navegador coge el que mejor le encaje para la pestaña —donde 48 escalado a 16 se
 * emborrona— y Google coge el mayor. Un ICO es un contenedor de varias imágenes
 * justamente para esto.
 *
 * ⚠️⚠️ Y EL ORDEN IMPORTA, que es la clase de detalle que solo se ve mirando el HTML:
 * **Next lee la PRIMERA imagen del ICO para escribir el `sizes` del `<link>`**. Con
 * los tamaños en orden ascendente publicaba `sizes="16x16"` —peor aún que el `32x32`
 * de antes, y es justo el atributo que lee Google—. En orden descendente publica
 * `sizes="48x48"`, que es lo que se quiere. El navegador sigue eligiendo por su
 * cuenta la imagen que mejor le encaje: el `sizes` es una pista, no una imposición.
 *
 * ⚠️ Lo que esto NO arregla: la espera. Google refresca los favicons en su propio
 * ciclo de rastreo, así que el cambio tarda días o semanas en verse en los
 * resultados. Cumplir el requisito quita la causa que sí depende de nosotros.
 */
function ico(lados) {
  // El del navegador y Google: con esquinas redondeadas.
  const imagenes = lados.map((lado) => ({ lado, datos: png(lado, MARCA_ICONO, RADIO_ICONO) }));
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  // Los datos empiezan después de la cabecera y de TODAS las entradas del índice.
  let desplazamiento = 6 + imagenes.length * 16;
  const entradas = imagenes.map(({ lado, datos }) => {
    const e = Buffer.alloc(16);
    e[0] = lado === 256 ? 0 : lado; // 0 significa 256 en el formato
    e[1] = lado === 256 ? 0 : lado;
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32LE(datos.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += datos.length;
    return e;
  });

  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)]);
}

// ── SVG ──────────────────────────────────────────────────────────────────────

const punto = ([x, y]) => `${x},${y}`;
const ruta = (poli) => `M${poli.map(punto).join("L")}Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Valatino">
  <rect width="100" height="100" rx="${RADIO_ICONO}" fill="#fff"/>
  <path d="${ruta(MARCA_ICONO[0])}" fill="#171717"/>
  <path d="${ruta(MARCA_ICONO[1])}" fill="#171717"/>
</svg>
`;

// ── Salidas ──────────────────────────────────────────────────────────────────

const raiz = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, "$1"),
  "..",
);
const web = path.join(raiz, "apps/web");

/**
 * Dónde va cada cosa, y por qué ahí:
 *
 *   · `app/icon.svg`        — Next emite el `<link rel="icon">`. Vectorial, nítido
 *                             a cualquier tamaño y 316 bytes.
 *   · `app/favicon.ico`     — la ruta que se pide sola. Ver la nota de `ico`.
 *   · `app/apple-icon.png`  — pantalla de inicio de iOS. 180 es el tamaño que pide.
 *   · `public/icono-192.png`
 *     `public/icono-512.png`— los del `manifest`, y el 512 hace además de LOGO en
 *                             los datos estructurados (Google pide 112 mínimo).
 *                             Van en `public/` porque los referencia una URL.
 */
const salidas = [
  ["app/icon.svg", Buffer.from(svg, "utf8")],
  ["app/favicon.ico", ico([48, 32, 16])],
  ["app/apple-icon.png", png(180, MARCA_ICONO, 0)],
  ["public/icono-192.png", png(192, MARCA_ICONO, 0)],
  ["public/icono-512.png", png(512, MARCA_ICONO, 0)],
  /**
   * ⚠️ El maskable es un fichero APARTE y no el mismo con otra etiqueta. La marca
   * va encogida al 65 % para caber en la zona segura (ver `ESCALA_MASKABLE`), lo
   * que en el icono normal la dejaría nadando en blanco. Son dos usos con dos
   * requisitos, así que son dos imágenes.
   */
  ["public/icono-maskable-512.png", png(512, MARCA_MASKABLE, 0)],
];

for (const [relativa, datos] of salidas) {
  const destino = path.join(web, relativa);
  fs.writeFileSync(destino, datos);
  console.log(`  ${relativa.padEnd(24)} ${String(datos.length).padStart(6)} bytes`);
}
console.log("\nListo. Los iconos salen de la geometría de este fichero.");
