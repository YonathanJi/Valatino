"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR } from "@lib/utils";
import type { Pedido, ResultadoReembolso } from "@valatino/types";

interface ReembolsoModalProps {
  pedido: Pedido;
  onClose: () => void;
  /** Se llama con el resultado para refrescar la fila sin recargar la tabla */
  onReembolsado: (resultado: ResultadoReembolso) => void;
}

export function ReembolsoModal({ pedido, onClose, onReembolsado }: ReembolsoModalProps) {
  const total = Number(pedido.total);
  const yaDevuelto = Number(pedido.total_reembolsado ?? 0);
  const restante = Math.round((total - yaDevuelto) * 100) / 100;

  const [modo, setModo] = useState<"total" | "parcial">("total");
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const importeParcial = Number(importe.replace(",", "."));
  const parcialValido = importe !== "" && importeParcial > 0 && importeParcial <= restante;
  const puedeEnviar = !enviando && (modo === "total" || parcialValido);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar) return;

    setEnviando(true);
    try {
      const resultado = await apiFetch<ResultadoReembolso>(
        `/admin/pedidos/${pedido.id}/reembolso`,
        {
          method: "POST",
          body: JSON.stringify({
            // Sin importe = "todo lo pendiente": lo calcula la API, así no
            // depende de que aquí la resta cuadre al céntimo.
            ...(modo === "parcial" ? { importe: importeParcial } : {}),
            ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          }),
        },
      );

      toast.success(
        resultado.es_total
          ? `Devueltos ${formatEUR(resultado.importe)}. Pedido reembolsado${resultado.stock_repuesto ? " y stock repuesto" : ""}.`
          : `Devueltos ${formatEUR(resultado.importe)} de ${formatEUR(total)}.`,
      );
      onReembolsado(resultado);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo procesar el reembolso");
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reembolso-titulo"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void enviar(e)}
        className="w-full max-w-md max-h-[90vh] space-y-5 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="reembolso-titulo" className="text-lg font-semibold">
            Reembolsar pedido
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nº {pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Cifras */}
        <dl className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total del pedido</dt>
            <dd className="font-mono">{formatEUR(total)}</dd>
          </div>
          {yaDevuelto > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ya devuelto</dt>
              <dd className="font-mono text-amber-600">−{formatEUR(yaDevuelto)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <dt>Pendiente de devolver</dt>
            <dd className="font-mono">{formatEUR(restante)}</dd>
          </div>
        </dl>

        {/* Importe */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">¿Cuánto devuelves?</legend>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="modo"
              checked={modo === "total"}
              onChange={() => setModo("total")}
            />
            <span>
              <span className="font-medium">Todo lo pendiente</span>
              <span className="ml-1.5 font-mono text-muted-foreground">
                {formatEUR(restante)}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="modo"
              checked={modo === "parcial"}
              onChange={() => setModo("parcial")}
            />
            <span className="font-medium">Otro importe</span>
          </label>

          {modo === "parcial" && (
            <div className="pl-3">
              <div className="relative max-w-[180px]">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max={restante}
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  autoFocus
                  aria-label="Importe a devolver en euros"
                  className="w-full rounded-lg border bg-background py-2 pl-3 pr-8 text-sm font-mono"
                  placeholder="0,00"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
              </div>
              {importe !== "" && !parcialValido && (
                <p className="mt-1.5 text-xs text-destructive">
                  Introduce un importe entre 0,01 € y {formatEUR(restante)}.
                </p>
              )}
            </div>
          )}
        </fieldset>

        {/* Motivo */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional, interno)</span>
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Producto defectuoso, envío perdido…"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            El dinero se devuelve en Stripe al confirmar y <strong>no se puede deshacer</strong>.
            {modo === "total" && restante === total
              ? " El pedido pasará a Reembolsado y sus unidades volverán al inventario."
              : ""}{" "}
            Se avisará al cliente por correo.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!puedeEnviar}>
            {enviando
              ? "Procesando…"
              : `Devolver ${formatEUR(modo === "total" ? restante : parcialValido ? importeParcial : 0)}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
