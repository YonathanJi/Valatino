"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ReceiptText } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useNivel } from "@components/backoffice/PermisosProvider";
import { nifValido, normalizarNif } from "@valatino/types";
import type { AjustesEmisor } from "@valatino/types";

const VACIO = {
  nif: "",
  nombre: "",
  direccion: "",
  codigoPostal: "",
  ciudad: "",
  provincia: "",
};

/**
 * Los datos fiscales con los que se firman las facturas (migración 071).
 *
 * ⚠️⚠️ Sin esto NO SE EMITE NINGUNA FACTURA. Y no falla ruidosamente: las ventas
 * siguen funcionando y se quedan sin documento, porque una casilla sin rellenar
 * en Ajustes no puede tumbar una venta. Por eso el aviso de arriba es tan
 * insistente cuando falta — es el único sitio donde se ve.
 *
 * Vive aquí, con el IBAN, porque es configuración del negocio y porque es donde
 * vive `ajustes_tienda`. Quien lo necesita es Contabilidad, y su pantalla de
 * facturas enlaza aquí cuando falta.
 */
export function EmisorPanel() {
  const nivel = useNivel("ti") ?? "lectura";
  const puedeEditar = nivel === "total";

  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState<AjustesEmisor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const a = await apiFetch<AjustesEmisor>("/admin/ti/ajustes/emisor");
        setEstado(a);
        setForm({
          nif: a.nif,
          nombre: a.nombre,
          direccion: a.direccion,
          codigoPostal: a.codigo_postal,
          ciudad: a.ciudad,
          provincia: a.provincia,
        });
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "No se pudieron cargar los datos fiscales",
        );
      } finally {
        setCargando(false);
      }
    };
    void cargar();
  }, []);

  // La misma regla que el servidor —viene de `@valatino/types`— para avisar
  // mientras se teclea. El servidor la vuelve a comprobar: esto es comodidad.
  const nifMal = form.nif.trim().length > 0 && !nifValido(form.nif);
  const completo =
    !nifMal &&
    [form.nif, form.nombre, form.direccion, form.codigoPostal, form.ciudad].every(
      (v) => v.trim().length > 0,
    );

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || !completo) return;

    setGuardando(true);
    try {
      const a = await apiFetch<AjustesEmisor>("/admin/ti/ajustes/emisor", {
        method: "PUT",
        body: JSON.stringify({
          nif: normalizarNif(form.nif),
          nombre: form.nombre.trim(),
          direccion: form.direccion.trim(),
          codigoPostal: form.codigoPostal.trim(),
          ciudad: form.ciudad.trim(),
          provincia: form.provincia.trim() || undefined,
        }),
      });
      setEstado(a);
      setForm((f) => ({ ...f, nif: a.nif }));
      toast.success(
        a.completo
          ? "Datos fiscales guardados. Ya se pueden emitir facturas."
          : "Guardado, pero todavía falta algún dato para poder facturar.",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron guardar los datos fiscales",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <ReceiptText className="h-4 w-4" />
        Datos fiscales para facturar
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        El NIF, el nombre o razón social y el domicilio que van impresos en cada factura. Son
        obligatorios por ley y no se pueden deducir de ningún otro dato de la tienda.
      </p>

      {cargando ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
              estado?.completo
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {estado?.completo ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {estado?.completo ? (
                "Configurado: cada venta emite ya su factura simplificada, y se puede emitir la completa cuando un cliente la pida."
              ) : (
                <>
                  <strong>Todavía no se está emitiendo ninguna factura.</strong> Las ventas
                  funcionan con normalidad y quedan registradas, pero se van quedando sin
                  documento: una casilla sin rellenar aquí no puede tumbar una venta. En cuanto
                  guardes esto, Contabilidad → Facturas te deja emitir de golpe las que falten.
                </>
              )}
            </p>
          </div>

          <form onSubmit={(e) => void guardar(e)} className="mt-5 space-y-4">
            <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="emisor-nif">NIF o CIF</Label>
                  <Input
                    id="emisor-nif"
                    value={form.nif}
                    onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                    placeholder="12345678Z o A58818501"
                    className="font-mono uppercase"
                    aria-invalid={nifMal}
                    autoComplete="off"
                  />
                  {nifMal ? (
                    <p className="text-xs text-destructive">
                      Ese NIF no cuadra con su dígito de control. Revísalo: quedaría impreso en
                      todas las facturas, y una factura emitida no se corrige — se rectifica.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Se comprueba el dígito de control antes de guardar.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emisor-nombre">Nombre o razón social</Label>
                  <Input
                    id="emisor-nombre"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Nombre y apellidos, o la sociedad"
                  />
                  {/* ⚠️ El aviso importa: son dos cosas que se parecen mucho y no
                      son la misma, y por eso este campo NO se rellena solo con el
                      titular de la cuenta bancaria. */}
                  <p className="text-xs text-muted-foreground">
                    No es el titular de la cuenta bancaria: es quien factura.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emisor-direccion">Domicilio fiscal</Label>
                <Input
                  id="emisor-direccion"
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  placeholder="Calle, número, piso"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emisor-cp">Código postal</Label>
                  <Input
                    id="emisor-cp"
                    value={form.codigoPostal}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        codigoPostal: e.target.value.replace(/\D/g, "").slice(0, 5),
                      }))
                    }
                    placeholder="28001"
                    className="font-mono"
                    inputMode="numeric"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emisor-ciudad">Población</Label>
                  <Input
                    id="emisor-ciudad"
                    value={form.ciudad}
                    onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="emisor-provincia">
                    Provincia <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="emisor-provincia"
                    value={form.provincia}
                    onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))}
                  />
                </div>
              </div>
            </fieldset>

            {puedeEditar ? (
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Los cinco primeros campos son obligatorios para poder facturar.
                </p>
                <Button type="submit" disabled={guardando || !completo}>
                  {guardando ? "Guardando…" : "Guardar datos fiscales"}
                </Button>
              </div>
            ) : (
              <p className="border-t pt-4 text-xs text-muted-foreground">
                Hace falta control total de TI para cambiar esto: va impreso en documentos
                contables.
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
