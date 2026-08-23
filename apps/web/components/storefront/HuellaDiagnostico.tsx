import { HUELLA_DESPLIEGUE } from "@lib/tienda/identidad";

/**
 * Un comentario HTML con el commit desplegado y, si la identidad no se pudo traer, el
 * motivo. Invisible para el cliente y `grep`able desde fuera.
 *
 * ⚠️⚠️ POR QUÉ EXISTE, Y LAS DOS SESIONES QUE LO PAGARON:
 *
 *   1. El 22/08 se perdió media hora sin poder distinguir «Vercel todavía no ha
 *      desplegado» de «el arreglo no sirve», porque el commit no cambiaba NADA visible
 *      en el cliente: `identidad.ts` es código de servidor y los tipos se borran al
 *      compilar. Se intentó con `buildId`, con los chunks y con el hash del CSS, y los
 *      tres eran inservibles. Con esto, «¿está desplegado?» es un `curl | grep`.
 *
 *   2. Y las tres páginas legales llevan desde el 22/08 saliendo vacías **sin que se
 *      pueda saber por qué**, porque el `catch` de `getIdentidad` convertía cualquier
 *      fallo en silencio. El 23/08 se descartó el `AbortSignal` —despliegue de 23 h,
 *      `NEXT_PHASE` leído en ejecución, API a 200 en 0,9 s, ISR con `Revalidate 5m`— y
 *      no quedó ninguna hipótesis comprobable desde fuera.
 *
 * ⚠️ NO ES ANDAMIO Y NO SE QUITA. El día que esto vuelva a fallar —por otra causa, en
 * otro despliegue— la respuesta estará en la página en vez de en cuatro horas de
 * bisección. Cuesta 80 bytes de HTML.
 *
 * ⚠️⚠️ Y `-->` SE ESCAPA, que no es paranoia: `fallo` viene del mensaje de un error de
 * red, y un mensaje que lo contuviera cerraría el comentario antes de tiempo y volcaría
 * el resto como texto VISIBLE en la página legal. Es el mismo tipo de descuido que
 * convierte un dato en una inyección.
 */
export function HuellaDiagnostico({ fallo }: { fallo: string | null }) {
  // `split`/`join` y no `replaceAll`: el target de este paquete es anterior a ES2021.
  const limpio = fallo?.split("--").join("‑‑").slice(0, 200);

  const texto = limpio
    ? `valatino ${HUELLA_DESPLIEGUE} · identidad NO disponible · ${limpio}`
    : `valatino ${HUELLA_DESPLIEGUE} · identidad ok`;

  return <div dangerouslySetInnerHTML={{ __html: `<!-- ${texto} -->` }} />;
}
