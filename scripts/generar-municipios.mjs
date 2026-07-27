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
  writeFileSync(join(SALIDA_WEB, `${cpro}.json`), JSON.stringify(lista));
}

console.log(`${filas.length} municipios en ${codigosINE.length} provincias`);
console.log(`  ${SALIDA_API}`);
console.log(`  ${SALIDA_WEB}/{01..52}.json`);

rmSync(extraido, { recursive: true, force: true });
if (temporalDescarga) rmSync(temporalDescarga, { recursive: true, force: true });
