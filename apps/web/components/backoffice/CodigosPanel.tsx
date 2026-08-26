"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Plus, Tag, Trash2, TruckIcon } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useNivel } from "@components/backoffice/PermisosProvider";
import { formatEUR } from "@lib/utils";
import { finDelDiaEnEspana } from "@lib/tiempo/dia-de-la-tienda";
import type { CodigoDescuento, TipoCodigoDescuento } from "@valatino/types";

/**
 * Los códigos de descuento (migración 083).
 *
 * ⚠️⚠️ AQUÍ NO SE DECIDE NADA. Si un código vale, y cuánto descuenta, lo dice
 * `codigo_descuento_aplicable` en la base: ese importe se le COBRA al cliente y se le
 * FACTURA, así que la regla tiene que vivir en un solo sitio. Esta pantalla crea filas
 * y las apaga.
 *
 * ⚠️ Y VA JUNTO A LA TARIFA DE ENVÍO a propósito, no en un módulo nuevo. `StaffModulo`
 * es una unión cerrada Y un CHECK que ya se ha reescrito cuatro veces; los códigos son
 * configuración del negocio, como el IBAN y el porte, así que ya tenían su sitio.
 */

const VACIO = {
  codigo: "",
  tipo: "porcentaje" as TipoCodigoDescuento,
  porcentaje: "",
  descripcion: "",
  minimo_articulos: "",
  usos_maximos: "",
  valido_hasta: "",
};

