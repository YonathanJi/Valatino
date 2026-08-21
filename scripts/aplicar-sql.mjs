/**
 * Ejecuta ficheros .sql contra la base remota, con ENSAYO REVERTIDO.
 *
 *   node scripts/aplicar-sql.mjs --dry supabase/migrations/080_....sql
 *   node scripts/aplicar-sql.mjs --go  supabase/migrations/080_....sql
 *
 * ── Por qué existe esto y no se usa el CLI de Supabase ───────────────────────
 *
 * ⚠️⚠️ `supabase db push` NO SE PUEDE USAR EN ESTE PROYECTO. El historial de
 * migraciones del remoto está desincronizado con los nombres de los ficheros
 * locales: el CLI lee unas pocas entradas (`001`, `002`, `003` y varias con marca
 * de tiempo) y da las locales `004`–`0xx` por «no aplicadas». Un `push`
 * reaplicaría de la 004 en adelante, y varias de esas migraciones **no son
 * idempotentes** (`cron.schedule` duplicaría tareas, y hay inserts). Se comprobó
 * el 2026-08-22 con `supabase migration list`.
 *
 * ── Lo que aporta, y es el motivo de fondo ───────────────────────────────────
 *
 * ⭐ El `--dry` **aplica de verdad y lo deshace**: `BEGIN`, el fichero, `ROLLBACK`.
 * Es la única forma de ver un error de sintaxis, un guardia que salta o un CHECK
 * que se queja **sin dejar rastro en producción**. Es el «ensayo en transacción
 * revertida» que las migraciones 077 y 078 dicen haber hecho, ahora con un botón.
 *
 * ⚠️ Y todo va en UNA transacción a propósito: en PostgreSQL el DDL es
 * transaccional, así que una migración a medias no existe. O entra entera o no
 * entra. Con `--go`, si algo falla se revierte igual y se dice por qué.
 *
 * ── La conexión ──────────────────────────────────────────────────────────────
 *
 * La contraseña se busca en TRES sitios, en este orden:
 *
 *   1. `DATABASE_URL` completa en el entorno.
 *   2. `supabase/.temp/db-password` — un fichero con la contraseña y nada más.
 *   3. La variable `SUPABASE_DB_PASSWORD`.
 *
 * ⭐ **El fichero es la vía recomendada, y el motivo es de seguridad, no de
 * comodidad.** Una contraseña escrita en un chat o pegada en una línea de
 * comandos deja rastro en sitios que nadie limpia: el historial del terminal
 * (`ConsoleHost_history.txt` en PowerShell), la transcripción de la conversación,
 * y de ahí a donde se copie. En un fichero está en UN sitio, se sabe cuál, y se
 * borra cuando sobra.
 *
 * ⚠️ `supabase/.temp/` está en `.gitignore` **entero** (línea 18), así que ese
 * fichero no puede colarse en un commit ni por descuido. Comprobado con
 * `git check-ignore`, no supuesto.
 *
 * ⚠️ Y OJO CON LA VARIABLE DE ENTORNO, que es la trampa: exportarla en TU
 * terminal no la ve un proceso que ya estaba arrancado, y `setx` escribe en el
 * registro pero solo lo heredan los procesos que nazcan DESPUÉS. O sea que si
 * quien lanza esto es otra herramienta que ya estaba abierta, la variable no
 * llega y el fallo parece de red. El fichero no tiene ese problema.
 *
 * ⚠️ `pooler-url` **NO lleva la contraseña**: el CLI la pide cada vez y no la
 * guarda. Sin ella el driver falla con «client password must be a string», que no
 * dice nada — por eso se comprueba antes y se explica.
 *
 * Requiere el driver `pg`, que está como `devDependency` de la raíz. No lo usa
 * la aplicación —la API habla por el cliente de Supabase, no por Postgres
 * directo—: es solo para esta herramienta.
 *
 * ⚠️ Esto es un workspace de **pnpm**: `npm install` falla aquí con «Unsupported
 * URL Type "workspace:"». Si falta, `pnpm install`.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let Client;
try {
  ({ Client } = require("pg"));
} catch {
  console.error(
    "Falta el driver `pg`. Es `devDependency` de la raíz:\n" +
      "  pnpm install        (y NO `npm install`: esto es un workspace de pnpm)",
  );
  process.exit(2);
}

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, "$1"), "..");

function conexion() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const poolerPath = path.join(raiz, "supabase/.temp/pooler-url");
  if (!fs.existsSync(poolerPath)) {
    throw new Error(
      "No hay DATABASE_URL ni supabase/.temp/pooler-url. Enlaza el proyecto con " +
        "`supabase link` o exporta DATABASE_URL.",
    );
  }

  const url = fs.readFileSync(poolerPath, "utf8").trim();

  // El fichero primero: es la vía recomendada (ver la cabecera). `trim()` porque
  // un editor deja un salto de línea al final y una contraseña con `\n` pegado
  // falla como «autenticación rechazada», que manda a dudar de la contraseña
  // buena.
  const ficheroPass = path.join(raiz, "supabase/.temp/db-password");
  const pass = fs.existsSync(ficheroPass)
    ? fs.readFileSync(ficheroPass, "utf8").trim()
    : process.env.SUPABASE_DB_PASSWORD;

  if (!pass) {
    throw new Error(
      "No hay contraseña de base de datos. Dos formas, y la primera es la buena:\n" +
        "\n" +
        "  1. Un fichero con la contraseña y nada más (está en .gitignore):\n" +
        "     supabase/.temp/db-password\n" +
        "\n" +
        "  2. O la variable SUPABASE_DB_PASSWORD en el entorno de ESTE proceso.\n" +
        "\n" +
        "  La contraseña está en Supabase → Project Settings → Database.\n" +
        "  `supabase/.temp/pooler-url` no la guarda: el CLI la pide cada vez.",
    );
  }

  // Se guarda para poder taparla en la salida. Ver `censurar`.
  secreto = pass;

  // Se inyecta en la parte de credenciales, que viene como `usuario@host`.
  // `encodeURIComponent` porque una contraseña con `@`, `/` o `#` rompería la
  // URL y el error saldría como «host no encontrado», que manda a mirar la red.
  return url.replace(/^(postgresql:\/\/[^:@/]+)@/, `$1:${encodeURIComponent(pass)}@`);
}

/**
 * ⚠️⚠️ TAPA LA CONTRASEÑA EN TODO LO QUE SE IMPRIME, y no es paranoia: la salida
 * de este script se pega en informes y en conversaciones —es literalmente para lo
 * que sirve—, y algunos errores de conexión de `pg` y de Node arrastran la cadena
 * de conexión entera dentro del mensaje. Una vez pegada, la contraseña ya está
 * fuera y hay que rotarla.
 *
 * Se tapan las dos formas en que puede aparecer: tal cual y con
 * `encodeURIComponent` aplicado, que es como viaja dentro de la URL.
 */
