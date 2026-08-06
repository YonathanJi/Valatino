"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { CATEGORIAS_PRODUCTO, type Producto, type TipoVariante } from "@valatino/types";
import {
  ENVASES_FORMATO,
  etiquetaFormato,
  partirEtiquetaFormato,
} from "@lib/productos/variantes";

interface ProductoFormProps {
  producto: Producto | null;
  /**
   * Familias que ya existen, para sugerirlas al escribir. Sin esto se acaba con
   * «Quipitos Pops» y «Quipitos pops» como dos familias distintas, y el grupo
   * partido en dos sin que se vea por qué.
   */
  familias?: string[];
  onClose: () => void;
  onSaved: () => void;
}

const FORMATOS_IMAGEN = "image/jpeg,image/png,image/webp";

/** Opción del desplegable de envases que abre el campo de texto libre. */
const ENVASE_OTRO = "__otro__";

/**
 * Redimensiona (máx. 1200px de lado) y comprime a WebP en el navegador antes
 * de subir: los PNG generados por IA o las fotos de móvil superan con
 * facilidad el límite de 5 MB de la API.
 */
async function procesarImagen(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1200;
  const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))),
      "image/webp",
      0.85,
    );
  });
}

export function ProductoForm({ producto, familias = [], onClose, onSaved }: ProductoFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(producto?.imagenes[0] ?? null);

  // Imagen de familia (imagenes[1]): opcional, para la tarjeta agrupada de sabores
  const [familiaFile, setFamiliaFile] = useState<File | null>(null);
  const [familiaPreview, setFamiliaPreview] = useState<string | null>(
    producto?.imagenes[1] ?? null,
  );
  const [quitarFamilia, setQuitarFamilia] = useState(false);

  // ── Presentación: sí/no → familia → qué cambia → el valor ────────────────
  // El orden importa. La primera versión preguntaba «en qué se diferencian»
  // DESPUÉS de escribir «C/U», y Jonathan lo leyó como que se le preguntaba dos
  // veces lo mismo. Preguntar qué cambia ANTES hace que el último campo se
  // adapte y la pregunta tenga sentido.
  const [esVariante, setEsVariante] = useState(Boolean(producto?.familia));
  const [tipo, setTipo] = useState<TipoVariante>(producto?.variante_tipo ?? "formato");
  const [familiaNombre, setFamiliaNombre] = useState(producto?.familia ?? "");

  // Al editar: si la etiqueta guardada es «Caja 24 unidades» se reparte en
  // desplegable + número; si no la reconoce, va a texto libre en vez de
  // inventarse un envase y perder lo que había escrito.
  const guardada =
    producto?.variante_tipo === "formato" && producto.variante
      ? partirEtiquetaFormato(producto.variante)
      : null;

  const [envase, setEnvase] = useState<string>(
    producto?.variante_tipo === "formato" ? (guardada?.envase ?? ENVASE_OTRO) : ENVASES_FORMATO[0],
  );
  const [unidades, setUnidades] = useState(guardada?.unidades ? String(guardada.unidades) : "");
  /** El sabor, o el formato cuando el envase no es de la lista */
  const [textoLibre, setTextoLibre] = useState(
    producto?.variante && !guardada ? producto.variante : "",
  );

  /** La etiqueta que verá el cliente, armada de lo de arriba. */
  const varianteFinal = !esVariante
    ? ""
    : tipo === "sabor" || envase === ENVASE_OTRO
      ? textoLibre.trim()
      : etiquetaFormato(envase, unidades ? parseInt(unidades, 10) : null);

  const agrupado = esVariante && familiaNombre.trim() !== "" && varianteFinal !== "";

  // Preview local del archivo elegido (se revoca el object URL al cambiar)
  useEffect(() => {
    if (!imagenFile) return;
    const url = URL.createObjectURL(imagenFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imagenFile]);

  useEffect(() => {
    if (!familiaFile) return;
    const url = URL.createObjectURL(familiaFile);
    setFamiliaPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [familiaFile]);

  const subirImagen = async (file: File): Promise<string> => {
    const procesada = await procesarImagen(file);
    const upload = new FormData();
    upload.append("imagen", procesada, "imagen.webp");
    const { url } = await apiFetch<{ url: string }>("/productos/imagen", {
      method: "POST",
      body: upload,
    });
    return url;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      // 1. Subir las imágenes nuevas (redimensionadas/comprimidas en el navegador)
      let imagenUrl = producto?.imagenes[0] ?? "/placeholder.png";
      if (imagenFile) imagenUrl = await subirImagen(imagenFile);

      // imagenes[1] = imagen de familia (tarjeta agrupada de sabores)
      let familiaUrl = quitarFamilia ? null : (producto?.imagenes[1] ?? null);
      if (familiaFile) familiaUrl = await subirImagen(familiaFile);

      // 2. Crear/actualizar el producto con las URLs en la nube. Sin stock:
      //    los productos nacen a 0 y las unidades entran por Inventario/Facturas.
      // Familia, variante y tipo van LOS TRES o NINGUNO (CHECK de la 057): una
      // familia sin variante pintaría una pastilla vacía. Se resuelve aquí para
      // no tener que entender la restricción al rellenar el formulario.
      const payload = {
        nombre: formData.get("nombre") as string,
        descripcion: formData.get("descripcion") as string,
        precio: parseFloat(formData.get("precio") as string),
        categoria: formData.get("categoria") as string,
        imagenes: familiaUrl ? [imagenUrl, familiaUrl] : [imagenUrl],
        activo: formData.get("activo") === "on",
        familia: agrupado ? familiaNombre.trim() : null,
        variante: agrupado ? varianteFinal : null,
        variante_tipo: agrupado ? tipo : null,
      };

      await apiFetch(producto ? `/productos/${producto.id}` : "/productos", {
        method: producto ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(producto ? "Producto actualizado" : "Producto creado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar el producto");
    }

    setIsLoading(false);
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">
        {producto ? "Editar producto" : "Nuevo producto"}
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" required defaultValue={producto?.nombre} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="descripcion">Descripción</Label>
          <Input id="descripcion" name="descripcion" defaultValue={producto?.descripcion ?? ""} />
        </div>

        {/*
          Presentaciones del mismo artículo. El NOMBRE es libre —«Quipitos Pops
          C/U»—: lo que los hace hermanos es la familia, no que el nombre siga
          ninguna convención.
        */}
        <div className="col-span-2 rounded-lg border bg-muted/30 p-3 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              ¿Es otra presentación de un producto que ya vendes?
            </legend>
            <p className="text-xs text-muted-foreground">
              Lo mismo en caja y en unidad, o el mismo producto en varios sabores. La tienda los
              muestra en <strong className="font-medium">una sola tarjeta</strong> con un selector.
            </p>
            <div className="flex gap-4 pt-0.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="es-variante"
                  checked={!esVariante}
                  onChange={() => setEsVariante(false)}
                />
                No, es un producto suelto
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="es-variante"
                  checked={esVariante}
                  onChange={() => setEsVariante(true)}
                />
                Sí
              </label>
            </div>
          </fieldset>

          {esVariante && (
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="familia">Nombre común de la familia</Label>
                <Input
                  id="familia"
                  list="familias-existentes"
                  placeholder="Quipitos Pops"
                  maxLength={200}
                  value={familiaNombre}
                  onChange={(e) => setFamiliaNombre(e.target.value)}
                  className="sm:max-w-sm"
                />
                <datalist id="familias-existentes">
                  {familias.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  El título que verá el cliente. Si ya existe, elígela de la lista para que
                  agrupen.
                </p>
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">¿Qué cambia respecto a las otras?</legend>
                <div className="flex flex-wrap gap-4 pt-0.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tipo-variante"
                      checked={tipo === "formato"}
                      onChange={() => setTipo("formato")}
                    />
                    La cantidad o el envase
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tipo-variante"
                      checked={tipo === "sabor"}
                      onChange={() => setTipo("sabor")}
                    />
                    El sabor
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  ¿Es lo mismo pero más cantidad? → la cantidad. ¿Es lo mismo pero sabe distinto? →
                  el sabor.
                </p>
              </fieldset>

              {tipo === "formato" ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="envase">Este producto se vende en</Label>
                    <select
                      id="envase"
                      value={envase}
                      onChange={(e) => setEnvase(e.target.value)}
                      className="flex h-9 w-40 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {ENVASES_FORMATO.map((e) => (
                        <option key={e} value={e}>
                          {e === "C/U" ? "Unidad (C/U)" : e}
                        </option>
                      ))}
                      <option value={ENVASE_OTRO}>Otro…</option>
                    </select>
                  </div>

                  {envase === ENVASE_OTRO ? (
                    <div className="space-y-1">
                      <Label htmlFor="envase-otro">¿Cómo se llama?</Label>
                      <Input
                        id="envase-otro"
                        placeholder="Botellín 33 cl"
                        maxLength={100}
                        value={textoLibre}
                        onChange={(e) => setTextoLibre(e.target.value)}
                        className="w-56"
                      />
                    </div>
                  ) : (
                    envase !== "C/U" && (
                      <div className="space-y-1">
                        <Label htmlFor="unidades">¿De cuántas unidades?</Label>
                        <Input
                          id="unidades"
                          type="number"
                          min={2}
                          placeholder="24"
                          value={unidades}
                          onChange={(e) => setUnidades(e.target.value)}
                          className="w-32 font-mono"
                        />
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="sabor">¿Qué sabor es este?</Label>
                  <Input
                    id="sabor"
                    placeholder="Fresa"
                    maxLength={100}
                    value={textoLibre}
                    onChange={(e) => setTextoLibre(e.target.value)}
                    className="w-56"
                  />
                </div>
              )}

              {/* Lo que verá el cliente, en sus palabras. Es lo que hace que el
                  formulario se explique solo sin leer las ayudas. */}
              {agrupado ? (
                <p className="rounded-lg border bg-background px-3 py-2 text-xs">
                  En la tienda:{" "}
                  <strong className="font-medium">«{familiaNombre.trim()}»</strong>, y este se
                  elegirá como <strong className="font-medium">«{varianteFinal}»</strong>.
                </p>
              ) : (
                <p className="text-xs text-amber-700">
                  Faltan datos: sin la familia y esta presentación, el producto se guardará como
                  suelto.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="precio">Precio (EUR)</Label>
          <Input id="precio" name="precio" type="number" step="0.01" min="0.01" required
            defaultValue={producto ? String(producto.precio) : ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="categoria">Categoría</Label>
          <select
            id="categoria"
            name="categoria"
            required
            defaultValue={producto?.categoria ?? ""}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Selecciona una categoría…
            </option>
            {CATEGORIAS_PRODUCTO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imagen">Imagen del producto</Label>
          <div className="flex items-center gap-3">
            {preview && (
              <Image
                src={preview}
                alt="Vista previa"
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-lg border object-cover bg-muted"
              />
            )}
            <input
              id="imagen"
              type="file"
              accept={FORMATOS_IMAGEN}
              onChange={(e) => setImagenFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80 cursor-pointer"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG o WebP, de cualquier peso: se optimiza sola (1200px, WebP) y se guarda en la
            nube al enviar.
            {producto && !imagenFile ? " Sin cambios se conserva la actual." : ""}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imagen_familia">Imagen de familia (opcional)</Label>
          <div className="flex items-center gap-3">
            {familiaPreview && !quitarFamilia && (
              <Image
                src={familiaPreview}
                alt="Vista previa de familia"
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-lg border object-cover bg-muted"
              />
            )}
            <input
              id="imagen_familia"
              type="file"
              accept={FORMATOS_IMAGEN}
              onChange={(e) => {
                setFamiliaFile(e.target.files?.[0] ?? null);
                setQuitarFamilia(false);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80 cursor-pointer"
            />
            {familiaPreview && !quitarFamilia && (
              <button
                type="button"
                onClick={() => {
                  setFamiliaFile(null);
                  setQuitarFamilia(true);
                }}
                className="text-xs text-red-600 hover:underline whitespace-nowrap"
              >
                Quitar
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo para grupos de sabores: la tarjeta agrupada de la tienda usará esta foto (súbela
            en uno solo de los sabores).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="activo"
            name="activo"
            defaultChecked={producto?.activo ?? true}
            className="h-4 w-4"
          />
          <Label htmlFor="activo">Activo (visible en catálogo)</Label>
        </div>

        <div className="col-span-2 flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
