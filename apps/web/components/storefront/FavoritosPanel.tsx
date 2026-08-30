"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { PaginatedResponse, Producto } from "@valatino/types";
import { apiFetch } from "@lib/api/client";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { useFavoritos } from "@lib/hooks/useFavoritos";
import { ProductoCard } from "./ProductoCard";

/**
 * La lista de guardados.
 *
 * ⚠️⚠️ SE REUTILIZA `ProductoCard` TAL CUAL, y no es pereza: esa tarjeta ya trae el
 * corazón (que aquí sirve para QUITAR, porque sale relleno) y el botón de carrito.
 * O sea que las tres cosas que se pidieron para esta página —ver, quitar y añadir al
 * carrito— salen de no escribir una tarjeta nueva. Una copia se habría quedado atrás
 * el día que alguien arreglara la del catálogo.
 *
 * ⚠️⚠️ TRES ESTADOS Y NO DOS: cargando, **no se pudo preguntar**, y la lista. Si
 * «falló la API» y «no tienes nada» se pintaran igual, alguien con veinte favoritos
 * vería «no tienes favoritos» porque Render estaba dormido — y podría ponerse a
 * guardarlos otra vez. Es la misma avería que dejó las tres páginas legales en blanco
 * en agosto y la que servía un sitemap sin catálogo: confundir «no sé» con «no hay».
 */
export function FavoritosPanel() {
  const { ids, listo } = useFavoritos();
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [haySesion, setHaySesion] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => setHaySesion(Boolean(data.user)));
  }, []);

  const cargar = useCallback(async () => {
    if (ids.length === 0) {
      setProductos([]);
      setFallo(false);
      return;
    }
    try {
      const r = await apiFetch<PaginatedResponse<Producto>>(
        `/productos?ids=${encodeURIComponent(ids.join(","))}`,
      );
      /**
       * ⭐ Se reordena según la lista guardada: la API los devuelve por fecha del
       * PRODUCTO y aquí lo que importa es el orden en que se guardaron, lo último
       * arriba. Y los ids que ya no tienen producto —desactivado o borrado— se caen
       * solos al no encontrar pareja, que es justo lo que se quiere.
       */
      const porId = new Map(r.data.map((p) => [p.id, p]));
      setProductos(ids.map((id) => porId.get(id)).filter((p): p is Producto => Boolean(p)));
      setFallo(false);
    } catch {
      setFallo(true);
    }
  }, [ids]);

  useEffect(() => {
    if (!listo) return;
    void cargar();
  }, [listo, cargar]);

  const cargando = !listo || (productos === null && !fallo);

  return (
    <main className="max-w-6xl mx-auto px-4 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Favoritos</h1>
        {listo && productos !== null && productos.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {productos.length} {productos.length === 1 ? "artículo guardado" : "artículos guardados"}
          </p>
        )}
      </header>

      {/*
        ⚠️ El aviso de iniciar sesión solo sale si NO hay sesión y ya se sabe.
        `haySesion === null` es «todavía no lo sé», y enseñar «inicia sesión» a quien
        ya la tiene, aunque sea medio segundo, es decirle algo falso.
      */}
      {haySesion === false && listo && (
        <div className="rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="text-muted-foreground">
            Tus favoritos se guardan <strong className="text-foreground">en este navegador</strong>.{" "}
            <Link href="/login" className="text-primary hover:underline">
              Inicia sesión
            </Link>{" "}
            para conservarlos y verlos desde cualquier dispositivo.
          </p>
        </div>
      )}

      {cargando && <p className="py-12 text-center text-muted-foreground">Cargando…</p>}

      {fallo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">No hemos podido cargar tus favoritos ahora mismo.</p>
          {/* Se dice explícitamente que NO se han perdido: es lo que preocupa. */}
          <p className="mt-1">
            Siguen guardados. Vuelve a intentarlo en un momento.
          </p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 font-medium transition-colors hover:bg-amber-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {!cargando && !fallo && productos?.length === 0 && (
        <div className="py-16 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-4 text-muted-foreground">Todavía no has guardado nada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Toca el corazón de cualquier producto para tenerlo aquí.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ver el catálogo
          </Link>
        </div>
      )}

      {!cargando && !fallo && productos && productos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {productos.map((p) => (
            <ProductoCard key={p.id} producto={p} />
          ))}
        </div>
      )}
    </main>
  );
}
