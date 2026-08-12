"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { MOTIVOS_AJUSTE_STOCK, type MotivoAjusteStock } from "@valatino/types";

interface StockAjusteModalProps {
  productoId: string;
  nombreProducto: string;
  onAjustado: () => void;
}

/**
 * Cómo se llama cada motivo, y si suma o resta.
 *
 * ⚠️ Hasta la 063 este widget **solo sabía sumar**, así que rotura, merma y
 * caducidad —las razones por las que un inventario se descuadra de verdad— no
 * tenían forma de entrar, y quien las sufría acababa sin registrar nada. Un
 * libro que solo apunta altas no explica ningún descuadre.
 */
const MOTIVOS: Record<MotivoAjusteStock, { etiqueta: string; signo: 1 | -1 | 0 }> = {
  recuento: { etiqueta: "Recuento: hay más de lo que decía", signo: 1 },
  rotura: { etiqueta: "Rotura", signo: -1 },
  merma: { etiqueta: "Merma o pérdida", signo: -1 },
  caducidad: { etiqueta: "Caducado", signo: -1 },
  devolucion_proveedor: { etiqueta: "Devuelto al proveedor", signo: -1 },
  correccion: { etiqueta: "Corregir una errata", signo: 0 },
  sin_indicar: { etiqueta: "Sin indicar", signo: 0 },
};

export function StockAjusteModal({ productoId, nombreProducto, onAjustado }: StockAjusteModalProps) {
  const [open, setOpen] = useState(false);
  const [unidades, setUnidades] = useState(0);
  const [motivo, setMotivo] = useState<MotivoAjusteStock>("recuento");
  // Solo se pregunta cuando el motivo no lo implica: «rotura» ya dice que resta.
  const [suma, setSuma] = useState(true);
  const [nota, setNota] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const signoDelMotivo = MOTIVOS[motivo].signo;
  const signo = signoDelMotivo === 0 ? (suma ? 1 : -1) : signoDelMotivo;
  const cantidad = unidades * signo;

  const cerrar = () => {
    setOpen(false);
    setUnidades(0);
    setNota("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unidades <= 0) return;

    setIsLoading(true);
    try {
      await apiFetch(`/productos/${productoId}/stock`, {
        method: "POST",
        body: JSON.stringify({ cantidad, motivo, nota: nota.trim() || undefined }),
      });
      toast.success(
        `${cantidad > 0 ? "+" : ""}${cantidad} unidades · ${MOTIVOS[motivo].etiqueta.toLowerCase()}`,
      );
      cerrar();
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
        Ajustar
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border bg-card p-2">
      <Label className="sr-only">Ajustar el stock de {nombreProducto}</Label>

      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as MotivoAjusteStock)}
        className="h-7 w-full rounded border bg-background px-2 text-xs"
        aria-label="Motivo del ajuste"
      >
        {MOTIVOS_AJUSTE_STOCK.map((m) => (
          <option key={m} value={m}>
            {MOTIVOS[m].etiqueta}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        {/* El signo solo se pregunta si el motivo no lo dice ya. Preguntarlo
            siempre invita a equivocarse en la mitad de los casos. */}
        {signoDelMotivo === 0 && (
          <button
            type="button"
            onClick={() => setSuma((s) => !s)}
            className="h-7 w-7 shrink-0 rounded border text-xs font-semibold tabular-nums"
            aria-label={suma ? "Sumar unidades" : "Restar unidades"}
          >
            {suma ? "+" : "−"}
          </button>
        )}
        {signoDelMotivo !== 0 && (
          <span className="h-7 w-7 shrink-0 rounded border text-center text-xs font-semibold leading-7 text-muted-foreground">
            {signoDelMotivo > 0 ? "+" : "−"}
          </span>
        )}
        <Input
          type="number"
          min={1}
          value={unidades || ""}
          onChange={(e) => setUnidades(parseInt(e.target.value, 10) || 0)}
          className="h-7 w-16 text-xs"
          aria-label="Unidades"
        />
        <Input
          type="text"
          maxLength={300}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="h-7 flex-1 text-xs"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={cerrar} className="text-xs text-muted-foreground">
          Cancelar
        </button>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={isLoading || unidades <= 0}>
          {isLoading ? "…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
