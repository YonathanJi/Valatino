/**
 * La URL absoluta de la API. **Este módulo NO lleva `"use client"`, y eso es todo su
 * propósito.**
 *
 * ── LA AVERÍA QUE LO TRAJO, PORQUE ES LA TRAMPA MÁS SUTIL QUE HA DADO ESTE PROYECTO ──
 *
 * Las tres páginas legales salieron VACÍAS en producción desde el 22/08 al 23/08, y
 * dos sesiones enteras no dieron con el motivo. `getIdentidad` importaba `API_URL` de
 * `@lib/api/client`, que empieza por `"use client"` — y cuando un componente de
 * SERVIDOR importa un valor de un módulo de cliente, Next no le da el valor: le da un
 * **stub que lanza**. Así que `${API_URL}` interpolaba el código fuente de una función
 * y `fetch` recibía esto:
 *
 *     TypeError: Failed to parse URL from function(){throw Error("Attempted to call
 *     API_URL() from the server but API_URL is on the client…
 *
 * Y el `catch` de `getIdentidad` lo convertía en la identidad vacía, que es
 * indistinguible de «la tienda todavía no ha configurado sus datos». Silencio total.
 *
 * ⚠️⚠️ POR QUÉ COSTÓ TANTO, Y ES LA LECCIÓN. La comparación que se hizo el 22/08 era
 * la correcta —`productos/[slug]` hace el MISMO fetch a la MISMA API y sí trae datos—
 * pero se sacó la conclusión equivocada: se miró el `signal` y se culpó al
 * `AbortSignal`. La diferencia de verdad era invisible en la línea del `fetch`, porque
 * estaba en el **import**: `productos/[slug]` y `ProductoGrid` declaraban su propia
 * copia de `API_URL` y por eso funcionaban.
 *
 * ⚠️ Tres definiciones del mismo valor, y una de ellas envenenada según quién la
 * importase. Es el patrón de siempre —el mismo dato en varios sitios— con un disfraz
 * nuevo: aquí las copias no DIVERGÍAN en su valor, divergían en si el valor existía.
 *
 * ⭐ Se arregló haciendo VISIBLE el fallo (ver `HuellaDiagnostico`), no razonando más:
 * el motivo apareció en el HTML del primer build.
 *
 * ── LA REGLA, PARA QUE NO VUELVA ──
 *
 * ⚠️⚠️ Todo lo que un componente de SERVIDOR necesite importar tiene que vivir en un
 * módulo SIN `"use client"`. `@lib/api/client` es de navegador —lleva la sesión de
 * Supabase y el proxy `/api` para que la cookie sea de primera parte— y por eso está
 * marcado; lo que no puede es ser además el sitio donde vive un valor que el servidor
 * necesita. Ese valor vive aquí, y de aquí lo leen los dos lados.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
