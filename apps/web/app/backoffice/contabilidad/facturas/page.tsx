"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, FileText, ShieldCheck, ShieldAlert } from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { PageHeader } from "@components/backoffice/PageHeader";
import { usePuede } from "@components/backoffice/PermisosProvider";
import { CodigoPostalYPoblacion } from "@components/ubicacion/CodigoPostalYPoblacion";
import { formatEUR } from "@lib/utils";
import { nifValido, normalizarNif, FACTURA_TIPO_LABELS } from "@valatino/types";
import type {
  AjustesEmisor,
  CadenaFacturas,
  FacturaDelLibro,
  PedidoFacturable,
  ResultadoEmitirPendientes,
} from "@valatino/types";

/**
 * `2026-08-13` → `13/08/2026`, partiendo la cadena.
 *
 * ⚠️ NO con `new Date(iso)`: un `YYYY-MM-DD` se interpreta como medianoche UTC, y
 * en España eso es el día anterior a las 22:00 o 23:00. La ficha de compras ya
 * tropezó con esto — una factura del 1 de agosto se imprimía como 31 de julio.
 */
function fecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const RECEPTOR_VACIO = {
  nif: "",
  nombre: "",
  direccion: "",
  codigoPostal: "",
  ciudad: "",
  provincia: "",
};

