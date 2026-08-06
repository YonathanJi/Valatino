"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { sanearImporte } from "@lib/utils";
import { CATEGORIAS_PRODUCTO, type Producto } from "@valatino/types";

interface ProductoBorradorModalProps {
  onClose: () => void;
  /** El producto creado, para añadirlo a la lista y seleccionarlo en la línea */
  onCreado: (producto: Producto) => void;
}

/**
 * Crea un producto SIN salir del formulario de la compra, como **borrador**.
 *
 * El problema que resuelve: al registrar una factura aparece mercancía que no
 * está en el catálogo, y había que abandonar el formulario a medias, ir a
 * Catálogo, crear el producto —normalmente sin tener la foto a mano— y volver a
 * empezar.
 *
 * **La pieza que lo hace seguro es `activo: false`**, que ya existía y significa
 * exactamente lo que hace falta: está en el almacén pero no en la tienda. Por eso
 * da igual que no haya foto ni precio definitivo — nadie lo ve ni lo puede
 * comprar. La factura le suma su stock igual, y alguien lo completa y lo publica
 * en Catálogo cuando tenga la foto.
 *
 * No hizo falta nada nuevo por debajo: `CreateProductoDto` ya acepta `activo` y
 * `imagenes` vacío (la columna tiene `default '{}'`), y tanto el desplegable de
 * esta pantalla como el catálogo del panel cargan con `soloActivos=false`, así
 * que el borrador aparece en los dos sitios sin tocar ninguno.
 *
 * ⚠️ **El precio se pide aunque sea provisional**: la BD tiene
 * `CHECK (precio > 0)` y no admite dejarlo vacío ni a cero. Y a propósito **no**
 * se rellena con el costo de la factura: un precio que parece puesto es un
 * precio que nadie revisa, y así es como se acaba vendiendo al costo.
 */
export function ProductoBorradorModal({ onClose, onCreado }: ProductoBorradorModalProps) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_PRODUCTO[0]);
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  // La coma vale igual que el punto (ver `sanearImporte`).
  const precioNum = Number(precio.replace(",", "."));
  const precioValido = precio.trim() !== "" && Number.isFinite(precioNum) && precioNum > 0;
  const puedeGuardar = nombre.trim() !== "" && precioValido && !guardando;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;

    setGuardando(true);
    try {
      const creado = await apiFetch<Producto>("/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria,
          precio: precioNum,
          activo: false,
        }),
      });

      // El aviso dice lo que hay que saber DESPUÉS de guardar: que no está a la
      // venta. Sin esto, alguien da por publicado un producto que nadie ve.
      toast.success(`«${creado.nombre}» creado como borrador: aún no se ve en la tienda`);
      onCreado(creado);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el producto");
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="producto-borrador-titulo"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void guardar(e)}
        className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 id="producto-borrador-titulo" className="font-semibold">
            Producto nuevo
          </h2>
          <p className="text-sm text-muted-foreground">
            Se crea como borrador para que puedas seguir con la factura.{" "}
            <strong className="font-medium text-foreground">No aparecerá en la tienda</strong> hasta
            que le pongas foto y lo publiques desde Catálogo.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pb-nombre" className="text-sm font-medium">
            Nombre <span className="text-destructive">*</span>
          </label>
          <input
            id="pb-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={200}
            autoFocus
            required
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="pb-categoria" className="text-sm font-medium">
              Categoría <span className="text-destructive">*</span>
            </label>
            <select
              id="pb-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
            >
              {CATEGORIAS_PRODUCTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pb-precio" className="text-sm font-medium">
              Precio de venta <span className="text-destructive">*</span>
            </label>
            {/* type="text" + inputMode: con `number` la coma vacía el campo */}
            <input
              id="pb-precio"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={precio}
              onChange={(e) => setPrecio(sanearImporte(e.target.value))}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background font-mono text-right"
            />
            <p className="text-xs text-muted-foreground">
              Provisional: lo ajustas al publicarlo.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!puedeGuardar}>
            {guardando ? "Creando…" : "Crear y usar en la línea"}
          </Button>
        </div>
      </form>
    </div>
  );
}
