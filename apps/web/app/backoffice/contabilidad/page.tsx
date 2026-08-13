"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Calculator, Info } from "lucide-react";
import { rangoTrimestre, trimestreDeMes } from "@valatino/types";
import type { LiquidacionIva, LiquidacionIvaAviso, LiquidacionIvaTramo } from "@valatino/types";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { PageHeader } from "@components/backoffice/PageHeader";
import { Skeleton } from "@components/ui/Skeleton";

/**
 * El primer ejercicio que se puede consultar. No hay nada antes: la tienda
 * empezó a registrar compras en 2026.
 */
const PRIMER_EJERCICIO = 2026;

const TRIMESTRES = [1, 2, 3, 4] as const;

function formatearFecha(iso: string): string {
  // `iso` es YYYY-MM-DD; se parte a mano en vez de construir un Date porque un
  // `new Date("2026-01-01")` se interpreta como UTC y en España se vería como
  // el 31 de diciembre. Es el mismo error de zona que la 068 arregla abajo.
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Un tramo por tipo de IVA, o la fila de «nada» si el periodo está vacío. */
function TablaTramos({
  tramos,
  etiquetaDocumentos,
  documentos,
  unoDeEsos,
}: {
  tramos: LiquidacionIvaTramo[];
  etiquetaDocumentos: string;
  /**
   * Documentos DISTINTOS del bloque, que llega aparte porque **no es la suma de
   * la columna**: lo calcula la base con un `count(distinct …)`.
   */
  documentos: number;
  /** Con artículo y en singular: «una factura», «un pedido», «una devolución». */
  unoDeEsos: string;
}) {
  if (tramos.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        Nada en este periodo.
      </p>
    );
  }

  const base = tramos.reduce((acc, t) => acc + t.base, 0);
  const cuota = tramos.reduce((acc, t) => acc + t.cuota, 0);

  /*
   * ⚠️⚠️ EL FALLO QUE ESTO ARREGLA, Y LO VIO JONATHAN MIRANDO LA PANTALLA.
   *
   * La columna de documentos NO ES ADITIVA: un documento con varios tipos de IVA
   * dentro cuenta en cada fila. El deducible salia «1 · 2 · 2» con dos facturas,
   * y como el pie dejaba esa celda EN BLANCO, nada contradecia el «5».
   *
   * Quien presenta un 303 tiene que poder decir cuantas facturas respaldan una
   * cifra, asi que el numero real va en el total. Y la nota solo se pinta cuando
   * la suma DIFIERE: avisar siempre de una trampa que hoy no existe —un periodo
   * con un solo tipo— es ruido que se aprende a ignorar.
   */
  const sumaColumna = tramos.reduce((acc, t) => acc + t.documentos, 0);
  const noSuma = sumaColumna !== documentos;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
              <th className="px-4 py-2.5 text-right font-medium">Base imponible</th>
              <th className="px-4 py-2.5 text-right font-medium">Cuota</th>
              <th className="px-4 py-2.5 text-right font-medium">{etiquetaDocumentos}</th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t) => (
              <tr key={t.iva_pct} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{t.iva_pct} %</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatEUR(t.base)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatEUR(t.cuota)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {t.documentos}
                </td>
              </tr>
            ))}
          </tbody>
          {/* El total va en el pie y no en una tarjeta aparte: con tres tipos, la
              suma tiene que poder comprobarse a ojo desde las filas de arriba. */}
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatEUR(base)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatEUR(cuota)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{documentos}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {noSuma && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Son <strong>{documentos}</strong> en total, no {sumaColumna}: {unoDeEsos} con varios
          tipos de IVA dentro cuenta en cada fila, así que esa columna no suma.
        </p>
      )}
    </>
  );
}

function Bloque({
  titulo,
  explicacion,
  children,
}: {
  titulo: string;
  explicacion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{explicacion}</p>
      </header>
      {children}
    </section>
  );
}

/**
 * Los avisos, arriba y antes de los números.
 *
 * ⚠️ No es decoración ni un detalle de maquetación: un importe solo sirve si se
 * sabe qué NO está contando. Ponerlos al final dejaría el informe pareciendo
 * limpio, y con esto no se puede parecer limpio sin serlo.
 */
