"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@lib/api/client";
import { ProductoTabla } from "@components/backoffice/ProductoTabla";
import { ProductoForm } from "@components/backoffice/ProductoForm";
import { Button } from "@components/ui/button";
import { usePuede } from "@components/backoffice/PermisosProvider";
import { Store } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import type { Producto, PaginatedResponse } from "@valatino/types";

export default function BackofficeCatalogoPage() {
  const puedeEditar = usePuede("catalogo", "edicion");

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
      <PageHeader icon={Store} title="Gestión de Catálogo" description="Productos de la tienda">
        <Button
          disabled={!puedeEditar}
          onClick={() => { setEditing(null); setShowForm(true); }}
        >
          + Nuevo producto
        </Button>
      </PageHeader>

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
