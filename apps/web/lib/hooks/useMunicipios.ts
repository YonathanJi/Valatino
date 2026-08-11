"use client";

import { useEffect, useState } from "react";
import { codigoPostalValido } from "@valatino/types";

/**
 * Municipios de un código postal, y los de su provincia como respaldo.
 *
 * Se descargan de `/municipios/<cpro>.json`, ficheros estáticos generados desde
 * el diccionario del INE cruzado con una tabla de códigos postales (ver
 * `scripts/generar-municipios.mjs`). Tres decisiones detrás de eso:
 *
 * - **No van en el bundle**: son 277 KB para usar los 7 KB de una provincia.
 * - **No van por la API**: Render duerme en el plan gratuito, y el formulario de
 *   dirección no puede quedarse esperando a que despierte. Servidos por el CDN
 *   de Vercel no dependen de nada que se pueda dormir.
 * - **El fichero se cachea en memoria por provincia**: volver atrás y corregir
 *   el CP es lo más normal del mundo y no debería repetir la descarga.
 *
 * ⚠️ `delCP` ACOTA, NO RESTRINGE. La tabla de códigos postales no es oficial
 * —Correos no la publica— así que puede faltarle un CP o un municipio. Por eso
 * viene acompañada de `municipios`, la provincia entera, y el formulario deja
 * llegar a ella. Si `delCP` sale vacío no es un error: es un CP que la fuente
 * no conoce, y entonces se ofrece la provincia como se hacía antes.
 */

interface DatosProvincia {
  municipios: readonly string[];
  /** CP -> posiciones dentro de `municipios`. Guardar el índice ahorra la mitad del fichero. */
  porCP: Record<string, readonly number[]>;
}

const VACIO: DatosProvincia = { municipios: [], porCP: {} };

const cache = new Map<string, DatosProvincia>();

export function useMunicipios(codigoPostal: string) {
  const cp = codigoPostalValido(codigoPostal) ? codigoPostal.trim() : null;
  const cpro = cp ? cp.slice(0, 2) : null;

  const [datos, setDatos] = useState<DatosProvincia>(
    () => (cpro && cache.get(cpro)) || VACIO,
  );
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!cpro) {
      setDatos(VACIO);
      return;
    }

    const enCache = cache.get(cpro);
    if (enCache) {
      setDatos(enCache);
      return;
    }

    // Si el CP cambia mientras la descarga está en vuelo, la respuesta que
    // llegue tarde no debe pisar la lista de la provincia nueva.
    let vigente = true;
    setCargando(true);

    void fetch(`/municipios/${cpro}.json`)
      .then((r) => (r.ok ? r.json() : VACIO))
      .then((datosProvincia: DatosProvincia) => {
        const normalizados: DatosProvincia = {
          municipios: datosProvincia.municipios ?? [],
          porCP: datosProvincia.porCP ?? {},
        };
        cache.set(cpro, normalizados);
        if (vigente) setDatos(normalizados);
      })
      .catch(() => {
        if (vigente) setDatos(VACIO);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [cpro]);

  const delCP = cp ? (datos.porCP[cp] ?? []).map((i) => datos.municipios[i]).filter(Boolean) : [];

  return { municipios: datos.municipios, delCP, cargando };
}