export default function FacturasPage() {
  const puedeEmitir = usePuede("contabilidad", "edicion");

  const [libro, setLibro] = useState<FacturaDelLibro[]>([]);
  const [facturables, setFacturables] = useState<PedidoFacturable[]>([]);
  const [emisor, setEmisor] = useState<AjustesEmisor | null>(null);
  const [cadena, setCadena] = useState<CadenaFacturas | null>(null);
  const [cargando, setCargando] = useState(true);

  const [pedidoId, setPedidoId] = useState("");
  const [receptor, setReceptor] = useState(RECEPTOR_VACIO);
  const [emitiendo, setEmitiendo] = useState(false);
  const [poniendoAlDia, setPoniendoAlDia] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [l, f, e, c] = await Promise.all([
        apiFetch<FacturaDelLibro[]>("/admin/contabilidad/facturas"),
        apiFetch<PedidoFacturable[]>("/admin/contabilidad/facturas/facturables"),
        // El emisor se lee de TI porque es donde se edita. Aquí solo se necesita
        // saber si está, para avisar en vez de dejar que falle al emitir.
        apiFetch<AjustesEmisor>("/admin/ti/ajustes/emisor"),
        apiFetch<CadenaFacturas>("/admin/contabilidad/facturas/cadena"),
      ]);
      setLibro(l);
      setFacturables(f);
      setEmisor(e);
      setCadena(c);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el libro");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * El atajo desde la ficha del pedido: `?pedido=<uuid>` deja la venta elegida.
   *
   * ⚠️ Se aplica UNA sola vez, con `aplicado`, y hace falta: sin eso, cada vez que
   * se recargasen los facturables —que pasa al emitir— el efecto volvería a
   * seleccionar la venta del enlace y **desharía lo que la persona acabara de
   * hacer**, incluido el `setPedidoId("")` de después de emitir.
   *
   * ⚠️ Y si el pedido NO está entre los facturables se dice, en vez de dejar el
   * desplegable en blanco: la causa normal es que ya tiene su factura completa
   * —alguien pulsó el enlace dos veces, o desde una ficha vieja— y un formulario
   * vacío sin explicación parece que la pantalla se ha perdido.
   */
  const [atajoAplicado, setAtajoAplicado] = useState(false);
  useEffect(() => {
    if (atajoAplicado || cargando) return;

    const delEnlace = new URLSearchParams(window.location.search).get("pedido");
    if (!delEnlace) return;

    setAtajoAplicado(true);
    if (facturables.some((p) => p.pedido_id === delEnlace)) {
      setPedidoId(delEnlace);
    } else {
      toast.info("Esa venta ya no está pendiente de factura completa: mírala en el libro.");
    }
  }, [atajoAplicado, cargando, facturables]);

  const elegido = useMemo(
    () => facturables.find((p) => p.pedido_id === pedidoId) ?? null,
    [facturables, pedidoId],
  );

  /**
   * Abre el PDF de una factura en una pestaña nueva.
   *
   * ⚠️ Se pide con la sesión y se envuelve en un `blob:`: la API se autentica con
   * el Bearer de Supabase, así que un `<a href>` al endpoint daría un 401. Y la
   * URL se revoca con retraso, no justo después de `open`, porque revocarla de
   * inmediato deja la pestaña nueva sin nada que cargar en algunos navegadores.
   */
  const [pdfAbriendo, setPdfAbriendo] = useState<string | null>(null);
  const abrirPdf = async (facturaId: string) => {
    if (pdfAbriendo) return;
    setPdfAbriendo(facturaId);
    try {
      const blob = await apiFetchBlob(`/admin/contabilidad/facturas/${facturaId}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el PDF");
    } finally {
      setPdfAbriendo(null);
    }
  };

  // Cuántas ventas devengadas no tienen NINGÚN documento. Es el número que el
  // aviso del 303 dará por su cuenta cuando exista; aquí se deduce de la lista.
  const sinNinguna = facturables.filter((p) => p.simplificada === null).length;

  const nifMal = receptor.nif.trim().length > 0 && !nifValido(receptor.nif);
  const puedeEnviar =
    !!pedidoId &&
    !nifMal &&
    [receptor.nif, receptor.nombre, receptor.direccion, receptor.codigoPostal, receptor.ciudad].every(
      (v) => v.trim().length > 0,
    );

  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emitiendo || !puedeEnviar) return;

    setEmitiendo(true);
    try {
      const factura = await apiFetch<FacturaDelLibro>("/admin/contabilidad/facturas/completa", {
        method: "POST",
        body: JSON.stringify({
          pedidoId,
          nif: normalizarNif(receptor.nif),
          nombre: receptor.nombre.trim(),
          direccion: receptor.direccion.trim(),
          codigoPostal: receptor.codigoPostal.trim(),
          ciudad: receptor.ciudad.trim(),
          provincia: receptor.provincia.trim() || undefined,
        }),
      });
      toast.success(`Factura ${factura.numero} emitida`);
      setPedidoId("");
      setReceptor(RECEPTOR_VACIO);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo emitir la factura");
    } finally {
      setEmitiendo(false);
    }
  };

  const ponerseAlDia = async () => {
    setPoniendoAlDia(true);
    try {
      const r = await apiFetch<ResultadoEmitirPendientes>(
        "/admin/contabilidad/facturas/pendientes",
        { method: "POST" },
      );
      toast.success(
        r.emitidas === 0
          ? "No había ninguna venta sin factura"
          : `${r.emitidas} factura(s) emitida(s)` +
              (r.saltadas > 0 ? `, ${r.saltadas} sin poder emitir` : ""),
      );
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron emitir");
    } finally {
      setPoniendoAlDia(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        icon={FileText}
        title="Facturas emitidas"
        description="El libro de facturas expedidas. Cada venta emite su simplificada sola; la completa se emite cuando el cliente la pide"
      />

      {/* ⚠️ Sin datos fiscales del emisor no se emite NADA, y no falla de forma
          visible: las ventas siguen y se quedan sin documento. Este aviso es el
          único sitio desde el que se ve, así que va arriba y enlaza al remedio. */}
      {!cargando && emisor && !emisor.completo && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>No se está emitiendo ninguna factura.</strong> Faltan los datos fiscales del
            negocio —NIF, nombre y domicilio—, y sin ellos una factura no es legal. Las ventas
            funcionan igual y quedan registradas, pero se van quedando sin documento.{" "}
            <Link href="/backoffice/ti/ajustes" className="font-medium underline">
              Rellenarlos en TI → Ajustes
            </Link>
            .
          </p>
        </div>
      )}

      {/* Ventas devengadas sin ningún documento. Con el emisor puesto, esto se
          arregla de un clic; sin él, el aviso de arriba es el que manda. */}
      {!cargando && sinNinguna > 0 && emisor?.completo && puedeEmitir && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            Hay <strong>{sinNinguna}</strong> venta{sinNinguna === 1 ? "" : "s"} devengada
            {sinNinguna === 1 ? "" : "s"} sin factura. Se emiten en orden de venta, para que la
            serie salga en el mismo orden que ocurrieron.
          </p>
          <Button
            variant="outline"
            onClick={() => void ponerseAlDia()}
            disabled={poniendoAlDia}
          >
            {poniendoAlDia ? "Emitiendo…" : "Emitir las que faltan"}
          </Button>
        </div>
      )}

      {/* El estado de la cadena de huellas (Verifactu). Solo se pinta en verde si
          hay algo que verificar: decir «intacta» con cero facturas es ruido. */}
      {!cargando && cadena && cadena.facturas > 0 && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
            cadena.intacta
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {cadena.intacta ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>
            {cadena.intacta ? (
              <>
                Cadena de huellas intacta en las {cadena.facturas} facturas: ninguna se ha
                modificado desde que se emitió.
              </>
            ) : (
              <>
                <strong>La cadena de huellas está rota.</strong> No cuadran:{" "}
                {cadena.rotas.join(", ")}. Alguien ha modificado esas facturas por fuera de la
                aplicación.
              </>
            )}
          </p>
        </div>
      )}

      {puedeEmitir && emisor?.completo && (
        <section className="max-w-3xl rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Emitir factura completa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando un cliente pide «la factura con mis datos». Sustituye a la simplificada de esa
            venta, que deja de contar en el libro para que el IVA no salga dos veces.
          </p>

          <form onSubmit={(e) => void emitir(e)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pedido">Venta</Label>
              <select
                id="pedido"
                value={pedidoId}
                onChange={(e) => setPedidoId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Elige la venta…</option>
                {facturables.map((p) => (
                  <option key={p.pedido_id} value={p.pedido_id}>
                    {p.numero_pedido} · {fecha(p.devengado_el.slice(0, 10))} ·{" "}
                    {formatEUR(p.total)}
                    {p.cliente ? ` · ${p.cliente}` : ""}
                  </option>
                ))}
              </select>
              {facturables.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay ventas pendientes de factura completa.
                </p>
              ) : (
                elegido && (
                  <p className="text-xs text-muted-foreground">
                    {elegido.simplificada
                      ? `Sustituirá a la simplificada ${elegido.simplificada}.`
                      : "Esta venta no llegó a tener simplificada, así que la completa no sustituye a nada."}
                  </p>
                )
              )}
            </div>

            {/* ⚠️ NADA de esto se rellena solo desde el pedido, y es deliberado:
                el documento del checkout puede no ser el NIF de la factura —el CIF
                de una empresa— y la dirección guardada es la de ENVÍO, que no tiene
                que ser el domicilio fiscal. Se muestra como PISTA, no prerrellenado. */}
            {elegido?.documento_cliente && (
              <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                En el checkout dio el documento{" "}
                <code className="font-mono">{elegido.documento_cliente}</code>. No se copia solo:
                puede no ser el NIF que va en la factura, y la dirección que tenemos es la de
                envío. Confírmalo con quien pide la factura.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-nif">NIF o CIF del cliente</Label>
                <Input
                  id="r-nif"
                  value={receptor.nif}
                  onChange={(e) => setReceptor((r) => ({ ...r, nif: e.target.value }))}
                  placeholder="12345678Z o A58818501"
                  className="font-mono uppercase"
                  aria-invalid={nifMal}
                  autoComplete="off"
                />
                {nifMal && (
                  <p className="text-xs text-destructive">
                    Ese NIF no cuadra con su dígito de control.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="r-nombre">Nombre o razón social</Label>
                <Input
                  id="r-nombre"
                  value={receptor.nombre}
                  onChange={(e) => setReceptor((r) => ({ ...r, nombre: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="r-direccion">Domicilio fiscal</Label>
              <Input
                id="r-direccion"
                value={receptor.direccion}
                onChange={(e) => setReceptor((r) => ({ ...r, direccion: e.target.value }))}
                placeholder="Calle, número, piso"
              />
            </div>

            {/* ⚠️ Eran tres campos de texto libre, y `VALF202600100` acabó con la
                población «Mejorada del campo» en minúscula mientras el pedido de
                esa misma venta guardaba la forma oficial. En un documento que no
                se puede editar, eso no se arregla después. Ver la 076. */}
            <CodigoPostalYPoblacion
              idPrefijo="r"
              valor={{
                codigoPostal: receptor.codigoPostal,
                ciudad: receptor.ciudad,
                provincia: receptor.provincia,
              }}
              onChange={(u) =>
                setReceptor((r) => ({
                  ...r,
                  codigoPostal: u.codigoPostal,
                  ciudad: u.ciudad,
                  provincia: u.provincia,
                }))
              }
            />

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Una factura emitida no se edita ni se borra: corregirla es emitir una
                rectificativa.
              </p>
              <Button type="submit" disabled={emitiendo || !puedeEnviar}>
                {emitiendo ? "Emitiendo…" : "Emitir factura"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Libro de facturas expedidas</h2>
        </div>

        {cargando ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : libro.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Todavía no se ha emitido ninguna factura.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Número</th>
                  <th className="p-3 font-medium">Tipo</th>
                  <th className="p-3 font-medium">Expedida</th>
                  <th className="p-3 font-medium">Operación</th>
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 font-medium">Venta</th>
                  <th className="p-3 text-right font-medium">Base</th>
                  <th className="p-3 text-right font-medium">Cuota</th>
                  <th className="p-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {libro.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-b last:border-0 ${f.vigente ? "" : "text-muted-foreground"}`}
                  >
                    <td className="p-3 font-mono">
                      {/* Se pincha y se abre el PDF, igual que en la ficha del
                          pedido. No es un `<a href>` porque la API se autentica
                          con el Bearer de Supabase y un enlace pelado daría 401
                          (ver `apiFetchBlob`). */}
                      <button
                        type="button"
                        onClick={() => void abrirPdf(f.id)}
                        disabled={pdfAbriendo === f.id}
                        className="underline underline-offset-2 hover:no-underline disabled:opacity-60"
                      >
                        {f.numero}
                      </button>
                      {/* Una sustituida no se tacha ni se esconde: existe, se
                          emitió y está en el libro. Lo que cambia es que NO cuenta. */}
                      {!f.vigente && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                          sustituida por {f.sustituida_por}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{FACTURA_TIPO_LABELS[f.tipo]}</td>
                    <td className="p-3">{fecha(f.fecha_expedicion)}</td>
                    <td className="p-3">{fecha(f.fecha_operacion)}</td>
                    <td className="p-3">
                      {f.receptor ? (
                        <>
                          {f.receptor.nombre}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {f.receptor.nif}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {/* El otro extremo del atajo: del libro a la venta. Va por
                        `numero_pedido` y no por el uuid porque es lo que hay en
                        la fila y lo que se lee en el resto del panel. */}
                    <td className="p-3 font-mono text-xs">
                      {f.numero_pedido ? (
                        <Link
                          href={`/backoffice/pedidos?pedido=${f.numero_pedido}`}
                          className="underline underline-offset-2 hover:no-underline"
                        >
                          {f.numero_pedido}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-right">{formatEUR(f.base_total)}</td>
                    <td className="p-3 text-right">{formatEUR(f.cuota_total)}</td>
                    <td className="p-3 text-right font-medium">{formatEUR(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* La suma que importa es la de las VIGENTES, y decirlo es la mitad del
            valor: sin la nota, alguien sumaría la columna y le saldría de más. */}
        {!cargando && libro.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
            <p className="text-muted-foreground">
              {libro.filter((f) => f.vigente).length} de {libro.length} vigentes. Una simplificada
              canjeada por una completa sigue en el libro pero no cuenta: si contaran las dos, el
              IVA de esa venta estaría dos veces.
            </p>
            <p className="font-medium">
              <Check className="mr-1 inline h-4 w-4 text-emerald-600" />
              Cuota vigente:{" "}
              {formatEUR(
                libro.filter((f) => f.vigente).reduce((acc, f) => acc + Number(f.cuota_total), 0),
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