/** `null` cuando el campo está vacío: 0 y «sin valor» no son lo mismo aquí. */
const numeroONulo = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function CodigosPanel() {
  const nivel = useNivel("ti") ?? "lectura";
  const puedeEditar = nivel === "total";

  const [codigos, setCodigos] = useState<CodigoDescuento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);

  const cargar = async () => {
    try {
      setCodigos(await apiFetch<CodigoDescuento[]>("/admin/ti/codigos"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar los códigos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const crear = async () => {
    setCreando(true);
    try {
      await apiFetch("/admin/ti/codigos", {
        method: "POST",
        body: JSON.stringify({
          codigo: form.codigo.trim(),
          tipo: form.tipo,
          // ⚠️ El porcentaje solo va en su tipo: el de envío gratis no descuenta de
          // la mercancía, quita el porte. El servidor lo rechaza si se cuelan los dos.
          porcentaje: form.tipo === "porcentaje" ? numeroONulo(form.porcentaje) : null,
          descripcion: form.descripcion.trim() || null,
          minimo_articulos: numeroONulo(form.minimo_articulos),
          usos_maximos: numeroONulo(form.usos_maximos),
          /**
           * ⚠️⚠️ ESTO ERA `new Date(form.valido_hasta).toISOString()` Y REGALABA CERO
           * DÍAS. Un `<input type="date">` da `"2026-08-26"`, y `new Date` de eso es
           * medianoche UTC del **principio** del 26; la base compara
           * `now() > valido_hasta`, así que el código moría justo cuando empezaba el
           * día que llevaba escrito.
           *
           * No es teoría: los tres primeros códigos de la tienda se crearon así y los
           * tres estaban caducados a la mañana siguiente, con su fecha aún puesta.
           *
           * `finDelDiaEnEspana` cierra el día a las 23:59:59.999 de **Europe/Madrid**,
           * que es el calendario en el que razona la base (`dia_fiscal`).
           */
          valido_hasta: finDelDiaEnEspana(form.valido_hasta),
        }),
      });
      toast.success(`Código «${form.codigo.trim()}» creado`);
      setForm(VACIO);
      setAbierto(false);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el código");
    } finally {
      setCreando(false);
    }
  };

  const alternar = async (c: CodigoDescuento) => {
    try {
      await apiFetch(`/admin/ti/codigos/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !c.activo }),
      });
      toast.success(`«${c.codigo}» ${c.activo ? "desactivado" : "activado"}`);
      await cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cambiar el código");
    }
  };

  const borrar = async (c: CodigoDescuento) => {
    if (!confirm(`¿Borrar «${c.codigo}»? Solo se puede si nunca se ha usado.`)) return;
    try {
      await apiFetch(`/admin/ti/codigos/${c.id}`, { method: "DELETE" });
      toast.success(`«${c.codigo}» borrado`);
      await cargar();
    } catch (err) {
      // ⚠️ El 409 de «ya se usó» trae su explicación desde el servidor: es la que
      // dice qué hacer en su lugar (desactivarlo), y por eso se enseña tal cual.
      toast.error(err instanceof ApiError ? err.message : "No se pudo borrar el código");
    }
  };

  const codigoMal = form.codigo.trim().length > 0 && form.codigo.trim().length < 3;
  const faltaPorcentaje = form.tipo === "porcentaje" && numeroONulo(form.porcentaje) === null;
  const listo = form.codigo.trim().length >= 3 && !faltaPorcentaje;

  return (
    <section className="max-w-3xl rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Tag className="h-4 w-4" />
        Códigos de descuento
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dos tipos: un <strong>porcentaje</strong> sobre los artículos, o el{" "}
        <strong>envío gratis</strong>. Se aplican a partir del siguiente carrito; los
        checkouts que ya estén en marcha conservan el importe que se les enseñó.
      </p>

      {/*
        ⚠️⚠️ LOS TRES AVISOS DE ABAJO NO SON DECORACIÓN. Cada uno es una consecuencia
        real que quien crea un código no puede adivinar, y las tres están explicadas en
        la cabecera de la migración 083.
      */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>El máximo de usos se puede rebasar.</strong> Se comprueba cuando el
            cliente aplica el código y se consume cuando paga, minutos después: dos
            compras a la vez con un código de un solo uso lo gastan las dos. Es a
            propósito — bloquearlo obligaría a abortar el pedido de alguien que ya pagó.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Si el código vale dinero, que sea largo y no adivinable.</strong> La
            caja del carrito no exige cuenta, así que cualquiera puede ir probando
            nombres. Para una campaña pública da igual; para un código de disculpa a un
            cliente, «VERANO20» se adivina y «VJ7K2QMX» no.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>No lo uses para pagar algo.</strong> Un código que se da{" "}
            <em>a cambio</em> de una reseña, un referido o suscribirse no es un descuento
            para Hacienda (art. 78.Tres.2 LIVA): es el precio de otra cosa, y sí forma
            parte de la base imponible. Estos códigos no sirven para eso y nada te lo
            impide técnicamente.
          </p>
        </div>
      </div>

      {cargando ? (
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          {codigos.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Todavía no hay ningún código. Sin ninguno, la tienda funciona exactamente
              como hasta ahora.
            </p>
          ) : (
            <ul className="mt-6 divide-y rounded-lg border">
              {codigos.map((c) => {
                const agotado = c.usosMaximos !== null && c.usos >= c.usosMaximos;
                const caducado = c.validoHasta !== null && new Date(c.validoHasta) < new Date();
                const vivo = c.activo && !agotado && !caducado;

                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{c.codigo}</span>
                        {c.tipo === "envio_gratis" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">
                            <TruckIcon className="h-3 w-3" /> envío gratis
                          </span>
                        ) : (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-900">
                            −{c.porcentaje} %
                          </span>
                        )}
                        {/* Un código apagado, agotado o caducado se distingue del vivo:
                            son tres motivos distintos y el que lo mira necesita saber
                            cuál, porque la solución es distinta en cada caso. */}
                        {!vivo && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {!c.activo ? "desactivado" : agotado ? "agotado" : "caducado"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.usos} {c.usos === 1 ? "uso" : "usos"}
                        {c.usosMaximos !== null && ` de ${c.usosMaximos}`}
                        {c.minimoArticulos !== null &&
                          ` · mínimo ${formatEUR(c.minimoArticulos)}`}
                        {c.validoHasta &&
                          ` · hasta ${new Date(c.validoHasta).toLocaleDateString("es-ES")}`}
                        {c.descripcion && ` · ${c.descripcion}`}
                      </p>
                    </div>

                    {puedeEditar && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => void alternar(c)}>
                          {c.activo ? "Desactivar" : "Activar"}
                        </Button>
                        {/* ⚠️ El botón solo aparece si nunca se usó. Uno usado es la
                            prueba de qué descuento llevaron esas ventas, así que el
                            servidor lo niega — pero ofrecerlo para que dé error sería
                            enseñar una puerta que no abre. */}
                        {c.usos === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void borrar(c)}
                            aria-label={`Borrar ${c.codigo}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {puedeEditar && !abierto && (
            <Button className="mt-4" variant="outline" onClick={() => setAbierto(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo código
            </Button>
          )}

          {puedeEditar && abierto && (
            <div className="mt-4 space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cd-codigo">Código</Label>
                  <Input
                    id="cd-codigo"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="VERANO20"
                    className="font-mono"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Da igual mayúsculas o minúsculas: el cliente puede escribirlo como
                    quiera.
                  </p>
                  {codigoMal && (
                    <p className="mt-1 text-xs text-destructive">Al menos 3 caracteres.</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="cd-tipo">Tipo</Label>
                  <select
                    id="cd-tipo"
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({ ...form, tipo: e.target.value as TipoCodigoDescuento })
                    }
                    className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="porcentaje">Porcentaje sobre los artículos</option>
                    <option value="envio_gratis">Envío gratis</option>
                  </select>
                </div>

                {form.tipo === "porcentaje" && (
                  <div>
                    <Label htmlFor="cd-pct">Porcentaje</Label>
                    <Input
                      id="cd-pct"
                      inputMode="decimal"
                      value={form.porcentaje}
                      onChange={(e) => setForm({ ...form, porcentaje: e.target.value })}
                      placeholder="20"
                    />
                    {/* ⚠️ El tope de 90 no es capricho: un cupón del 100 % dejaría el
                        pedido a 0 y ni el esquema ni la pasarela lo admiten. Es otra
                        funcionalidad, no un porcentaje más grande. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Entre 1 y 90. Un 100 % no es un descuento: es regalar el pedido, y
                      eso necesita otra cosa.
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="cd-min">Compra mínima (opcional)</Label>
                  <Input
                    id="cd-min"
                    inputMode="decimal"
                    value={form.minimo_articulos}
                    onChange={(e) => setForm({ ...form, minimo_articulos: e.target.value })}
                    placeholder="10"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recomendado: evita que un código se gaste en un carrito de céntimos.
                  </p>
                </div>

                <div>
                  <Label htmlFor="cd-usos">Máximo de usos (opcional)</Label>
                  <Input
                    id="cd-usos"
                    inputMode="numeric"
                    value={form.usos_maximos}
                    onChange={(e) => setForm({ ...form, usos_maximos: e.target.value })}
                    placeholder="sin límite"
                  />
                </div>

                <div>
                  <Label htmlFor="cd-hasta">Válido hasta (opcional)</Label>
                  <Input
                    id="cd-hasta"
                    type="date"
                    value={form.valido_hasta}
                    onChange={(e) => setForm({ ...form, valido_hasta: e.target.value })}
                  />
                  {/* Se dice qué va a pasar, porque «hasta el 26» admite dos lecturas
                      y la tienda ya se comió la mala tres veces. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.valido_hasta
                      ? "Ese día cuenta entero: el código deja de valer a medianoche."
                      : "Sin fecha, el código no caduca."}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="cd-desc">Condiciones que se publican</Label>
                <Input
                  id="cd-desc"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="20 % en toda la tienda del 1 al 31 de agosto, compra mínima 10 €"
                />
                {/*
                  ⚠️⚠️ ESTO NO ES UNA NOTA INTERNA. El art. 19 de la Ley 7/1996 obliga a
                  anunciar la duración y las reglas de la promoción, y eso no se cumple
                  con las fechas de arriba: se cumple con este texto allí donde se
                  difunda el código.
                */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Es el texto que hay que poner donde anuncies el código. La ley pide
                  decir cuánto dura y con qué condiciones (art. 19 Ley 7/1996), y las
                  fechas de aquí arriba no bastan: hay que escribirlo donde el cliente lo
                  vea.
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => void crear()} disabled={!listo || creando}>
                  {creando ? "Creando…" : "Crear código"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setForm(VACIO);
                    setAbierto(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
