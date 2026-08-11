/**
 * Genera los datos de municipios a partir del diccionario oficial del INE.
 *
 *   node scripts/generar-municipios.mjs [ruta-al-xlsx]
 *
 * Sin argumento se descarga la edición vigente de
 * https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx
 *
 * Escribe DOS salidas a partir de la misma fuente, para que no puedan
 * desincronizarse:
 *
 *  - `apps/api/src/common/datos/municipios.generado.ts` — el diccionario
 *    completo (~127 KB). Lo usa la API para validar; nunca llega al navegador.
 *  - `apps/web/public/municipios/<cpro>.json` — 52 ficheros de 2 a 7 KB. El
 *    desplegable del checkout se descarga solo el de la provincia que toca.
 *
 * ── El cruce con los códigos postales ──────────────────────────────────────
 *
 * El diccionario del INE **no trae códigos postales**: el INE numera
 * municipios y los CP son de Correos. Por eso hace falta una SEGUNDA fuente
 * (ver `URL_CP`) para poder acotar el desplegable al CP y no solo a la
 * provincia.
 *
 * ⚠️ Esa segunda fuente NO es oficial, así que se cruza contra el INE y **solo
 * se conserva lo que casa exacto**. Lo que no casa se descarta y se cuenta en
 * la salida: es preferible quedarse corto —el formulario tiene una salida a la
 * lista completa de la provincia— que meter un municipio que no existe.
 *
 * ⚠️⚠️ Y por eso el acotado es una AYUDA, nunca una restricción. La API sigue
 * validando contra la provincia del CP y no contra esta tabla. Si algún día
 * esta fuente se queda vieja o pierde un CP, lo peor que pasa es que el cliente
 * tenga que pulsar «ver todos»; nunca que no pueda comprar.
 *
 * Para la API se emite un `.ts` y no un `.json` a propósito: importar JSON
 * exigiría `resolveJsonModule` **y** configurar los assets del build de Nest
 * para que el fichero llegue al `dist`. Si eso falla, la API no arranca en
 * Render — y es la que cobra. Un módulo TypeScript compila como cualquier otra
 * fuente y no puede quedarse fuera del paquete.
 *
 * ¿Por qué ficheros estáticos en `public/` y no un endpoint de la API? Porque
 * Render duerme en el plan gratuito: un endpoint dejaría el formulario de
 * dirección esperando a que despierte. Servidos por el CDN de Vercel no
 * dependen de nada.
 *
 * ¿Y por qué no importarlo en el bundle? Porque son 124 KB que pagaría cada
 * visita al checkout para usar 3.
 *
 * Los nombres se guardan LITERALES del INE, sin darle la vuelta al artículo.
 * Ver la nota de `PROVINCIAS_ES` en @valatino/types: hay municipios con coma
 * legítima en el nombre y cualquier regla de inversión los rompería.
 *
 * Fuente: INE, Instituto Nacional de Estadística — «Relación de municipios y
 * códigos por provincias». Datos de reutilización libre citando la fuente.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVINCIAS_ES } from "../packages/types/index.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_INE = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx";

// Códigos postales españoles con el municipio del INE al que pertenecen.
// Fuente derivada, no oficial: Correos no publica esta tabla libremente.
const URL_CP =
  "https://raw.githubusercontent.com/inigoflores/ds-codigos-postales-ine-es/master/data/codigos_postales_municipios.csv";

// Por debajo de esto se asume que la fuente de CP ha cambiado o se ha roto, y
// se aborta en vez de publicar un acotado a medias. La última medición fue
// 98,19 % de 14.608 filas.
const CRUCE_MINIMO = 0.95;

const SALIDA_API = join(RAIZ, "apps/api/src/common/datos/municipios.generado.ts");
const SALIDA_WEB = join(RAIZ, "apps/web/public/municipios");

function desescapar(xml) {
  return xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Un .xlsx es un zip con XML dentro; se descomprime con el `unzip` del sistema. */
function extraer(rutaXlsx) {
  const tmp = mkdtempSync(join(tmpdir(), "ine-"));
  execFileSync("unzip", ["-o", "-q", rutaXlsx, "-d", tmp]);
  return tmp;
}

