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
 * Se lee de `DATABASE_URL` si está en el entorno. Si no, se compone con la URL
 * del pooler que deja el CLI (`supabase/.temp/pooler-url`) y la contraseña de
 * `SUPABASE_DB_PASSWORD`.
 *
 * ⚠️ `pooler-url` **NO lleva la contraseña**: el CLI la pide cada vez y no la
 * guarda. Sin `SUPABASE_DB_PASSWORD` esto no puede conectar, y el fallo es un
 * «client password must be a string» que no dice nada — por eso se comprueba
 * antes y se explica.
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
  const pass = process.env.SUPABASE_DB_PASSWORD;

  if (!pass) {
    throw new Error(
      "Falta SUPABASE_DB_PASSWORD.\n" +
        "  `supabase/.temp/pooler-url` no guarda la contraseña (el CLI la pide cada vez).\n" +
        "  Está en Supabase → Project Settings → Database → Database password.\n" +
        "  Sin ella el driver falla con «client password must be a string», que no explica nada.",
    );
  }

  // Se inyecta en la parte de credenciales, que viene como `usuario@host`.
  // `encodeURIComponent` porque una contraseña con `@`, `/` o `#` rompería la
  // URL y el error saldría como «host no encontrado», que manda a mirar la red.
  return url.replace(/^(postgresql:\/\/[^:@/]+)@/, `$1:${encodeURIComponent(pass)}@`);
}

const [modo, ...ficheros] = process.argv.slice(2);

if (!["--dry", "--go"].includes(modo) || ficheros.length === 0) {
  console.error(
    "uso: node scripts/aplicar-sql.mjs --dry|--go fichero.sql [...]\n" +
      "  --dry  aplica y REVIERTE (ensayo)\n" +
      "  --go   aplica y confirma",
  );
  process.exit(2);
}

const cliente = new Client({
  connectionString: conexion(),
  ssl: { rejectUnauthorized: false },
});

await cliente.connect();

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
  console.error(`\nFALLO: ${e.message}`);
  if (e.position) console.error(`  posición: ${e.position}`);
  if (e.hint) console.error(`  pista: ${e.hint}`);
  if (e.where) console.error(`  dónde: ${e.where}`);
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
