"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useNivel } from "@components/backoffice/PermisosProvider";
import { formatEUR } from "@lib/utils";
import type { AjustesEnvio } from "@valatino/types";

/**
 * La tarifa de envío (migración 080).
 *
 * ⚠️⚠️ ESTA PANTALLA ES LA QUE APAGA UNA SANGRÍA. Hasta que exista un número
 * aquí, la tienda envía GRATIS a toda España: no era una decisión comercial, es
 * que el concepto no existía en la base de datos. Se han vendido artículos de
 * 0,62 € con el porte pagado por la casa.
 *
 * ⚠️ Y aquí no se calcula nada. El importe que se le cobra a cada cliente lo
 * decide `coste_envio_de` en la base; esto solo guarda los dos números. La regla
 * en dos sitios sería cobrar uno y facturar otro el día que difieran.
 */
export function EnvioPanel() {
  const nivel = useNivel("ti") ?? "lectura";
  const puedeEditar = nivel === "total";

  const [coste, setCoste] = useState("");
  const [gratisDesde, setGratisDesde] = useState("");
  const [estado, setEstado] = useState<AjustesEnvio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const a = await apiFetch<AjustesEnvio>("/admin/ti/ajustes/envio");
        setEstado(a);
        setCoste(a.coste.toFixed(2));
        setGratisDesde(a.gratis_desde === null ? "" : a.gratis_desde.toFixed(2));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "No se pudo cargar la tarifa de envío",
        );
      } finally {
        setCargando(false);
      }
    };
    void cargar();
  }, []);

  /**
   * Se admite la coma decimal, que es como se escribe un precio en castellano y
   * lo que va a teclear cualquiera. Sin esto, «4,95» llegaría como `NaN` al
   * servidor y el fallo se leería como «no se pudo guardar», sin decir por qué.
   */
  const aNumero = (v: string): number | null => {
    const limpio = v.trim().replace(",", ".");
    if (limpio === "") return null;
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  };

  const costeNum = aNumero(coste);
  const gratisNum = aNumero(gratisDesde);

  const costeMal = costeNum === null || costeNum < 0 || costeNum > 100;
  // El umbral es opcional; solo está mal si se escribió algo y no vale.
  const gratisMal = gratisDesde.trim() !== "" && (gratisNum === null || gratisNum < 0.01);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || costeMal || gratisMal) return;

    setGuardando(true);
    try {
      const a = await apiFetch<AjustesEnvio>("/admin/ti/ajustes/envio", {
        method: "PUT",
        body: JSON.stringify({
          coste: costeNum,
          gratis_desde: gratisDesde.trim() === "" ? null : gratisNum,
        }),
      });
      setEstado(a);
      setCoste(a.coste.toFixed(2));
      setGratisDesde(a.gratis_desde === null ? "" : a.gratis_desde.toFixed(2));
      toast.success(
        a.cobra_envio
          ? `Guardado. Desde ahora se cobran ${formatEUR(a.coste)} de envío.`
          : "Guardado. La tienda sigue enviando gratis.",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo guardar la tarifa de envío",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Truck className="h-4 w-4" />
        Gastos de envío
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Lo que se cobra por enviar un pedido, con el IVA incluido como el resto de los precios.
        Se aplica a partir del siguiente pedido; los checkouts que ya estén en marcha conservan
        el importe que se les enseñó.
      </p>

      {cargando ? (
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
              estado?.cobra_envio
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {estado?.cobra_envio ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {estado?.cobra_envio ? (
                <>
                  Se cobran <strong>{formatEUR(estado.coste)}</strong> de envío
                  {estado.gratis_desde !== null ? (
                    <>
                      , y sale gratis a partir de <strong>{formatEUR(estado.gratis_desde)}</strong>{" "}
                      de compra.
                    </>
                  ) : (
                    ", en todos los pedidos."
                  )}
                </>
              ) : (
                <>
                  <strong>La tienda está enviando gratis a toda España.</strong> Cada pedido paga
                  el porte de su bolsillo, también los de un euro. Pon aquí lo que cuesta enviar
                  y deja de perder dinero en cada venta pequeña.
                </>
              )}
            </p>
          </div>

          <form onSubmit={(e) => void guardar(e)} className="mt-5 space-y-4">
            <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="envio-coste">Coste del envío</Label>
                  <Input
                    id="envio-coste"
                    value={coste}
                    onChange={(e) => setCoste(e.target.value)}
                    placeholder="4,95"
                    inputMode="decimal"
                    aria-invalid={costeMal}
                    autoComplete="off"
                  />
                  {costeMal ? (
                    <p className="text-xs text-destructive">
                      Escribe un importe entre 0 y 100 €. El tope no es una regla de negocio: es
                      para que un 4995 en vez de 49,95 no se le cobre a nadie.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <strong>0</strong> significa envío gratis, que es lo que hace la tienda hoy.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="envio-gratis">Envío gratis desde (opcional)</Label>
                  <Input
                    id="envio-gratis"
                    value={gratisDesde}
                    onChange={(e) => setGratisDesde(e.target.value)}
                    placeholder="40,00"
                    inputMode="decimal"
                    aria-invalid={gratisMal}
                    autoComplete="off"
                  />
                  {gratisMal ? (
                    <p className="text-xs text-destructive">
                      Escribe un importe de 0,01 € o más, o déjalo vacío. Un umbral de 0 dejaría
                      el envío gratis siempre sin que nadie lo haya decidido.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Vacío = se cobra envío siempre. El carrito le dice al cliente cuánto le
                      falta para llegar.
                    </p>
                  )}
                </div>
              </div>

              {/**
               * El IVA del porte es la pregunta que va a surgir mirando esta
               * pantalla, y contestarla aquí ahorra el «¿y a qué tipo lo cobras?»
               * — que además no tiene una casilla que tocar, a propósito.
               */}
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                El IVA del envío no se elige: los portes forman parte de la base imponible de la
                venta (art. 78.Dos.1º de la Ley del IVA), así que siguen el tipo de la mercancía.
                En un pedido con productos a tipos distintos, el porte se reparte entre ellos a
                prorrata y así sale en la factura.
              </p>
            </fieldset>

            {puedeEditar ? (
              <Button type="submit" disabled={guardando || costeMal || gratisMal}>
                {guardando ? "Guardando…" : "Guardar tarifa"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Necesitas control total del módulo de TI para cambiar la tarifa: esto cambia lo
                que paga cada cliente.
              </p>
            )}
          </form>

          {estado?.actualizado_el && (
            <p className="mt-4 text-xs text-muted-foreground">
              Última modificación: {new Date(estado.actualizado_el).toLocaleString("es-ES")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
