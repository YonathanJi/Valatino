"use client";

import { useState } from "react";
import { AlertTriangle, Tag, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { useCarrito } from "@lib/hooks/useCarrito";

/**
 * La caja del código de descuento (083).
 *
 * ⚠️⚠️ VA EN EL CARRITO Y NO EN EL CHECKOUT, y es una decisión, no un olvido. El
 * checkout tiene una máquina de estados de reserva de stock —TTL de 15 minutos, un
 * `useRef` para no duplicarla y pantallas que reemplazan la página entera
 * («Reservando productos…», «Tu reserva ha expirado»)—. Un refetch del carrito desde
 * aquí puede reentrar en ese `useEffect` o dejar la caja inaccesible en mitad de una
 * pantalla de estado. En el checkout el descuento se VE en el resumen, pero no se
 * toca: para cambiarlo, se vuelve al carrito.
 *
 * ⚠️ Y NO VALIDA NADA. Manda el código y enseña lo que contesta el servidor. Si vale
 * y cuánto descuenta lo dice `codigo_descuento_aplicable` en la base, que es el único
 * sitio donde eso vive — el importe se le COBRA al cliente y se le FACTURA.
 *
 * ⚠️ El motivo del rechazo lo REDACTA LA BASE y se enseña tal cual. Escribirlo aquí
 * sería el segundo sitio donde divergir: la pantalla diría «caducado» cuando lo que
 * pasa es que no llega al mínimo.
 */
export function CajaCodigo({
  codigoAplicado,
  aviso,
}: {
  /** El código aplicado y válido, o `null`. */
  codigoAplicado: string | null;
  /**
   * Por qué el código guardado NO se está aplicando, o `null`.
   *
   * ⚠️⚠️ ESTO ES LO QUE EVITA EL FALLO SILENCIOSO. Un código puede caducar o agotarse
   * entre que el cliente lo aplica y que vuelve al carrito; sin este aviso vería
   * SUBIR el total sin explicación, que es la peor forma de perder una venta.
   */
  aviso: string | null;
}) {
  // ⚠️ Las llamadas viven en el contexto del carrito, con las de añadir y quitar
  // artículos: es lo que hace que el carrito entero se repinte de una vez y que no
  // haya dos sitios llamando a `/carrito`.
  const { aplicarCodigo, quitarCodigo } = useCarrito();
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aplicar = async () => {
    const limpio = codigo.trim();
    if (limpio.length < 3) return;

    setEnviando(true);
    setError(null);
    // `null` = fue bien. Si no, es el motivo que redactó la base, y se enseña PEGADO
    // a la caja y no en un toast: un toast que dice «te faltan 4 € para el mínimo»
    // desaparece y deja al cliente con un campo vacío y sin saber por qué.
    const motivo = await aplicarCodigo(limpio);
    setEnviando(false);

    if (motivo) {
      setError(motivo);
      return;
    }
    setCodigo("");
    setAbierto(false);
  };

  const quitar = async () => {
    setEnviando(true);
    setError(null);
    await quitarCodigo();
    setEnviando(false);
  };

  // ── Ya hay uno puesto y funcionando ──
  if (codigoAplicado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Tag className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
          <span className="truncate font-mono font-medium">{codigoAplicado}</span>
        </span>
        <button
          type="button"
          onClick={() => void quitar()}
          disabled={enviando}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label={`Quitar el código ${codigoAplicado}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/*
        El aviso del código que dejó de valer. `aria-live` porque aparece sin que la
        página navegue: quien use lector de pantalla tiene que enterarse de que su
        descuento ya no está, que es exactamente la información que se le escaparía.
      */}
      {aviso && (
        <p
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          aria-live="polite"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {aviso}
        </p>
      )}

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ¿Tienes un código de descuento?
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void aplicar();
              }}
              placeholder="Tu código"
              className="font-mono uppercase"
              // Da igual cómo lo escriba: la base compara en mayúsculas y sin
              // espacios. El `uppercase` es solo visual.
              autoComplete="off"
              autoFocus
              aria-label="Código de descuento"
              aria-invalid={error !== null}
            />
            <Button onClick={() => void aplicar()} disabled={codigo.trim().length < 3 || enviando}>
              {enviando ? "…" : "Aplicar"}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive" aria-live="polite">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
