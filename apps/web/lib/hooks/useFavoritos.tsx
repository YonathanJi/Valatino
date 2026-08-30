"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { TOPE_FAVORITOS, type FavoritosIds } from "@valatino/types";
import { apiFetch } from "@lib/api/client";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { alternar, escribir, estaLleno, leer, unir } from "@lib/favoritos/almacen";

interface FavoritosContextValue {
  /** Los ids guardados, el último primero. */
  ids: string[];
  /** ¿Ya se leyó el almacén del navegador? Ver la nota de hidratación. */
  listo: boolean;
  esFavorito: (productoId: string) => boolean;
  alternarFavorito: (productoId: string) => void;
}

const FavoritosContext = createContext<FavoritosContextValue | null>(null);

/**
 * Los favoritos de la tienda.
 *
 * ⚠️⚠️ EL ESTADO EMPIEZA VACÍO A PROPÓSITO, Y ES EL FALLO MÁS SUTIL DE TODO ESTO.
 * `localStorage` **no existe en el servidor**, así que si el primer render pintara
 * los corazones rellenos, el HTML del servidor y el del navegador no coincidirían y
 * React avisaría de desajuste de hidratación (y, según el caso, tiraría el árbol y
 * lo repintaría entero). Por eso: **vacío en el primer render, y se llena al montar**.
 * `listo` es lo que deja a la interfaz saber en cuál de los dos momentos está.
 *
 * ⭐ LO LOCAL ES LA VERDAD, y el servidor es un respaldo que se sincroniza cuando
 * puede. Al revés —esperar a la API para pintar un corazón— sería inusable: la API
 * duerme y tarda hasta 42,5 s en despertar (medido el 28/08). Ver la cabecera de
 * `@lib/favoritos/almacen` y la de la migración 085.
 */
export function FavoritosProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [listo, setListo] = useState(false);
  const haySesion = useRef(false);

  // 1 · Al montar, lo que hubiera en este navegador. Sin red, instantáneo.
  useEffect(() => {
    setIds(leer());
    setListo(true);
  }, []);

  // 2 · Y cuando hay cuenta, se sincroniza con ella.
  useEffect(() => {
    if (!listo) return;
    const supabase = createSupabaseBrowserClient();

    /**
     * ⭐ UNA SOLA LLAMADA HACE LAS DOS COSAS. Si este navegador traía favoritos, se
     * mandan a `fusionar`, que los une a los de la cuenta y devuelve el total; si no
     * traía nada, basta con leer. Así el mismo camino sirve para «acaba de iniciar
     * sesión» y para «vuelve con la sesión ya abierta», sin que nadie tenga que
     * acordarse de llamar a la fusión desde la pantalla de acceso.
     */
    const sincronizar = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        haySesion.current = Boolean(data.user);
        if (!data.user) return;

        const locales = leer();
        const respuesta =
          locales.length > 0
            ? await apiFetch<FavoritosIds>("/favoritos/fusionar", {
                method: "POST",
                body: JSON.stringify({ productoIds: locales }),
              })
            : await apiFetch<FavoritosIds>("/favoritos");

        const unidos = unir(locales, respuesta.productoIds);
        setIds(unidos);
        escribir(unidos);
      } catch {
        /**
         * ⚠️ Se calla A PROPÓSITO. Si la API está dormida o caída, los favoritos de
         * este navegador siguen funcionando: es justo el caso para el que se diseñó
         * así. Un aviso aquí sería alarmar por algo que el cliente no nota.
         */
      }
    };

    void sincronizar();

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN") void sincronizar();
      /**
       * ⚠️ Al cerrar sesión **no se borra nada**. Son los favoritos de este
       * navegador y siguen siendo suyos; vaciarlos castigaría a quien solo quería
       * salir de su cuenta. Es lo mismo que hace el carrito.
       */
      if (evento === "SIGNED_OUT") haySesion.current = false;
    });

    return () => suscripcion.subscription.unsubscribe();
  }, [listo]);

  const esFavorito = useCallback((productoId: string) => ids.includes(productoId), [ids]);

  /**
   * Poner o quitar. **Se pinta al instante** y el servidor se entera después.
   *
   * ⚠️ La llamada a la API va sin esperar (`void`) y con el fallo tragado: si no
   * llega, lo local ya está bien y la próxima sincronización lo arregla. Esperarla
   * dejaría el corazón sin responder hasta 42 segundos.
   */
  const alternarFavorito = useCallback(
    (productoId: string) => {
      const yaEstaba = ids.includes(productoId);

      if (!yaEstaba && estaLleno(ids)) {
        toast.warning(`Solo se pueden guardar ${TOPE_FAVORITOS} favoritos`);
        return;
      }

      const siguiente = alternar(ids, productoId);
      setIds(siguiente);
      escribir(siguiente);

      if (!haySesion.current) return;

      void apiFetch(`/favoritos/${productoId}`, {
        method: yaEstaba ? "DELETE" : "PUT",
      }).catch(() => {
        /* Lo local manda; ya se reconciliará al volver. */
      });
    },
    [ids],
  );

  return (
    <FavoritosContext.Provider value={{ ids, listo, esFavorito, alternarFavorito }}>
      {children}
    </FavoritosContext.Provider>
  );
}

export function useFavoritos() {
  const ctx = useContext(FavoritosContext);
  if (!ctx) throw new Error("useFavoritos debe usarse dentro de FavoritosProvider");
  return ctx;
}
