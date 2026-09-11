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
 * ⚠️⚠️ EL HUECO SON 6 UNIDADES Y ESO ES UNA DECISIÓN DE TAMAÑO PEQUEÑO, no de
 * estética. Con los 3,9 que salían de medir el logo original, a 32 px el hueco mide
 * 1,25 px: el antialiasing lo convierte en un gris y la marca se lee como una V
 * gruesa a secas, perdiendo justo lo que la distingue. A 6 unidades son 1,9 px y
 * sobrevive. **En la pestaña del navegador esto se ve a 16 px**, así que el tamaño
 * que manda en el diseño es el más pequeño, no el de 512.
 */
const BARRA = [
  [83.2, 19.8],
  [93.1, 19.8],
  [61.9, 88.0],
  [52.0, 88.0],
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

/** La marca encogida hacia el centro del lienzo. `1` la deja como está. */
const escalar = (poli, factor) =>
  poli.map(([x, y]) => [50 + (x - 50) * factor, 50 + (y - 50) * factor]);

/** Las dos formas que son la marca. */
const MARCA = [V, BARRA];

/** La misma marca dentro de la zona segura de un icono maskable. */
const MARCA_MASKABLE = MARCA.map((f) => escalar(f, ESCALA_MASKABLE));

const dentro = (poli, x, y) => {
  let si = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i];
    const [xj, yj] = poli[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
};

/** Cobertura de tinta de un píxel, con supersampling 4×4 para el antialiasing. */
function cobertura(px, py, lado, formas) {
  const M = 4;
  let cubiertas = 0;
  for (let sy = 0; sy < M; sy++) {
    for (let sx = 0; sx < M; sx++) {
      const x = ((px + (sx + 0.5) / M) / lado) * 100;
      const y = ((py + (sy + 0.5) / M) / lado) * 100;
      if (formas.some((f) => dentro(f, x, y))) cubiertas++;
    }
  }
  return cubiertas / (M * M);
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

/** Un PNG RGB de `lado`×`lado`. Sin canal alfa: ver la nota de `PAPEL`. */
function png(lado, formas = MARCA) {
  const filas = [];
  for (let y = 0; y < lado; y++) {
    // El primer byte de cada fila es el filtro de PNG; 0 = sin filtro.
    const fila = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x++) {
      const a = cobertura(x, y, lado, formas);
      for (let c = 0; c < 3; c++) {
        fila[1 + x * 3 + c] = Math.round(PAPEL[c] * (1 - a) + TINTA[c] * a);
      }
    }
    filas.push(fila);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // tipo de color: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Un `.ico` que lleva un PNG dentro.
 *
 * ⚠️ Hace falta aunque ya haya un `icon.svg`: **`/favicon.ico` es la ruta que se
 * pide sola**, sin leer el HTML, y hasta hoy daba 404 (medido el 11/09). La piden
 * agentes que no ejecutan nada y algún rastreador. Un ICO con PNG dentro lo
 * entiende cualquier navegador de esta década.
 */
function ico(lado) {
  const imagen = png(lado);
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(1, 4); // una sola imagen
  const entrada = Buffer.alloc(16);
  entrada[0] = lado; // ancho  (0 significaría 256)
  entrada[1] = lado; // alto
  entrada.writeUInt16LE(1, 4); // planos
  entrada.writeUInt16LE(32, 6); // bits por píxel
  entrada.writeUInt32LE(imagen.length, 8);
  entrada.writeUInt32LE(6 + 16, 12); // desplazamiento de los datos
  return Buffer.concat([cabecera, entrada, imagen]);
}

// ── SVG ──────────────────────────────────────────────────────────────────────

const punto = ([x, y]) => `${x},${y}`;
const ruta = (poli) => `M${poli.map(punto).join("L")}Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Valatino">
  <rect width="100" height="100" fill="#fff"/>
  <path d="${ruta(V)}" fill="#171717"/>
  <path d="${ruta(BARRA)}" fill="#171717"/>
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
  ["app/favicon.ico", ico(32)],
  ["app/apple-icon.png", png(180)],
  ["public/icono-192.png", png(192)],
  ["public/icono-512.png", png(512)],
  /**
   * ⚠️ El maskable es un fichero APARTE y no el mismo con otra etiqueta. La marca
   * va encogida al 65 % para caber en la zona segura (ver `ESCALA_MASKABLE`), lo
   * que en el icono normal la dejaría nadando en blanco. Son dos usos con dos
   * requisitos, así que son dos imágenes.
   */
  ["public/icono-maskable-512.png", png(512, MARCA_MASKABLE)],
];

for (const [relativa, datos] of salidas) {
  const destino = path.join(web, relativa);
  fs.writeFileSync(destino, datos);
  console.log(`  ${relativa.padEnd(24)} ${String(datos.length).padStart(6)} bytes`);
}
console.log("\nListo. Los iconos salen de la geometría de este fichero.");