function leerCadenasCompartidas(dir) {
  const xml = readFileSync(join(dir, "xl/sharedStrings.xml"), "utf8");
  const cadenas = [];
  for (const si of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
    // Un <si> puede venir partido en varios <t> si la celda tenía formato
    // enriquecido; hay que concatenarlos o el nombre sale cortado.
    const partes = [...si[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]);
    cadenas.push(desescapar(partes.join("")));
  }
  return cadenas;
}

function leerFilas(dir, cadenas) {
  const xml = readFileSync(join(dir, "xl/worksheets/sheet1.xml"), "utf8");
  const filas = [];

  for (const fila of xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    if (Number(fila[1]) < 3) continue; // 1 = título, 2 = cabecera

    const celdas = {};
    // Los atributos van en orden variable (`s="1" t="s"`), así que se captura el
    // bloque entero y se comprueba `t="s"` aparte. Intentar ordenarlos dentro de
    // la regex hacía que el tipo no se detectara y se colaran los índices de la
    // tabla de cadenas como si fueran los valores.
    for (const c of fila[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>(.*?)<\/v>)?<\/c>/gs)) {
      const [, col, atributos, valor] = c;
      if (valor === undefined) continue;
      celdas[col] = /\bt="s"/.test(atributos) ? cadenas[Number(valor)] : valor;
    }

    // B = CPRO (código de provincia), E = nombre del municipio
    if (celdas.B && celdas.E) filas.push({ cpro: String(celdas.B).padStart(2, "0"), nombre: celdas.E });
  }

  return filas;
}

/**
 * CSV con comas dentro de las comillas: «01001,01059,"Pobla de Massaluca, La"».
 * Un `split(",")` parte el nombre justo por donde no debe.
 */
function celdas(linea) {
  const salida = [];
  let actual = "";
  let entreComillas = false;
  for (const c of linea) {
    if (c === '"') { entreComillas = !entreComillas; continue; }
    if (c === "," && !entreComillas) { salida.push(actual); actual = ""; continue; }
    actual += c;
  }
  salida.push(actual);
  return salida;
}

/**
 * Tabla `CP -> municipios`, por provincia y con los municipios referenciados
 * por su POSICIÓN en la lista ya ordenada. Guardar el índice y no el nombre
 * ahorra la mitad del fichero, y de paso hace imposible que aparezca un
 * municipio que no esté en la lista de la provincia.
 */
function construirTablaCP(csv, porProvincia) {
  const porCP = new Map(); // cpro -> { cp -> Set(indice) }
  const descartes = [];
  let casan = 0;
  let total = 0;

  for (const linea of csv.split(/\r?\n/).slice(1)) {
    if (!linea.trim()) continue;
    total++;

    const [cp, , nombre] = celdas(linea);
    const cpro = cp.slice(0, 2);
    const lista = porProvincia.get(cpro);

    // CP con provincia inexistente (el dataset trae algún «00xxx»).
    if (!/^\d{5}$/.test(cp) || !lista) { descartes.push(`${cp} (provincia ${cpro})`); continue; }

    const indice = lista.indexOf(nombre);
    if (indice === -1) {
      // No casa con el INE. Suele ser un CP mal asignado en la fuente, pero
      // también los enclaves reales (Treviño y San Zadornil son municipios de
      // Burgos con CP de Álava), que este modelo no sabe representar porque la
      // provincia se deduce del CP.
      descartes.push(`${cp} -> ${nombre}`);
      continue;
    }

    casan++;
    if (!porCP.has(cpro)) porCP.set(cpro, new Map());
    const deLaProvincia = porCP.get(cpro);
    if (!deLaProvincia.has(cp)) deLaProvincia.set(cp, new Set());
    deLaProvincia.get(cp).add(indice);
  }

  return { porCP, descartes, casan, total };
}

// ── Generación ──────────────────────────────────────────────────────────────

let rutaXlsx = process.argv[2];
let temporalDescarga = null;

if (!rutaXlsx) {
  console.log(`Descargando ${URL_INE}…`);
  const res = await fetch(URL_INE);
  if (!res.ok) throw new Error(`El INE respondió ${res.status}`);
  temporalDescarga = mkdtempSync(join(tmpdir(), "ine-dl-"));
  rutaXlsx = join(temporalDescarga, "diccionario.xlsx");
  writeFileSync(rutaXlsx, Buffer.from(await res.arrayBuffer()));
}

const extraido = extraer(rutaXlsx);
const filas = leerFilas(extraido, leerCadenasCompartidas(extraido));

