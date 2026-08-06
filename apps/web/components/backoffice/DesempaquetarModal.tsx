"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import type { Producto, ResultadoDesempaquetado } from "@valatino/types";

interface DesempaquetarModalProps {
  /** El bulto que se abre: la fila desde la que se pulsó */
  origen: Producto;
  /** Catálogo completo (incluye borradores) para elegir el destino */
  productos: Producto[];
  onCerrar: () => void;
  onHecho: () => void;
}

/**
 * Abre bultos de un producto y convierte su contenido en unidades de otro.
 *
 * Caja y unidad son productos independientes con stock propio (ver migración
 * 056: un solo stock con factores tocaría `reservar_carrito`, `confirmar_venta`
 * y los reembolsos, la ruta por la que pasa el dinero). Esta pantalla registra
 * lo que pasa físicamente: se abre una caja y aparecen N unidades.
 *
 * **El resumen de antes de confirmar no es decoración.** Un desempaquetado mueve
 * stock en dos productos a la vez y no hay botón de deshacer: enseñar
 * «quedarán 3 cajas y 48 unidades» antes de pulsar es lo que evita descubrir el
 * error cuando falte mercancía para servir un pedido.
 */
export function DesempaquetarModal({
  origen,
  productos,
  onCerrar,
  onHecho,
}: DesempaquetarModalProps) {
  const [destinoId, setDestinoId] = useState("");
  const [bultos, setBultos] = useState(1);
  const [porBulto, setPorBulto] = useState(12);
  const [guardando, setGuardando] = useState(false);

  // Cualquier producto menos el propio bulto. Se incluyen los borradores: lo
  // normal es crear «X unidad» y desempaquetar en él antes de publicarlo.
  const candidatos = useMemo(
    () => productos.filter((p) => p.id !== origen.id),
    [productos, origen.id],
  );

  const destino = candidatos.find((p) => p.id === destinoId) ?? null;

  const bultosValidos = Number.isFinite(bultos) && bultos >= 1 && bultos <= origen.stock_disponible;
  const porBultoValido = Number.isFinite(porBulto) && porBulto >= 1;
  const puedeEnviar = Boolean(destino) && bultosValidos && porBultoValido && !guardando;

  const unidades = bultosValidos && porBultoValido ? bultos * porBulto : 0;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar || !destino) return;

    setGuardando(true);
    try {
      const r = await apiFetch<ResultadoDesempaquetado>("/productos/desempaquetar", {
        method: "POST",
        body: JSON.stringify({
          origen_id: origen.id,
          destino_id: destino.id,
          bultos,
          unidades_por_bulto: porBulto,
        }),
      });

      toast.success(
        `${r.bultos} × «${r.origen_nombre}» → ${r.unidades_generadas} de «${r.destino_nombre}»`,
      );
      onHecho();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo desempaquetar");
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desempaquetar-titulo"
      onClick={onCerrar}
    >
      <form
        onSubmit={(e) => void enviar(e)}
        className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 id="desempaquetar-titulo" className="font-semibold">
            Desempaquetar «{origen.nombre}»
          </h2>
          <p className="text-sm text-muted-foreground">
            Tienes <span className="font-mono font-medium text-foreground">{origen.stock_disponible}</span>{" "}
            sin reservar. Lo que abras dejará de venderse como bulto y pasará a unidades.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dp-destino" className="text-sm font-medium">
            Se convierte en <span className="text-destructive">*</span>
          </label>
          <select
            id="dp-destino"
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
          >
            <option value="" disabled>
              Elige el producto de la unidad suelta…
            </option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.activo ? "" : " · borrador"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="dp-bultos" className="text-sm font-medium">
              Bultos que abres
            </label>
            <input
              id="dp-bultos"
              type="number"
              min={1}
              max={origen.stock_disponible}
              value={Number.isNaN(bultos) ? "" : bultos}
              onChange={(e) => setBultos(parseInt(e.target.value, 10))}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background font-mono text-right"
            />
            {!bultosValidos && !Number.isNaN(bultos) && (
              <p className="text-xs text-destructive">
                Entre 1 y {origen.stock_disponible}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dp-por-bulto" className="text-sm font-medium">
              Unidades por bulto
            </label>
            <input
              id="dp-por-bulto"
              type="number"
              min={1}
              value={Number.isNaN(porBulto) ? "" : porBulto}
              onChange={(e) => setPorBulto(parseInt(e.target.value, 10))}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background font-mono text-right"
            />
          </div>
        </div>

        {/* Qué va a pasar, en números, antes de que no haya vuelta atrás. */}
        {destino && unidades > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <p>
              Se generan <span className="font-mono font-semibold">{unidades}</span> unidades de «
              {destino.nombre}».
            </p>
            <p className="text-muted-foreground text-xs font-mono">
              {origen.nombre}: {origen.stock_disponible} → {origen.stock_disponible - bultos}
              {"  ·  "}
              {destino.nombre}: {destino.stock_disponible} → {destino.stock_disponible + unidades}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!puedeEnviar}>
            {guardando ? "Desempaquetando…" : "Desempaquetar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
