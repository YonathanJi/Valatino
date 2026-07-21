"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import { useCarrito } from "@lib/hooks/useCarrito";

interface AddToCartButtonProps {
  productoId: string;
  agotado: boolean;
}

// Límite comercial por producto y carrito (la API lo valida con 409)
const MAX_CANTIDAD = 30;

export function AddToCartButton({ productoId, agotado }: AddToCartButtonProps) {
  const { addItem, isLoading } = useCarrito();
  const [cantidad, setCantidad] = useState(1);

  const ajustar = (delta: number) =>
    setCantidad((c) => Math.min(MAX_CANTIDAD, Math.max(1, c + delta)));

  if (agotado) {
    return (
      <Button size="lg" disabled className="w-full sm:w-auto">
        Sin stock
      </Button>
    );
  }

  return (
    <div className="flex items-stretch gap-3 w-full sm:w-auto">
      <div className="flex items-center rounded-lg border">
        <button
          type="button"
          onClick={() => ajustar(-1)}
          disabled={cantidad <= 1 || isLoading}
          aria-label="Reducir cantidad"
          className="px-3.5 text-lg font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          −
        </button>
        <span
          aria-live="polite"
          className="w-10 text-center text-sm font-semibold tabular-nums select-none"
        >
          {cantidad}
        </span>
        <button
          type="button"
          onClick={() => ajustar(1)}
          disabled={cantidad >= MAX_CANTIDAD || isLoading}
          aria-label="Aumentar cantidad"
          className="px-3.5 text-lg font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          +
        </button>
      </div>
      <Button
        size="lg"
        disabled={isLoading}
        onClick={() => addItem(productoId, cantidad)}
        className="flex-1 sm:flex-none sm:min-w-56"
      >
        Añadir al carrito
      </Button>
    </div>
  );
}