function Avisos({ avisos }: { avisos: LiquidacionIvaAviso[] }) {
  if (avisos.length === 0) return null;

  return (
    <div className="space-y-2">
      {avisos.map((a) => {
        const grave = a.gravedad === "grave";
        const Icono = grave ? AlertTriangle : Info;
        return (
          <div
            key={a.clase}
            className={
              grave
                ? "flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
                : "flex gap-3 rounded-xl border bg-muted/40 p-4"
            }
          >
            <Icono className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{a.titulo}</p>
              <p className={grave ? "mt-0.5 text-amber-900/80" : "mt-0.5 text-muted-foreground"}>
                {a.detalle}
              </p>
              {a.referencias.length > 0 && (
                <p className="mt-1 font-mono text-xs">{a.referencias.join(" · ")}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LiquidacionIvaPage() {
  // El trimestre que se ofrece al abrir es el ANTERIOR al de hoy, que es el que
  // se presenta. Abrir en el trimestre en curso mostraría un periodo a medias y
  // un resultado que va a cambiar.
  const [anio, setAnio] = useState(() => {
    const hoy = new Date();
    const t = trimestreDeMes(hoy.getMonth() + 1);
    return t === 1 ? hoy.getFullYear() - 1 : hoy.getFullYear();
  });
  const [trimestre, setTrimestre] = useState(() => {
    const t = trimestreDeMes(new Date().getMonth() + 1);
    return t === 1 ? 4 : t - 1;
  });

  const [data, setData] = useState<LiquidacionIva | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const rango = useMemo(() => rangoTrimestre(anio, trimestre), [anio, trimestre]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await apiFetch<LiquidacionIva>(
        `/admin/contabilidad/iva?desde=${rango.desde}&hasta=${rango.hasta}`,
      );
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : "No se pudo calcular la liquidación");
    }
    setCargando(false);
  }, [rango.desde, rango.hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejercicios = useMemo(() => {
    const ultimo = Math.max(new Date().getFullYear(), PRIMER_EJERCICIO);
    const lista: number[] = [];
    for (let a = ultimo; a >= PRIMER_EJERCICIO; a--) lista.push(a);
    return lista;
  }, []);

  const resultado = data?.totales.resultado ?? 0;
  const aIngresar = resultado > 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={Calculator}
        title="Liquidación de IVA"
        description="Modelo 303 — el IVA repercutido en las ventas menos el soportado en las compras"
      />

      {/* Selector de periodo. Trimestres naturales, que es como se presenta el
          303; el rango exacto se escribe al lado para que no haya que fiarse. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm font-medium" htmlFor="ejercicio">
          Ejercicio
        </label>
        <select
          id="ejercicio"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          {ejercicios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Trimestre">
          {TRIMESTRES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrimestre(t)}
              aria-pressed={trimestre === t}
              className={
                trimestre === t
                  ? "h-9 border-r bg-primary px-4 text-sm font-medium text-primary-foreground last:border-r-0"
                  : "h-9 border-r px-4 text-sm transition-colors last:border-r-0 hover:bg-muted"
              }
            >
              {t}T
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Del {formatearFecha(rango.desde)} al {formatearFecha(rango.hasta)}
          {data && <span className="ml-1 text-xs">(hora de {data.zona})</span>}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {cargando && (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      )}

      {!cargando && data && (
        <>
          <Avisos avisos={data.avisos} />

          {/* El resultado, arriba de los desgloses: es la cifra por la que se
              entra a esta pantalla. Y con su signo dicho en palabras, porque un
              «-25,10 €» no explica si eso se paga o se compensa. */}
          <div className="rounded-xl border bg-card p-6">
            <p className="text-xs text-muted-foreground">
              {aIngresar ? "Resultado: a ingresar" : "Resultado: a compensar"}
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">
              {formatEUR(Math.abs(resultado))}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatEUR(data.totales.repercutido_cuota)} repercutido −{" "}
              {formatEUR(data.totales.deducible_cuota)} deducible
              {resultado === 0 && " · el periodo queda a cero"}
              {!aIngresar && resultado !== 0 && " · se arrastra al periodo siguiente"}
            </p>
          </div>

          <Bloque
            titulo="IVA devengado — ventas"
            explicacion="Por la fecha en que se cobró cada pedido, no por la de creación: una transferencia se cobra días después."
          >
            <TablaTramos
              tramos={data.devengado}
              etiquetaDocumentos="Pedidos"
              documentos={data.totales.devengado_documentos}
              unoDeEsos="un pedido"
            />
          </Bloque>

          <Bloque
            titulo="Rectificación — devoluciones"
            explicacion="Se resta del devengado, en el periodo en que se devolvió el dinero y al tipo con el que se cobró."
          >
            <TablaTramos
              tramos={data.rectificado}
              etiquetaDocumentos="Devoluciones"
              documentos={data.totales.rectificado_documentos}
              unoDeEsos="una devolución"
            />
          </Bloque>

          <Bloque
            titulo="IVA deducible — compras"
            explicacion="Por la fecha en que la factura quedó anotada, que es la que decide en qué trimestre se deduce."
          >
            <TablaTramos
              tramos={data.deducible}
              etiquetaDocumentos="Facturas"
              documentos={data.totales.deducible_documentos}
              unoDeEsos="una factura"
            />
          </Bloque>

          <p className="text-xs text-muted-foreground">
            El desglose deducible sale del libro de{" "}
            <Link href="/backoffice/compras" className="underline hover:text-foreground">
              facturas de compra
            </Link>
            . Este informe no se guarda en ninguna parte: se calcula al abrirlo desde los
            libros, así que refleja siempre el último dato.
          </p>
        </>
      )}
    </div>
  );
}
