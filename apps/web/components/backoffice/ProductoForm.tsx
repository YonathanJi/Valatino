"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { CATEGORIAS_PRODUCTO, type Producto } from "@valatino/types";

interface ProductoFormProps {
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}

const FORMATOS_IMAGEN = "image/jpeg,image/png,image/webp";

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

export function ProductoForm({ producto, onClose, onSaved }: ProductoFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(producto?.imagenes[0] ?? null);

  // Imagen de familia (imagenes[1]): opcional, para la tarjeta agrupada de sabores
  const [familiaFile, setFamiliaFile] = useState<File | null>(null);
  const [familiaPreview, setFamiliaPreview] = useState<string | null>(
    producto?.imagenes[1] ?? null,
  );
  const [quitarFamilia, setQuitarFamilia] = useState(false);

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
      const payload = {
        nombre: formData.get("nombre") as string,
        descripcion: formData.get("descripcion") as string,
        precio: parseFloat(formData.get("precio") as string),
        categoria: formData.get("categoria") as string,
        imagenes: familiaUrl ? [imagenUrl, familiaUrl] : [imagenUrl],
        activo: formData.get("activo") === "on",
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
