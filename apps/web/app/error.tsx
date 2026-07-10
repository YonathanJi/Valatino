"use client";

import { useEffect } from "react";
import { Button } from "@components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-8">
        <p className="text-3xl">⚠️</p>
        <h2 className="font-semibold text-destructive text-lg">Algo salió mal</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "Ocurrió un error inesperado. Intenta de nuevo."}
        </p>
        <Button variant="outline" size="sm" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}