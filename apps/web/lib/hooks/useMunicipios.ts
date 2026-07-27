"use client";

import { useEffect, useState } from "react";
import { codigoPostalValido } from "@valatino/types";

/**
 * Municipios de la provincia a la que pertenece un código postal.
 *
 * Se descargan de `/municipios/<cpro>.json`, ficheros estáticos generados desde
 * el diccionario del INE (ver `scripts/generar-municipios.mjs`). Dos decisiones
 * detrás de eso:
 *
 * - **No van en el bundle**: son 127 KB para usar los 3 KB de una provincia.
 * - **No van por la API**: Render duerme en el plan gratuito, y el formulario de
 *   dirección no puede quedarse esperando a que despierte. Servidos por el CDN
 *   de Vercel no dependen de nada que se pueda dormir.
 *
 * El fichero se cachea en memoria por provincia: volver atrás y corregir el CP
 * es lo más normal del mundo y no debería repetir la descarga.
 */
const cache = new Map<string, readonly string[]>();

export function useMunicipios(codigoPostal: string) {
  const cpro = codigoPostalValido(codigoPostal) ? codigoPostal.trim().slice(0, 2) : null;

  const [municipios, setMunicipios] = useState<readonly string[]>(
    () => (cpro && cache.get(cpro)) || [],
  );
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!cpro) {
      setMunicipios([]);
      return;
    }

    const enCache = cache.get(cpro);
    if (enCache) {
      setMunicipios(enCache);
      return;
    }

    // Si el CP cambia mientras la descarga está en vuelo, la respuesta que
    // llegue tarde no debe pisar la lista de la provincia nueva.
    let vigente = true;
    setCargando(true);

    void fetch(`/municipios/${cpro}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: string[]) => {
        cache.set(cpro, lista);
        if (vigente) setMunicipios(lista);
      })
      .catch(() => {
        if (vigente) setMunicipios([]);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [cpro]);

  return { municipios, cargando };
}
