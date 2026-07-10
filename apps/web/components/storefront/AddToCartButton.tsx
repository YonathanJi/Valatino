"use client";

import { Button } from "@components/ui/button";
import { useCarrito } from "@lib/hooks/useCarrito";

interface AddToCartButtonProps {
  productoId: string;
  agotado: boolean;
}

export function AddToCartButton({ productoId, agotado }: AddToCartButtonProps) {
  const { addItem, isLoading } = useCarrito();

  return (
    <Button
      size="lg"
      disabled={agotado || isLoading}
      onClick={() => addItem(productoId, 1)}
      className="w-full sm:w-auto"
    >
      {agotado ? "Sin stock" : "Añadir al carrito"}
    </Button>
  );
}