if (filas.length < 8000) {
  throw new Error(`Solo se leyeron ${filas.length} municipios: el formato del INE ha cambiado`);
}

const porProvincia = new Map();
for (const { cpro, nombre } of filas) {
  if (!porProvincia.has(cpro)) porProvincia.set(cpro, []);
  porProvincia.get(cpro).push(nombre);
}
for (const lista of porProvincia.values()) lista.sort((a, b) => a.localeCompare(b, "es"));

// El dataset y la lista de provincias del paquete tienen que cuadrar exactamente:
// si el INE añade o quita una provincia (no ha pasado en décadas, pero el
// fichero podría cambiar de formato) esto lo caza aquí y no en producción.
const codigosINE = [...porProvincia.keys()].sort();
const codigosPaquete = PROVINCIAS_ES.map((p) => p.codigo).sort();
if (codigosINE.join(",") !== codigosPaquete.join(",")) {
  throw new Error(
    `Los códigos de provincia no cuadran con PROVINCIAS_ES.\n` +
      `  INE:     ${codigosINE.join(" ")}\n` +
      `  paquete: ${codigosPaquete.join(" ")}`,
  );
}

const completo = Object.fromEntries([...porProvincia.entries()].sort(([a], [b]) => a.localeCompare(b)));

// ── Segunda fuente: los códigos postales ────────────────────────────────────

console.log(`Descargando ${URL_CP}…`);
const resCP = await fetch(URL_CP);
if (!resCP.ok) throw new Error(`La fuente de códigos postales respondió ${resCP.status}`);

const { porCP, descartes, casan, total } = construirTablaCP(await resCP.text(), porProvincia);
const proporcion = casan / total;

if (proporcion < CRUCE_MINIMO) {
  throw new Error(
    `Solo casa el ${(proporcion * 100).toFixed(2)} % de los códigos postales con el INE ` +
      `(${casan}/${total}, mínimo ${CRUCE_MINIMO * 100} %). La fuente habrá cambiado: ` +
      `revísala antes de publicar un acotado a medias.`,
  );
}

const cabecera = [
  "// GENERADO — no editar a mano.",
  "// Fuente: INE, «Relación de municipios y códigos por provincias»",
  `// ${URL_INE}`,
  "// Regenerar con: node scripts/generar-municipios.mjs",
  "//",
  "// Nombres literales del INE, sin invertir el artículo: hay municipios con",
  "// coma legítima en el nombre y cualquier regla de inversión los rompería.",
  "",
  "/** Municipios por código de provincia (CPRO del INE), ordenados. */",
  "export const MUNICIPIOS_POR_PROVINCIA: Record<string, readonly string[]> = ",
].join("\n");

mkdirSync(dirname(SALIDA_API), { recursive: true });
writeFileSync(SALIDA_API, `${cabecera}${JSON.stringify(completo, null, 0)};\n`);

mkdirSync(SALIDA_WEB, { recursive: true });
for (const [cpro, lista] of Object.entries(completo)) {
  // `porCP` va con los índices ordenados para que el diff entre ediciones sea
  // legible: sin ordenar, el orden lo decidiría el recorrido del CSV.
  const deLaProvincia = porCP.get(cpro) ?? new Map();
  const tabla = Object.fromEntries(
    [...deLaProvincia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cp, indices]) => [cp, [...indices].sort((a, b) => a - b)]),
  );
  writeFileSync(join(SALIDA_WEB, `${cpro}.json`), JSON.stringify({ municipios: lista, porCP: tabla }));
}

console.log(`${filas.length} municipios en ${codigosINE.length} provincias`);
console.log(
  `${casan} de ${total} códigos postales cruzados con el INE ` +
    `(${(proporcion * 100).toFixed(2)} %); ${descartes.length} descartados`,
);
if (descartes.length) {
  console.log(`  descartados (primeros 5): ${descartes.slice(0, 5).join(" · ")}`);
  console.log("  ⚠️ No se pierde nada: el formulario ofrece la provincia entera si el CP no está.");
}
console.log(`  ${SALIDA_API}`);
console.log(`  ${SALIDA_WEB}/{01..52}.json`);

rmSync(extraido, { recursive: true, force: true });
if (temporalDescarga) rmSync(temporalDescarga, { recursive: true, force: true });
