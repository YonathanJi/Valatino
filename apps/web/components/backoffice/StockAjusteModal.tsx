"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

interface StockAjusteModalProps {
  productoId: string;
  nombreProducto: string;
  onAjustado: () => void;
}

export function StockAjusteModal({ productoId, nombreProducto, onAjustado }: StockAjusteModalProps) {
  const [open, setOpen] = useState(false);
  const [cantidad, setCantidad] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cantidad <= 0) return;

    setIsLoading(true);
    try {
      await apiFetch(`/productos/${productoId}/stock`, {
        method: "POST",
        body: JSON.stringify({ cantidad }),
      });
      toast.success(`+${cantidad} unidades añadidas`);
      setOpen(false);
      setCantidad(0);
      onAjustado();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al ajustar el stock");
    }
    setIsLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        +Stock
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Label className="sr-only">Unidades a añadir para {nombreProducto}</Label>
      <Input
        type="number"
        min={1}
        value={cantidad}
        onChange={(e) => setCantidad(parseInt(e.target.value, 10))}
        className="h-7 w-20 text-xs"
      />
      <Button type="submit" size="sm" className="h-7 text-xs" disabled={isLoading || cantidad <= 0}>
        OK
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground"
      >
        ✕
      </button>
    </form>
  );
}
