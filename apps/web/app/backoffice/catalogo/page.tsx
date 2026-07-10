"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { ProductoTabla } from "@components/backoffice/ProductoTabla";
import { ProductoForm } from "@components/backoffice/ProductoForm";
import { Button } from "@components/ui/button";
import type { Producto } from "@valatino/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function BackofficeCatalogoPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const supabase = createSupabaseBrowserClient();

  const loadProductos = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`${API_URL}/productos?limit=100&soloActivos=false`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = (await res.json()) as { data: Producto[] };
      setProductos(json.data);
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
