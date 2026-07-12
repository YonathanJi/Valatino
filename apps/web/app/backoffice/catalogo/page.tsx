"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@lib/api/client";
import { ProductoTabla } from "@components/backoffice/ProductoTabla";
import { ProductoForm } from "@components/backoffice/ProductoForm";
import { Button } from "@components/ui/button";
import type { Producto, PaginatedResponse } from "@valatino/types";

export default function BackofficeCatalogoPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);

  const loadProductos = async () => {
    try {
      const json = await apiFetch<PaginatedResponse<Producto>>(
        "/productos?limit=100&soloActivos=false",
      );
      setProductos(json.data ?? []);
    } catch {
      // el layout ya protege la ruta
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadProductos();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestión de Catálogo</h1>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          + Nuevo producto
        </Button>
      </div>

      {showForm && (
        <ProductoForm
          producto={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void loadProductos(); }}
        />
      )}

      <ProductoTabla
        productos={productos}
        isLoading={isLoading}
        onEdit={(p) => { setEditing(p); setShowForm(true); }}
        onRefresh={loadProductos}
      />
    </div>
  );
}
