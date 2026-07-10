"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CarritoConItems } from "@valatino/types";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";

interface CarritoContextValue {
  carrito: CarritoConItems | null;
  isLoading: boolean;
  addItem: (productoId: string, cantidad: number) => Promise<void>;
  updateItem: (itemId: string, cantidad: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const CarritoContext = createContext<CarritoContextValue | null>(null);

export function CarritoProvider({ children }: { children: ReactNode }) {
  const [carrito, setCarrito] = useState<CarritoConItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<CarritoConItems>("/carrito");
      setCarrito(data);
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addItem = useCallback(async (productoId: string, cantidad: number) => {
    try {
      const updated = await apiFetch<CarritoConItems>("/carrito/items", {
        method: "POST",
        body: JSON.stringify({ producto_id: productoId, cantidad }),
      });
      setCarrito(updated);
      toast.success("Añadido al carrito");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error al añadir al carrito");
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, cantidad: number) => {
    try {
      const updated = await apiFetch<CarritoConItems>(`/carrito/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ cantidad }),
      });
      setCarrito(updated);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error al actualizar la cantidad");
    }
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    try {
      const updated = await apiFetch<CarritoConItems>(`/carrito/items/${itemId}`, {
        method: "DELETE",
      });
      setCarrito(updated);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error al eliminar el artículo");
    }
  }, []);

  return (
    <CarritoContext.Provider value={{ carrito, isLoading, addItem, updateItem, removeItem, reload }}>
      {children}
    </CarritoContext.Provider>
  );
}

export function useCarrito() {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
  return ctx;
}
