"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR, sanearImporte } from "@lib/utils";
import type {
  LineaReembolso,
  Pedido,
  PedidoDetalle,
  PedidoItem,
  ResultadoReembolso,
} from "@valatino/types";

interface ReembolsoModalProps {
  pedido: Pedido;
  onClose: () => void;
  /** Se llama con el resultado para refrescar la fila sin recargar la tabla */
  onReembolsado: (resultado: ResultadoReembolso) => void;
  /**
   * Releer el pedido desde la API. Se usa cuando la petición se queda sin
   * respuesta y no sabemos si el dinero salió: lo único fiable entonces es
   * volver a preguntar al servidor.
   */
  onRefrescar: () => void;
}

/** Cómo se decide el importe. */
type Modo = "articulos" | "total" | "importe";

/** Una línea del pedido con lo que ya se devolvió de ella descontado. */
interface LineaDisponible {
  item: PedidoItem;
  precio: number;
  /**
   * Lo pagado por la línea ENTERA: PVP × unidades − el descuento imputado (083).
   * Es la base de lo que se devuelve; ver dónde se calcula.
   */
  neto: number;
  yaDevueltas: number;
  disponibles: number;
}

/** Céntimos: sumar euros en coma flotante descuadra el total por un céntimo. */
const cents = (n: number): number => Math.round(n * 100);

