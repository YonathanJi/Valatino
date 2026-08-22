"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, MessageCircle } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useNivel } from "@components/backoffice/PermisosProvider";
import type { IdentidadPublica } from "@valatino/types";

/**
 * Los canales por los que el cliente puede preguntar (migración 081).
 *
 * ⚠️⚠️ ESTA PANTALLA ARREGLA UN AGUJERO QUE LLEVABA MESES ABIERTO SIN QUE NADIE
 * LO VIERA: la política de privacidad mandaba ejercer los derechos del RGPD
 * escribiendo a `soporte@valatino.es`, y el dominio **no tiene registros MX** —
 * ese buzón no recibe nada, así que las solicitudes rebotaban. Un canal de
 * atención al cliente no falla con un error: falla con silencio.
 *
 * Por eso el aviso de abajo insiste en escribirse a uno mismo. Es la única prueba
 * que sirve, y es la que no se hizo.
 */
export function ContactoPanel() {
  const nivel = useNivel("ti") ?? "lectura";
  const puedeEditar = nivel === "total";

  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estado, setEstado] = useState<IdentidadPublica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const a = await apiFetch<IdentidadPublica>("/admin/ti/ajustes/contacto");
        setEstado(a);
        setEmail(a.email ?? "");
        setWhatsapp(a.whatsapp ?? "");
        setTelefono(a.telefono ?? "");
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "No se pudieron cargar los canales de contacto",
        );
      } finally {
        setCargando(false);
      }
    };
    void cargar();
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;

    setGuardando(true);
    try {
      const a = await apiFetch<IdentidadPublica>("/admin/ti/ajustes/contacto", {
        method: "PUT",
        body: JSON.stringify({
          email: email.trim() || null,
          whatsapp: whatsapp.trim() || null,
          telefono: telefono.trim() || null,
        }),
      });
      setEstado(a);
      // Se repinta con lo que devolvió el servidor y no con lo tecleado: el
      // WhatsApp vuelve normalizado («+34 600 11 12 22» → «34600111222») y ver el
      // valor real evita la duda de si se guardó bien.
      setEmail(a.email ?? "");
      setWhatsapp(a.whatsapp ?? "");
      setTelefono(a.telefono ?? "");
      toast.success(
        a.contactable
          ? "Canales guardados. Ya salen en el pie de la tienda."
          : "Guardado, pero la tienda se queda sin ningún canal de contacto.",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron guardar los canales de contacto",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageCircle className="h-4 w-4" />
        Cómo te contactan los clientes
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Salen en el pie de la tienda y en la página de contacto, a la vista de cualquiera sin
        necesidad de tener cuenta. Son también la dirección a la que se dirigen las solicitudes
        de protección de datos.
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
              estado?.contactable
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {estado?.contactable ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {estado?.contactable ? (
                <>
                  Hay al menos un canal publicado.{" "}
                  <strong>Escríbete a ti mismo para comprobar que llega.</strong> Es la prueba
                  que faltaba: el correo que había antes (<code>soporte@valatino.es</code>) llevaba
                  meses publicado y rebotaba, porque el dominio no recibe correo.
                </>
              ) : (
                <>
                  <strong>La tienda no tiene ninguna forma de contacto.</strong> Quien dude antes
                  de comprar no puede preguntar, y las solicitudes de protección de datos no
                  llegan a ninguna parte.
                </>
              )}
            </p>
          </div>

          <form onSubmit={(e) => void guardar(e)} className="mt-5 space-y-4">
            <fieldset disabled={!puedeEditar || guardando} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="contacto-email">Correo de atención al cliente</Label>
                <Input
                  id="contacto-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hola@ejemplo.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  ⚠️ Tiene que ser un buzón que <strong>de verdad recibas</strong>. No hace falta
                  que sea de valatino.es — de hecho hoy ese dominio no puede recibir correo.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contacto-whatsapp">WhatsApp</Label>
                  <Input
                    id="contacto-whatsapp"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="600 11 12 22"
                    inputMode="tel"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Escríbelo como quieras; se guarda con el prefijo que necesita el enlace.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contacto-telefono">Teléfono (opcional)</Label>
                  <Input
                    id="contacto-telefono"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="910 00 00 00"
                    inputMode="tel"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Solo si lo vas a coger: uno que nadie contesta es peor que ninguno.
                  </p>
                </div>
              </div>

              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                El nombre, el NIF y el domicilio que acompañan a estos canales en el aviso legal
                salen de <strong>Datos fiscales para facturar</strong>, aquí abajo. Son el mismo
                dato que firma tus facturas: se cambian en un solo sitio a propósito.
              </p>
            </fieldset>

            {puedeEditar ? (
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar canales"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Necesitas control total del módulo de TI para cambiar esto: se publica en la
                tienda.
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