let secreto = null;

const censurar = (texto) => {
  let t = String(texto);
  if (!secreto) return t;
  for (const forma of [secreto, encodeURIComponent(secreto)]) {
    if (forma) t = t.split(forma).join("«contraseña oculta»");
  }
  return t;
};

const [modo, ...ficheros] = process.argv.slice(2);

if (!["--dry", "--go"].includes(modo) || ficheros.length === 0) {
  console.error(
    "uso: node scripts/aplicar-sql.mjs --dry|--go fichero.sql [...]\n" +
      "  --dry  aplica y REVIERTE (ensayo)\n" +
      "  --go   aplica y confirma",
  );
  process.exit(2);
}

let cadena;
try {
  cadena = conexion();
} catch (e) {
  // Sin volcado de pila: esto es una instrucción para quien lo lee, no un fallo
  // del programa. Un stack trace hace que parezca roto y esconde el mensaje.
  console.error(censurar(e.message));
  process.exit(2);
}

const cliente = new Client({
  connectionString: cadena,
  ssl: { rejectUnauthorized: false },
});

try {
  await cliente.connect();
} catch (e) {
  console.error(`No se pudo conectar: ${censurar(e.message)}`);
  process.exit(1);
}

let fallo = null;
try {
  await cliente.query("begin");

  for (const f of ficheros) {
    const sql = fs.readFileSync(f, "utf8");
    const res = await cliente.query(sql);

    // Un query multi-sentencia devuelve un array de resultados. Se imprime lo
    // que traiga filas, que es como se leen los ensayos: la migración termina
    // con sus SELECT de comprobación y aquí salen.
    for (const r of Array.isArray(res) ? res : [res]) {
      if (r?.rows?.length) {
        console.log(`\n── ${path.basename(f)} ──`);
        console.log(JSON.stringify(r.rows, null, 1));
      }
    }
    console.log(`ok  ${path.basename(f)}  (${sql.length} bytes)`);
  }
} catch (e) {
  fallo = e;
  console.error(`\nFALLO: ${censurar(e.message)}`);
  if (e.position) console.error(`  posición: ${e.position}`);
  if (e.hint) console.error(`  pista: ${censurar(e.hint)}`);
  if (e.where) console.error(`  dónde: ${censurar(e.where)}`);
} finally {
  if (fallo || modo === "--dry") {
    await cliente.query("rollback");
    console.log(fallo ? "\nREVERTIDO por el fallo" : "\nREVERTIDO (ensayo)");
  } else {
    await cliente.query("commit");
    console.log("\nCONFIRMADO");
  }
  await cliente.end();
}

process.exit(fallo ? 1 : 0);
