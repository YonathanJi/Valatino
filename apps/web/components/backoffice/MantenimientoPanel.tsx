"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Eraser, Rocket } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { usePermisos, useNivel } from "@components/backoffice/PermisosProvider";
import type { EstadoMantenimiento, ResultadoLimpieza } from "@valatino/types";

const PALABRA_LIMPIAR = "BORRAR";
const PALABRA_ARRANCAR = "ARRANCAR";

/**
 * El antes y el después de que la tienda venda de verdad.
 *
 * Mientras se prueba hace falta poder crear ventas, mirarlas y borrarlas para
 * volver a empezar. Esto lo hace en una llamada, dejando el stock cuadrado.
 *
 * ⚠️⚠️ Y lo que de verdad justifica esta pantalla: **ese hábito deja de ser
 * legal en cuanto se emita la primera factura.** Una serie de facturación tiene
 * que ser correlativa y sin huecos, y borrarla para empezar de nuevo es destruir
 * registros contables. Por eso el arranque fiscal es de un solo sentido y, tras
 * él, la limpieza no vuelve a existir.
 */
export function MantenimientoPanel() {
  const { esAdmin } = usePermisos();
  const nivel = useNivel("ti") ?? "lectura";
  // Vaciar la tienda no es «administrar accesos»: el nivel más alto de TI no
  // debería alcanzar. Lo mismo exige la API, que es donde importa.
  const puedeOperar = esAdmin && nivel === "total";

  const [estado, setEstado] = useState<EstadoMantenimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [confirmacion, setConfirmacion] = useState("");
  const [accion, setAccion] = useState<"limpiar" | "arrancar" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [ultima, setUltima] = useState<ResultadoLimpieza | null>(null);

  const cargar = async () => {
    try {
      setEstado(await apiFetch<EstadoMantenimiento>("/admin/ti/ajustes/mantenimiento"));
    } catch {
      // el layout ya protege la ruta
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const cancelar = () => {
    setAccion(null);
    setConfirmacion("");
  };

  const ejecutar = async () => {
    if (!accion) return;
    setTrabajando(true);
    try {
      if (accion === "limpiar") {
        const r = await apiFetch<ResultadoLimpieza>("/admin/ti/ajustes/mantenimiento/limpiar", {
          method: "POST",
        });
        setUltima(r);
        toast.success(`${r.pedidos_borrados} pedido(s) borrados. La tienda vuelve a estar limpia.`);
      } else {
        await apiFetch("/admin/ti/ajustes/mantenimiento/arranque-fiscal", { method: "POST" });
        toast.success("La tienda vende de verdad desde ahora. La limpieza ya no está disponible.");
      }
      cancelar();
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo completar la operación");
    }
    setTrabajando(false);
  };

  if (cargando) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!estado) return null;

  const palabra = accion === "limpiar" ? PALABRA_LIMPIAR : PALABRA_ARRANCAR;

  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Rocket className="h-4 w-4" />
          Puesta en marcha
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Si lo que se vende cuenta de verdad, y qué hacer con los datos de las pruebas.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {estado.en_pruebas ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">La tienda está en pruebas.</p>
            <p className="mt-1">
              Las ventas no cuentan y se pueden borrar para volver a empezar. Hay{" "}
              <strong>{estado.pedidos} pedido(s)</strong> ahora mismo.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-medium">
              <Check className="h-4 w-4" />
              Vendiendo de verdad desde el{" "}
              {new Date(estado.arranque_fiscal_el!).toLocaleString("es-ES")}
            </p>
            <p className="mt-1">
              Las ventas son documentos contables y ya no se pueden borrar desde aquí.
            </p>
          </div>
        )}

        {/* Los descuadres se enseñan JUNTO a la limpieza y no en otra pantalla:
            es justo antes de recalcular el stock cuando importa saber que no
            cuadra, porque después ya no se puede distinguir la causa. */}
        {estado.descuadres.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              {estado.descuadres.length} producto(s) con el stock descuadrado
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {estado.descuadres.map((d) => (
                <li key={d.producto_id}>
                  <strong>{d.nombre}</strong>: el sistema dice {d.stock_hoy} y sus movimientos
                  suman {d.deducido}
                  {d.stock_hoy_menos_deducido > 0 && " (unidades sin explicar)"}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">
              Son unidades que alguien puso o quitó antes de que existiera el libro de ajustes.
              ⚠️ Si limpias, el stock se recalcula desde los movimientos y{" "}
              <strong>estas unidades desaparecen</strong>. Si existen de verdad, regístralas antes
              con un ajuste de tipo «recuento».
            </p>
          </div>
        )}

        {ultima && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="font-medium">Última limpieza</p>
            <p className="mt-1 text-muted-foreground">
              {ultima.pedidos_borrados} pedido(s) borrados ·{" "}
              {Object.keys(ultima.stock_recalculado).length} producto(s) con el stock recalculado ·{" "}
              {ultima.descuadres_tras_limpiar} descuadre(s) después ·{" "}
              {ultima.cuentas_de_cliente_sin_tocar} cuenta(s) de cliente sin tocar (borrarlas es
              cosa aparte).
            </p>
          </div>
        )}

        {/* Lo que no se puede hacer, no se pinta. */}
        {puedeOperar && accion === null && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {estado.en_pruebas && (
              <>
                <Button variant="outline" onClick={() => setAccion("limpiar")}>
                  <Eraser className="mr-2 h-4 w-4" />
                  Borrar los datos de prueba
                </Button>
                <Button variant="outline" onClick={() => setAccion("arrancar")}>
                  <Rocket className="mr-2 h-4 w-4" />
                  Arrancar de verdad
                </Button>
              </>
            )}
          </div>
        )}

        {puedeOperar && accion !== null && (
          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            {accion === "limpiar" ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Se van a borrar {estado.pedidos} pedido(s).</p>
                <p className="text-muted-foreground">
                  Con ellos se van sus líneas, su historial, los pagos, las devoluciones, los
                  carritos, las reservas y las direcciones de envío. <strong>Se conservan</strong>{" "}
                  el catálogo con su stock, las facturas de compra —que son documentos contables
                  reales—, los proveedores, los cargos y esta configuración. El stock vuelve a lo
                  que dicen las compras y los ajustes.
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Esto no tiene vuelta atrás.</p>
                <p className="text-muted-foreground">
                  A partir de ahora las ventas cuentan como operaciones reales y{" "}
                  <strong>la opción de borrar los datos de prueba desaparece para siempre</strong>.
                  Hazlo cuando pases Stripe a modo real, no antes: hoy hay{" "}
                  {estado.pedidos} pedido(s) de prueba que se quedarían dentro.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="confirmar" className="text-xs font-medium">
                Escribe <code className="rounded bg-black/10 px-1">{palabra}</code> para confirmar
              </label>
              <Input
                id="confirmar"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                autoComplete="off"
                className="max-w-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                disabled={confirmacion !== palabra || trabajando}
                onClick={() => void ejecutar()}
              >
                {trabajando
                  ? "Trabajando…"
                  : accion === "limpiar"
                    ? "Borrar ahora"
                    : "Arrancar de verdad"}
              </Button>
              <Button variant="outline" onClick={cancelar} disabled={trabajando}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
