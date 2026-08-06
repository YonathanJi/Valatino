"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Borrar un producto del catálogo es irreversible: exige control total.
  const puedeBorrar = usePuede("catalogo", "total");

  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);

  // Familias ya usadas, para sugerirlas en el formulario: escribirla a mano cada
  // vez acaba con «Quipitos Pops» y «Quipitos pops» partiendo el grupo en dos.
  const familias = useMemo(
    () =>
      Array.from(
        new Map(
          productos
            .filter((p) => p.familia?.trim())
            .map((p) => [p.familia!.trim().toLowerCase(), p.familia!.trim()]),
        ).values(),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [productos],
  );

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
        {puedeEditar && (
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            + Nuevo producto
          </Button>
        )}
      </PageHeader>

      {showForm && puedeEditar && (
        <ProductoForm
          producto={editing}
          familias={familias}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void loadProductos(); }}
        />
      )}

      <ProductoTabla
        productos={productos}
        isLoading={isLoading}
        puedeEditar={puedeEditar}
        puedeBorrar={puedeBorrar}
        onEdit={(p) => { setEditing(p); setShowForm(true); }}
        onRefresh={loadProductos}
      />
    </div>
  );
}
