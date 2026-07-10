"use client";

import { useCarrito } from "@lib/hooks/useCarrito";
import { Button } from "@components/ui/button";
import { Skeleton } from "@components/ui/Skeleton";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { formatEUR } from "@lib/utils";

export function Carrito() {
  const { carrito, isLoading, updateItem, removeItem } = useCarrito();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!carrito || carrito.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <ShoppingBag className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Tu carrito está vacío</h2>
        <p className="text-muted-foreground">
          Descubre nuestros productos latinoamericanos y añade algo especial.
        </p>
        <Button asChild>
          <Link href="/">Ver catálogo</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Lista de ítems */}
      <div className="lg:col-span-2 space-y-4">
        {carrito.items.map((item) => (
          <article
            key={item.id}
            className="flex gap-4 rounded-xl border bg-card p-4"
          >
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={item.imagenes[0] ?? "/placeholder.png"}
                alt={item.nombre}
                fill
                className="object-cover"
              />
            </div>

            <div className="flex flex-1 flex-col gap-1 min-w-0">
              <h3 className="font-medium leading-tight text-sm truncate">{item.nombre}</h3>
              <p className="text-sm text-muted-foreground">
                {formatEUR(item.precioUnitario)} × {item.cantidad}
              </p>
              <p className="font-bold text-primary">{formatEUR(item.subtotal)}</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => removeItem(item.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateItem(item.id, item.cantidad - 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm">{item.cantidad}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateItem(item.id, item.cantidad + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Resumen */}
      <div className="rounded-xl border bg-card p-6 space-y-4 h-fit sticky top-4">
        <h2 className="text-lg font-semibold">Resumen del pedido</h2>
        <div className="space-y-2 text-sm">
          {carrito.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {item.nombre} ×{item.cantidad}
              </span>
              <span>{formatEUR(item.subtotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-4 flex justify-between font-bold text-lg">
          <span>Total</span>
          <span className="text-primary">{formatEUR(carrito.total)}</span>
        </div>
        <Button asChild className="w-full" size="lg">
          <Link href="/checkout">Proceder al pago</Link>
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Pago seguro con Stripe y PayPal
        </p>
      </div>
    </div>
  );
}
