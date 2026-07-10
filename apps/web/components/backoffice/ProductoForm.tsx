"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import type { Producto } from "@valatino/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ProductoFormProps {
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductoForm({ producto, onClose, onSaved }: ProductoFormProps) {
  const supabase = createSupabaseBrowserClient();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      toast.error("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      nombre: formData.get("nombre") as string,
      descripcion: formData.get("descripcion") as string,
      precio: parseFloat(formData.get("precio") as string),
      categoria: formData.get("categoria") as string,
      stock_disponible: parseInt(formData.get("stock_disponible") as string, 10),
      imagenes: [(formData.get("imagen") as string) || "/placeholder.png"],
      activo: formData.get("activo") === "on",
    };

    const url = producto ? `${API_URL}/productos/${producto.id}` : `${API_URL}/productos`;
    const method = producto ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(producto ? "Producto actualizado" : "Producto creado");
      onSaved();
    } else {
      const err = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const msg = Array.isArray(err?.message) ? err.message.join(". ") : err?.message;
      toast.error(msg ?? "Error al guardar el producto");
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
          <Input id="categoria" name="categoria" required defaultValue={producto?.categoria} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stock_disponible">Stock inicial</Label>
          <Input id="stock_disponible" name="stock_disponible" type="number" min="0" required
            defaultValue={producto ? String(producto.stock_disponible) : "0"} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="imagen">URL de imagen</Label>
          <Input id="imagen" name="imagen" type="url" defaultValue={producto?.imagenes[0] ?? ""} />
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
