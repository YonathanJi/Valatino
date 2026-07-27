"use client";

import { useEffect, useMemo, useState } from "react";
import { Smile, MessageSquareQuote } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { PageHeader } from "@components/backoffice/PageHeader";
import {
  ESFUERZO_LABELS,
  SATISFACCION_LABELS,
  tasaRespuesta,
  type CalificacionesPanel,
  type EsfuerzoCompra,
  type SatisfaccionCompra,
} from "@valatino/types";

const CARAS: Record<SatisfaccionCompra, string> = {
  1: "😞",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

const VENTANAS = [
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
  { dias: 365, etiqueta: "1 año" },
];

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

/** Una décima menos de precisión de la que se tiene no ayuda a nadie. */
const fmtMedia = (n: number | null) => (n === null ? "—" : Number(n).toFixed(1));

export default function ExperienciaPage() {
  const [dias, setDias] = useState(90);
  const [datos, setDatos] = useState<CalificacionesPanel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloConComentario, setSoloConComentario] = useState(false);
  const [minSatisfaccion, setMinSatisfaccion] = useState<number | null>(null);

  useEffect(() => {
    setIsLoading(true);
    void (async () => {
      try {
        setDatos(await apiFetch<CalificacionesPanel>(`/admin/calificaciones?dias=${dias}`));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudieron cargar las opiniones");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [dias]);

  const opiniones = useMemo(() => {
    const lista = datos?.opiniones ?? [];
    return lista.filter(
      (o) =>
        (!soloConComentario || Boolean(o.comentario)) &&
        (minSatisfaccion === null || o.satisfaccion <= minSatisfaccion),
    );
  }, [datos, soloConComentario, minSatisfaccion]);

  const resumen = datos?.resumen;
  const tasa = resumen ? tasaRespuesta(resumen) : null;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={Smile}
        back={{ href: "/backoffice/dashboard", label: "Dashboard" }}
        title="Experiencia de compra"
        description="Qué opinan los clientes del proceso de compra"
      >
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {VENTANAS.map((v) => (
            <button
              key={v.dias}
              type="button"
              onClick={() => setDias(v.dias)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                dias === v.dias ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
              }`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        resumen && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Satisfacción media</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {fmtMedia(resumen.satisfaccion_medio)}
                  <span className="text-sm font-normal text-muted-foreground"> / 5</span>
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Esfuerzo medio</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {fmtMedia(resumen.esfuerzo_medio)}
                  <span className="text-sm font-normal text-muted-foreground"> / 3</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Más bajo es mejor: 1 es «fácil»
                </p>
              </div>

              {/* La tasa va al lado de las medias y no escondida: un 4,8 sobre el
                  8 % de los pedidos no dice lo mismo que sobre el 70 %. */}
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Tasa de respuesta</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {tasa === null ? "—" : `${tasa.toFixed(0)}%`}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {resumen.respuestas} de {resumen.pedidos_calificables} pedidos
                </p>
              </div>

              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Para revisar</p>
                <p
                  className={`mt-1 text-2xl font-semibold tabular-nums ${
                    resumen.detractores > 0 ? "text-amber-700" : ""
                  }`}
                >
                  {resumen.detractores}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Calificaron 1 o 2 sobre 5
                </p>
              </div>
            </section>

            {resumen.respuestas === 0 ? (
              <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                Todavía no hay opiniones en este periodo.
                <br />
                Se piden al terminar el pago y no son obligatorias, así que llegan poco a poco.
              </div>
            ) : (
              <>
                <section className="rounded-xl border bg-card p-5">
                  <h2 className="font-semibold">¿Costó comprar?</h2>
                  <div className="mt-3 space-y-2">
                    {(
                      [
                        [1, resumen.faciles],
                        [2, resumen.regulares],
                        [3, resumen.dificiles],
                      ] as [EsfuerzoCompra, number][]
                    ).map(([nivel, n]) => {
                      const pct = resumen.respuestas > 0 ? (n / resumen.respuestas) * 100 : 0;
                      return (
                        <div key={nivel} className="flex items-center gap-3 text-sm">
                          <span className="w-16 shrink-0 text-muted-foreground">
                            {ESFUERZO_LABELS[nivel]}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                nivel === 3 ? "bg-amber-500" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                            {n} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                      <h2 className="font-semibold">
                        Opiniones ({opiniones.length}
                        {opiniones.length !== (datos?.opiniones.length ?? 0)
                          ? ` de ${datos?.opiniones.length}`
                          : ""}
                        )
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Lo escrito por el cliente es lo accionable; las medias solo dicen si vas
                        bien o mal
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSoloConComentario((v) => !v)}
                        className={`rounded-lg border px-2.5 py-1 transition-colors ${
                          soloConComentario
                            ? "border-primary bg-primary/10 font-medium text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        Solo con comentario
                      </button>
                      <button
                        type="button"
                        onClick={() => setMinSatisfaccion((v) => (v === 2 ? null : 2))}
                        className={`rounded-lg border px-2.5 py-1 transition-colors ${
                          minSatisfaccion === 2
                            ? "border-amber-400 bg-amber-50 font-medium text-amber-800"
                            : "hover:bg-muted"
                        }`}
                      >
                        Solo las malas
                      </button>
                    </div>
                  </div>

                  {opiniones.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      Ninguna opinión coincide con el filtro.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {opiniones.map((o) => (
                        <li key={o.pedido_id} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className="text-2xl"
                                title={SATISFACCION_LABELS[o.satisfaccion]}
                                aria-label={SATISFACCION_LABELS[o.satisfaccion]}
                              >
                                {CARAS[o.satisfaccion]}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {o.envio_nombre ?? o.email_cliente ?? "Cliente"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-mono">{o.numero_pedido ?? "—"}</span>
                                  {" · "}
                                  {formatEUR(o.total)}
                                  {" · "}
                                  {fmtFecha(o.created_at)}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                o.esfuerzo === 3
                                  ? "bg-amber-100 text-amber-800"
                                  : o.esfuerzo === 2
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {ESFUERZO_LABELS[o.esfuerzo]}
                            </span>
                          </div>
                          {o.comentario && (
                            <p className="mt-2 flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                              <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span>{o.comentario}</span>
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Se pregunta al terminar el pago, así que esto mide <strong>el proceso de compra</strong>:
              no dice nada del envío, y no puede recoger la opinión de quien se fue sin comprar.
            </p>
          </>
        )
      )}
    </div>
  );
}