export function ReembolsoModal({
  pedido,
  onClose,
  onReembolsado,
  onRefrescar,
}: ReembolsoModalProps) {
  const total = Number(pedido.total);

  // La ficha completa, no la fila de la tabla: hace falta saber qué artículos
  // tiene el pedido y cuáles se devolvieron ya. Preguntarlo al abrir es además
  // lo que evita trabajar sobre un «ya devuelto» de hace diez minutos.
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);

  const [modo, setModo] = useState<Modo>("total");
  const [elegidas, setElegidas] = useState<Record<string, number>>({});
  const [reponerStock, setReponerStock] = useState(true);
  /**
   * Si además se le devuelve el porte (084).
   *
   * ⚠️ Arranca en `false` a propósito, al contrario que `reponerStock`. Devolver
   * mercancía al inventario es lo normal; devolver el porte es una decisión
   * comercial que alguien toma. Y en el modo «todo lo que queda» ni se ofrece: ahí
   * el porte va dentro solo, porque cerrar el pedido ES devolverlo (art. 107 RDL
   * 1/2007) y lo hace la base desde la 080.
   */
  const [devolverEnvio, setDevolverEnvio] = useState(false);
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sinConfirmacion, setSinConfirmacion] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const d = await apiFetch<PedidoDetalle>(`/admin/pedidos/${pedido.id}`);
        if (!vivo) return;
        setDetalle(d);
        // Si queda algún artículo por devolver, se empieza por ahí: es la forma
        // que deja constancia de qué se devuelve. El importe suelto sigue
        // estando para lo que no es un artículo (un gesto comercial, el envío).
        const devueltas = d.reembolso_lineas ?? [];
        const quedan = d.items.some(
          (it) =>
            it.cantidad -
              devueltas
                .filter((l) => l.pedido_item_id === it.id)
                .reduce((s, l) => s + l.cantidad, 0) >
            0,
        );
        setModo(quedan ? "articulos" : "total");
      } catch {
        // Sin la ficha se puede devolver igual, solo que por importe. Que no
        // cargue el detalle no es motivo para impedir una devolución.
        if (vivo) setModo("total");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pedido.id]);

  const yaDevuelto = Number(detalle?.pedido.total_reembolsado ?? pedido.total_reembolsado ?? 0);
  const restante = Math.round((total - yaDevuelto) * 100) / 100;

  const lineas: LineaDisponible[] = useMemo(() => {
    if (!detalle) return [];
    // `?? []` porque Vercel despliega antes que Render: durante esos minutos la
    // API todavía puede ser la de antes, que no manda este campo. Sin esto, el
    // panel de pedidos se caería entero por una ventana de despliegue.
    const devueltas = detalle.reembolso_lineas ?? [];
    return detalle.items.map((item) => {
      const yaDevueltas = devueltas
        .filter((l) => l.pedido_item_id === item.id)
        .reduce((s, l) => s + l.cantidad, 0);
      return {
        item,
        precio: Number(item.precio_unitario),
        /**
         * Lo que el cliente pagó de VERDAD por la línea entera: el PVP menos la
         * parte del descuento que le tocó (083 §4).
         *
         * ⚠️⚠️ ESTO ES LO QUE SE DEVUELVE, Y NO EL PVP. Antes de la 084 este modal
         * sumaba `precio × unidades` y enseñaba esa cifra en el botón, mientras el
         * servidor devolvía el neto: en el pedido 260824015658 el botón decía
         * «Devolver 3,90 €» y Stripe cobraba 3,12 €. El operario no tenía forma de
         * saberlo hasta ver el resultado.
         *
         * ⚠️ `?? 0` para los pedidos anteriores a la 083 y para la ventana de
         * despliegue: sin descuento, neto = PVP y todo queda como estaba.
         */
        neto: item.cantidad * Number(item.precio_unitario) - Number(item.descuento_imputado ?? 0),
        yaDevueltas,
        disponibles: item.cantidad - yaDevueltas,
      };
    });
  }, [detalle]);

  const hayArticulos = lineas.some((l) => l.disponibles > 0);

  /**
   * Lo que se va a devolver por los artículos elegidos.
   *
   * ⚠️⚠️ LA AUTORIDAD DE ESTA CIFRA ES `importe_a_devolver` (083 §6), NO ESTA
   * PANTALLA. Aquí se repite su fórmula —a regañadientes— porque el botón tiene que
   * decir cuánto se va a cobrar ANTES de cobrarlo, y preguntárselo al servidor en
   * cada clic sería un viaje de ida y vuelta por cada unidad. Si algún día las dos
   * discrepan, **manda el servidor** y lo que hay que arreglar es esto.
   *
   * La fórmula, tal cual está en la RPC:
   *
   *     round(neto × (ya + pide) / unidades) − round(neto × ya / unidades)
   *
   * ⚠️ Los dos redondeos ACUMULADOS y no uno por devolución: es lo que hace que
   * devolver 1 y luego 2 unidades sume exactamente lo mismo que devolver 3 de
   * golpe. Redondear el importe de cada devolución por separado dejaría un céntimo
   * suelto en el pedido, que es justo el fallo que la 078 arregló en las
   * rectificativas.
   */
  const { importeArticulos, unidadesElegidas } = useMemo(() => {
    let c = 0;
    let u = 0;
    for (const l of lineas) {
      const n = elegidas[l.item.id] ?? 0;
      if (n <= 0) continue;
      const hasta = cents((l.neto * (l.yaDevueltas + n)) / l.item.cantidad);
      const desde = cents((l.neto * l.yaDevueltas) / l.item.cantidad);
      c += hasta - desde;
      u += n;
    }
    return { importeArticulos: c / 100, unidadesElegidas: u };
  }, [lineas, elegidas]);

  // NaN con «,» o «0,» a medio escribir: importeValido lo descarta solo.
  const importeParcial = Number(importe.replace(",", "."));
  const importeValido = importe !== "" && importeParcial > 0 && importeParcial <= restante;

  /**
   * El porte de este pedido y si queda por devolver (084).
   *
   * ⚠️ Esto solo decide si se ENSEÑA la casilla, para no ofrecer algo que el
   * servidor va a rechazar. **Los guardias de verdad están en otro sitio**: en
   * `ReembolsosService`, que se niega antes de tocar Stripe, y en el
   * `where envio_devuelto_en_refund is null` de la 084, que es el que impide que
   * dos peticiones simultáneas se cuelen las dos. Creerle a la pantalla sería
   * dejar que quien tenga dos pestañas abiertas cobre el porte dos veces.
   */
  const costeEnvio = Number(detalle?.pedido.coste_envio ?? pedido.coste_envio ?? 0);
  const envioYaDevuelto = Boolean(detalle?.pedido.envio_devuelto_en_refund);
  const puedeDevolverEnvio = costeEnvio > 0 && !envioYaDevuelto;
  // Solo cuenta donde se ofrece: con «todo lo que queda» ya está dentro del
  // restante, y con un importe a mano el servidor lo rechaza a propósito.
  const envioAEnviar = modo === "articulos" && devolverEnvio && puedeDevolverEnvio ? costeEnvio : 0;

  // Puede pasar si antes se devolvió dinero sin decir de qué artículo: quedan
  // artículos sin devolver pero ya no queda dinero que devolver por ellos.
  // El porte cuenta para el tope igual que los artículos: es dinero que sale.
  const articulosExcedenRestante = cents(importeArticulos + envioAEnviar) > cents(restante);
  // Con el porte marcado y ninguna unidad elegida, la devolución es SOLO del
  // porte, y es un caso legítimo (084): el pedido llegó tarde y se le compensa el
  // envío sin que devuelva nada.
  const articulosValidos =
    (unidadesElegidas > 0 || envioAEnviar > 0) && !articulosExcedenRestante;

  const importeAEnviar =
    modo === "total"
      ? restante
      : modo === "articulos"
        ? Math.round((importeArticulos + envioAEnviar) * 100) / 100
        : importeParcial;
  // NaN mientras se teclea «0,»: formatEUR lo pintaría como «NaN €» en el botón.
  const importeMostrado = Number.isFinite(importeAEnviar) && importeAEnviar > 0 ? importeAEnviar : 0;

  const puedeEnviar =
    !enviando &&
    !cargando &&
    (modo === "total" || (modo === "articulos" ? articulosValidos : importeValido));

  // Con esto se completa la devolución del pedido: el aviso cambia.
  const cerraraElPedido = cents(importeAEnviar) >= cents(restante) && restante > 0;

  const cambiarUnidades = (id: string, delta: number, maximo: number) =>
    setElegidas((prev) => {
      const actual = prev[id] ?? 0;
      const siguiente = Math.min(Math.max(actual + delta, 0), maximo);
      if (siguiente === 0) {
        const { [id]: _fuera, ...resto } = prev;
        return resto;
      }
      return { ...prev, [id]: siguiente };
    });

  const alternarLinea = (id: string, maximo: number) =>
    setElegidas((prev) => {
      if (prev[id]) {
        const { [id]: _fuera, ...resto } = prev;
        return resto;
      }
      // Marcar la línea propone devolverla entera, que es el caso corriente;
      // quitar unidades desde ahí es un clic, ponerlas desde cero son varios.
      return { ...prev, [id]: maximo };
    });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar) return;

    const lineasAEnviar: LineaReembolso[] = Object.entries(elegidas).map(
      ([pedido_item_id, cantidad]) => ({ pedido_item_id, cantidad }),
    );

    setEnviando(true);
    try {
      const resultado = await apiFetch<ResultadoReembolso>(
        `/admin/pedidos/${pedido.id}/reembolso`,
        {
          method: "POST",
          body: JSON.stringify({
            // Sin importe ni artículos = "todo lo pendiente": lo calcula la API,
            // así no depende de que aquí la resta cuadre al céntimo.
            ...(modo === "articulos"
              ? {
                  // ⚠️ Sin `lineas` cuando no se eligió ninguna unidad: es la
                  // devolución de SOLO el porte, y mandar un array vacío haría que
                  // la API lo tomara por «todo lo pendiente» (que es lo que
                  // significa no mandar nada… con el porte a false). Ver el DTO.
                  ...(lineasAEnviar.length > 0
                    ? { lineas: lineasAEnviar, reponer_stock: reponerStock }
                    : {}),
                  ...(envioAEnviar > 0 ? { devolver_envio: true } : {}),
                }
              : {}),
            ...(modo === "importe" ? { importe: importeParcial } : {}),
            ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          }),
        },
      );

      const devueltos = formatEUR(resultado.importe);
      // Se dice cuánto de eso era el porte, que si no el importe no cuadra con las
      // unidades y parece un error de cálculo. Sale de lo que confirmó el servidor,
      // no de lo que se pidió.
      const conEnvio = resultado.envio_devuelto ? ` · incluye ${formatEUR(costeEnvio)} de envío` : "";
      toast.success(
        resultado.es_total
          ? `Devueltos ${devueltos}. Pedido reembolsado${resultado.stock_repuesto ? " y unidades repuestas al inventario" : ""}${conEnvio}.`
          : `Devueltos ${devueltos} de ${formatEUR(total)}${
              resultado.unidades_devueltas
                ? ` · ${resultado.unidades_devueltas} ${resultado.unidades_devueltas === 1 ? "unidad" : "unidades"}${resultado.stock_repuesto ? " de vuelta en el inventario" : ""}`
                : ""
            }${conEnvio}.`,
      );
      onReembolsado(resultado);
      onClose();
    } catch (err) {
      /*
       * Dos fallos que parecen uno, y contarlos igual es peligroso:
       *
       * · **La API respondió un error** (ApiError) → el reembolso NO se cobró:
       *   nada se toca antes de que Stripe conteste. Se dice qué pasó y se puede
       *   corregir el importe y reintentar sin más.
       *
       * · **No hubo respuesta** (red caída, la pestaña pierde la conexión, el
       *   proxy corta la espera) → NO SE SABE. La API pudo cobrar la devolución
       *   entera y quedarse sin poder contarlo. Aquí el mensaje de antes —«no se
       *   pudo procesar el reembolso»— afirmaba algo que no consta, y quien lo
       *   lee reintenta: si al reintentar cambia el importe o el motivo, la clave
       *   de idempotencia de Stripe ya no protege y el cliente cobra dos veces.
       *   Así que se dice la verdad y se manda a comprobarlo.
       */
      if (err instanceof ApiError) {
        toast.error(err.message);
        setEnviando(false);
        return;
      }
      setSinConfirmacion(true);
    }
  };

  if (sinConfirmacion) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reembolso-incierto-titulo"
      >
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <h2 id="reembolso-incierto-titulo" className="font-semibold">
                No hemos podido confirmar la devolución
              </h2>
              <p className="text-sm text-muted-foreground">
                Se perdió la conexión antes de recibir la respuesta, así que{" "}
                <strong>puede haberse hecho igualmente</strong>. Comprueba en el pedido lo
                que figura como devuelto <strong>antes de volver a intentarlo</strong>.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                onRefrescar();
                onClose();
              }}
            >
              Comprobar el pedido
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reembolso-titulo"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void enviar(e)}
        className="w-full max-w-lg max-h-[90vh] space-y-5 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="reembolso-titulo" className="text-lg font-semibold">
            Reembolsar pedido
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nº {pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Cifras */}
        <dl className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total del pedido</dt>
            <dd className="font-mono">{formatEUR(total)}</dd>
          </div>
          {yaDevuelto > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ya devuelto</dt>
              <dd className="font-mono text-amber-600">−{formatEUR(yaDevuelto)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <dt>Pendiente de devolver</dt>
            <dd className="font-mono">{formatEUR(restante)}</dd>
          </div>
        </dl>

        <fieldset className="space-y-2" disabled={enviando}>
          <legend className="mb-1 text-sm font-medium">¿Qué devuelves?</legend>

          {cargando ? (
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          ) : (
            hayArticulos && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="modo"
                  checked={modo === "articulos"}
                  onChange={() => setModo("articulos")}
                />
                <span>
                  <span className="font-medium">Artículos concretos</span>
                  <span className="ml-1.5 text-muted-foreground">
                    elige cuáles y las unidades
                  </span>
                </span>
              </label>
            )
          )}

          {modo === "articulos" && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              {lineas.map(({ item, precio, yaDevueltas, disponibles }) => {
                const elegida = elegidas[item.id] ?? 0;
                const agotada = disponibles <= 0;

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border bg-card p-3 ${agotada ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={elegida > 0}
                        disabled={agotada}
                        onChange={() => alternarLinea(item.id, disponibles)}
                        aria-label={`Devolver ${item.nombre_producto}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.nombre_producto}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatEUR(precio)} por unidad · {item.cantidad}{" "}
                          {item.cantidad === 1 ? "comprada" : "compradas"}
                          {yaDevueltas > 0 && (
                            <span className="text-amber-700">
                              {" "}
                              · {yaDevueltas} ya {yaDevueltas === 1 ? "devuelta" : "devueltas"}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm">
                        {agotada ? (
                          <span className="text-xs text-muted-foreground">Devuelto</span>
                        ) : elegida > 0 ? (
                          formatEUR(elegida * precio)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>

                    {/* El selector de unidades solo aparece cuando hay más de
                        una que elegir: con una sola, la casilla ya lo dice todo. */}
                    {elegida > 0 && disponibles > 1 && (
                      <div className="mt-2.5 flex items-center gap-2 pl-6">
                        <button
                          type="button"
                          onClick={() => cambiarUnidades(item.id, -1, disponibles)}
                          disabled={elegida <= 1}
                          aria-label={`Una unidad menos de ${item.nombre_producto}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className="min-w-[5.5rem] text-center text-sm tabular-nums"
                          aria-live="polite"
                        >
                          {elegida} de {disponibles}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarUnidades(item.id, 1, disponibles)}
                          disabled={elegida >= disponibles}
                          aria-label={`Una unidad más de ${item.nombre_producto}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-between border-t pt-2.5 text-sm font-medium">
                <span>
                  {unidadesElegidas === 0
                    ? envioAEnviar > 0
                      ? "Solo los gastos de envío"
                      : "Nada seleccionado"
                    : `${unidadesElegidas} ${unidadesElegidas === 1 ? "unidad" : "unidades"}`}
                </span>
                <span className="font-mono">{formatEUR(importeArticulos)}</span>
              </div>

              {/* Con el porte marcado, la suma se desglosa: si no, el botón dice un
                  importe mayor que esta línea y parece un error de cálculo. */}
              {envioAEnviar > 0 && unidadesElegidas > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gastos de envío</span>
                  <span className="font-mono">{formatEUR(envioAEnviar)}</span>
                </div>
              )}

              {articulosExcedenRestante && (
                <p className="text-xs text-destructive">
                  Eso suma {formatEUR(importeArticulos + envioAEnviar)} y de este pedido solo
                  quedan {formatEUR(restante)} por devolver.
                </p>
              )}

              {/* Marcada por defecto: lo normal es que la mercancía vuelva. Se
                  desmarca cuando no se puede revender, y entonces esas unidades
                  no vuelven al inventario tampoco más adelante. */}
              <label className="flex cursor-pointer items-start gap-2.5 border-t pt-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={reponerStock}
                  onChange={(e) => setReponerStock(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Las unidades vuelven al inventario</span>
                  <span className="block text-xs text-muted-foreground">
                    Desmárcalo si la mercancía no se puede volver a vender (defectuosa o
                    perdida en el envío).
                  </span>
                </span>
              </label>

              {/*
                El porte (084). Solo aparece si este pedido pagó envío y no se ha
                devuelto ya: ofrecer algo que el servidor va a rechazar es peor que
                no ofrecerlo.

                ⚠️ Sin marcar por defecto, al contrario que la de arriba: devolver
                el porte es una decisión comercial, no el curso normal de una
                devolución. En una devolución parcial el porte NO se devuelve salvo
                que alguien lo decida — el cliente se queda parte del pedido, así
                que el envío se prestó.

                ⚠️⚠️ Y se puede marcar SIN elegir ninguna unidad: es la devolución
                de solo el porte, para el pedido que llegó tarde o llegó mal y se le
                compensa el envío sin que devuelva nada.
              */}
              {puedeDevolverEnvio && (
                <label className="flex cursor-pointer items-start gap-2.5 border-t pt-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={devolverEnvio}
                    onChange={(e) => setDevolverEnvio(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">
                      Devolver también los gastos de envío
                      <span className="ml-1.5 font-mono text-muted-foreground">
                        {formatEUR(costeEnvio)}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {unidadesElegidas === 0
                        ? "Sin artículos seleccionados se devolverá solo el porte."
                        : "Se suma a los artículos elegidos. Se devuelve una sola vez por pedido."}
                    </span>
                  </span>
                </label>
              )}

              {/* Cuando ya se devolvió, decirlo evita que alguien lo busque y
                  acabe devolviéndolo por importe suelto sin darse cuenta. */}
              {costeEnvio > 0 && envioYaDevuelto && (
                <p className="border-t pt-2.5 text-xs text-muted-foreground">
                  Los gastos de envío ({formatEUR(costeEnvio)}) ya se devolvieron en una
                  devolución anterior de este pedido.
                </p>
              )}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="modo"
              checked={modo === "total"}
              onChange={() => setModo("total")}
            />
            <span>
              <span className="font-medium">Todo lo pendiente</span>
              <span className="ml-1.5 font-mono text-muted-foreground">
                {formatEUR(restante)}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="modo"
              checked={modo === "importe"}
              onChange={() => setModo("importe")}
            />
            <span>
              <span className="font-medium">Otro importe</span>
              <span className="ml-1.5 text-muted-foreground">sin artículo concreto</span>
            </span>
          </label>

          {modo === "importe" && (
            <div className="pl-3">
              <div className="relative max-w-[180px]">
                {/* type="text": con "number" el navegador rechaza la coma y
                    dejaba el campo vacío. El filtrado lo hace sanearImporte. */}
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={importe}
                  onChange={(e) => setImporte(sanearImporte(e.target.value))}
                  autoFocus
                  aria-label="Importe a devolver en euros"
                  aria-invalid={importe !== "" && !importeValido}
                  className="w-full rounded-lg border bg-background py-2 pl-3 pr-8 text-sm font-mono"
                  placeholder="0,00"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
              </div>
              {importe !== "" && !importeValido ? (
                <p className="mt-1.5 text-xs text-destructive">
                  {importeParcial > restante
                    ? `De este pedido solo quedan ${formatEUR(restante)} por devolver.`
                    : `Introduce un importe entre 0,01 € y ${formatEUR(restante)}.`}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Con coma o con punto, como prefieras: 0,50 o 0.50. Este importe{" "}
                  <strong>no queda asociado a ningún artículo</strong>, así que sus unidades
                  no vuelven al inventario.
                </p>
              )}
            </div>
          )}
        </fieldset>

        {/* Motivo */}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional, interno)</span>
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            disabled={enviando}
            placeholder="Producto defectuoso, envío perdido…"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            El dinero se devuelve en Stripe al confirmar y <strong>no se puede deshacer</strong>.
            {cerraraElPedido && " El pedido pasará a Reembolsado."} Se avisará al cliente por
            correo.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!puedeEnviar}>
            {enviando ? "Procesando…" : `Devolver ${formatEUR(importeMostrado)}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
