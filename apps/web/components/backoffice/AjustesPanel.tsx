"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Landmark, Settings } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { PageHeader } from "@components/backoffice/PageHeader";
import { MantenimientoPanel } from "@components/backoffice/MantenimientoPanel";
import { EmisorPanel } from "@components/backoffice/EmisorPanel";
import { useNivel } from "@components/backoffice/PermisosProvider";
import { formatearIban, ibanValido, normalizarIban } from "@valatino/types";
import type { AjustesTransferencia } from "@valatino/types";

const VACIO = { iban: "", titular: "", banco: "", dias_plazo: 3 };

export function AjustesPanel() {
  const nivel = useNivel("ti") ?? "lectura";
  const puedeEditar = nivel === "total";

  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState<AjustesTransferencia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const a = await apiFetch<AjustesTransferencia>("/admin/ti/ajustes/transferencia");
      setEstado(a);
      setForm({
        iban: a.iban,
        titular: a.titular,
        banco: a.banco,
        dias_plazo: a.dias_plazo,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar los ajustes");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  // La misma regla que el servidor, para avisar mientras se teclea en vez de
  // al guardar. El servidor la vuelve a comprobar: esto es comodidad, no
  // seguridad.
  const ibanEscrito = normalizarIban(form.iban);
  const ibanMal = ibanEscrito.length > 0 && !ibanValido(ibanEscrito);
  const apagando = !ibanEscrito && !form.titular.trim();

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || ibanMal) return;

    setGuardando(true);
    try {
      const a = await apiFetch<AjustesTransferencia>("/admin/ti/ajustes/transferencia", {
        method: "PUT",
        body: JSON.stringify({
          iban: ibanEscrito,
          titular: form.titular,
          banco: form.banco || undefined,
          dias_plazo: form.dias_plazo,
        }),
      });
      setEstado(a);
      setForm({ iban: a.iban, titular: a.titular, banco: a.banco, dias_plazo: a.dias_plazo });
      toast.success(
        a.disponible
          ? "Cuenta guardada. El pago por transferencia ya se ofrece en la tienda."
          : "Guardado. El pago por transferencia queda desactivado.",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron guardar los ajustes");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        icon={Settings}
        title="Ajustes de la tienda"
        description="Configuración del negocio que no requiere tocar código"
      />

      <section className="max-w-2xl rounded-xl border bg-card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Landmark className="h-4 w-4" />
          Cobro por transferencia
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La cuenta que se le muestra al cliente cuando elige pagar por transferencia. Sin IBAN
          y titular, esa forma de pago no aparece en el checkout.
        </p>

        {cargando ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {/* Estado actual, para no tener que deducirlo del formulario */}
            <div
              className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                estado?.disponible
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {estado?.disponible ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p>
                {estado?.disponible
                  ? "El pago por transferencia está activo en la tienda."
                  : "El pago por transferencia NO se está ofreciendo."}
                {/* Si la cuenta viene del entorno, lo que se guarde aquí no
                    surtirá efecto: hay que saberlo ANTES de guardar y creer
                    que se ha cambiado algo. */}
                {estado?.origen === "entorno" && (
                  <>
                    {" "}
                    <strong>
                      Ahora mismo se está usando una cuenta configurada por variables de entorno
                      en Render, no esta.
                    </strong>{" "}
                    Para que mande lo que guardes aquí, hay que vaciar allí{" "}
                    <code className="rounded bg-black/5 px-1">TRANSFERENCIA_IBAN</code>.
                  </>
                )}
              </p>
            </div>

            <form onSubmit={(e) => void guardar(e)} className="mt-5 space-y-4">
              <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={form.iban}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, iban: formatearIban(e.target.value) }))
                    }
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    className="font-mono"
                    aria-invalid={ibanMal}
                    autoComplete="off"
                  />
                  {ibanMal ? (
                    <p className="text-xs text-destructive">
                      Ese IBAN no cuadra con su dígito de control. Revísalo: con una errata, los
                      clientes transferirían a una cuenta que no existe y no lo sabrías hasta que
                      reclamaran el pedido.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Se comprueba el dígito de control antes de guardar. Déjalo vacío junto al
                      titular para dejar de aceptar transferencias.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="titular">Titular de la cuenta</Label>
                  <Input
                    id="titular"
                    value={form.titular}
                    onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
                    placeholder="Nombre que verá el cliente"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="banco">
                      Banco <span className="font-normal text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="banco"
                      value={form.banco}
                      onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                      placeholder="BBVA, CaixaBank…"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plazo">Días laborables para pagar</Label>
                    <Input
                      id="plazo"
                      type="number"
                      min={1}
                      max={30}
                      value={form.dias_plazo}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dias_plazo: Number(e.target.value) || 3 }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Es también lo que el pedido retiene su stock: subirlo inmoviliza inventario
                      más tiempo.
                    </p>
                  </div>
                </div>
              </fieldset>

              {/* Lo que no se puede hacer no se pinta: sin nivel total, el
                  formulario se ve pero no hay botón de guardar. */}
              {puedeEditar && (
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    {estado?.actualizado_el
                      ? `Última modificación: ${new Date(estado.actualizado_el).toLocaleString("es-ES")}`
                      : "Sin modificar todavía"}
                  </p>
                  <Button type="submit" disabled={guardando || ibanMal}>
                    {guardando ? "Guardando…" : apagando ? "Desactivar" : "Guardar cuenta"}
                  </Button>
                </div>
              )}
            </form>
          </>
        )}
      </section>

      <EmisorPanel />

      <MantenimientoPanel />
    </div>
  );
}
