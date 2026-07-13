"use client";

import { useMemo, useState } from "react";
import type { DashboardTopProducto, DashboardVentaDia } from "@valatino/types";
import { formatEUR } from "@lib/utils";

/* Tokens de visualización (superficie clara de las tarjetas del backoffice).
   Serie única en azul validado (contraste 4.6:1 sobre blanco); la tinta del
   texto usa siempre los tokens de texto, nunca el color de la serie. */
const SERIE = "#2a78d6";
const GRID = "#e1e0d9";
const EJE = "#c3c2b7";
const TINTA_MUTED = "#898781";

// ============================================================
// Stat tile — KPI de cabecera
// ============================================================

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ============================================================
// Gráfico de línea — ingresos por día (serie única, sin leyenda)
// ============================================================

const W = 640;
const H = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 48 };

function tickLimpio(max: number): number {
  if (max <= 0) return 10;
  const magnitud = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) {
    if (max <= m * magnitud) return m * magnitud;
  }
  return 10 * magnitud;
}

export function GraficoIngresos({ dias }: { dias: DashboardVentaDia[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { puntos, yMax, xDe, yDe } = useMemo(() => {
    const yMax = tickLimpio(Math.max(...dias.map((d) => d.ingresos), 0));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const xDe = (i: number) => PAD.left + (dias.length > 1 ? (i / (dias.length - 1)) * innerW : innerW / 2);
    const yDe = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const puntos = dias.map((d, i) => ({ x: xDe(i), y: yDe(d.ingresos) }));
    return { puntos, yMax, xDe, yDe };
  }, [dias]);

  if (dias.length === 0) return null;

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${linea} L${puntos[puntos.length - 1].x},${yDe(0)} L${puntos[0].x},${yDe(0)} Z`;
  const sinVentas = dias.every((d) => d.ingresos === 0);
  const ultimo = puntos[puntos.length - 1];

  // ~5 etiquetas de fecha equiespaciadas
  const pasoX = Math.max(1, Math.round(dias.length / 5));
  const fechaCorta = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  const desdeEvento = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * W;
    const innerW = W - PAD.left - PAD.right;
    const i = Math.round(((xRel - PAD.left) / innerW) * (dias.length - 1));
    setHover(Math.max(0, Math.min(dias.length - 1, i)));
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos por día, últimos 30 días">
        {/* Gridlines horizontales (hairline, sólidas, recesivas) */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={yDe(yMax * f)} y2={yDe(yMax * f)}
              stroke={f === 0 ? EJE : GRID} strokeWidth="1"
            />
            <text
              x={PAD.left - 8} y={yDe(yMax * f) + 4}
              textAnchor="end" fontSize="11" fill={TINTA_MUTED}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {(yMax * f).toLocaleString("es-ES")} €
            </text>
          </g>
        ))}

        {/* Etiquetas de fecha */}
        {dias.map((d, i) =>
          i % pasoX === 0 ? (
            <text key={d.fecha} x={xDe(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={TINTA_MUTED}>
              {fechaCorta(d.fecha)}
            </text>
          ) : null,
        )}

        {/* Área (lavado 10%) + línea 2px */}
        <path d={area} fill={SERIE} opacity="0.1" />
        <path d={linea} fill="none" stroke={SERIE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Marcador del último punto: r4 + anillo de superficie 2px */}
        <circle cx={ultimo.x} cy={ultimo.y} r="6" fill="white" />
        <circle cx={ultimo.x} cy={ultimo.y} r="4" fill={SERIE} />

        {/* Crosshair de hover */}
        {hover !== null && (
          <g>
            <line x1={xDe(hover)} x2={xDe(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke={EJE} strokeWidth="1" />
            <circle cx={xDe(hover)} cy={puntos[hover].y} r="6" fill="white" />
            <circle cx={xDe(hover)} cy={puntos[hover].y} r="4" fill={SERIE} />
          </g>
        )}

        {/* Capa de captura del hover */}
        <rect
          x={PAD.left} y={PAD.top}
          width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom}
          fill="transparent"
          onMouseMove={desdeEvento}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border bg-card px-3 py-2 text-xs shadow-md"
          style={{ left: `${(xDe(hover) / W) * 100}%`, top: 0 }}
        >
          <p className="font-medium">{fechaCorta(dias[hover].fecha)}</p>
          <p className="text-muted-foreground">
            {formatEUR(dias[hover].ingresos)} · {dias[hover].pedidos}{" "}
            {dias[hover].pedidos === 1 ? "pedido" : "pedidos"}
          </p>
        </div>
      )}

      {sinVentas && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sin ventas en los últimos 30 días
        </p>
      )}
    </div>
  );
}

// ============================================================
// Barras horizontales — top productos (una serie = un solo color)
// ============================================================

export function GraficoTopProductos({ productos }: { productos: DashboardTopProducto[] }) {
  const max = Math.max(...productos.map((p) => p.unidades), 1);

  if (productos.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en los últimos 30 días</p>;
  }

  return (
    <div className="space-y-3">
      {productos.map((p) => (
        <div key={p.nombre} className="flex items-center gap-3" title={`${p.nombre}: ${p.unidades} uds · ${formatEUR(p.ingresos)}`}>
          <p className="w-44 truncate text-sm" >{p.nombre}</p>
          <div className="flex-1">
            <div
              className="h-5 rounded-r"
              style={{ width: `${(p.unidades / max) * 100}%`, backgroundColor: SERIE, minWidth: 2 }}
            />
          </div>
          <p className="w-24 text-right text-sm text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            {p.unidades} uds
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Vista de tabla (gemela accesible de cada gráfico)
// ============================================================

export function TablaVentasPorDia({ dias }: { dias: DashboardVentaDia[] }) {
  const conVentas = dias.filter((d) => d.pedidos > 0);
  if (conVentas.length === 0) return <p className="text-xs text-muted-foreground">Sin datos.</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 font-medium">Fecha</th>
          <th className="py-1 text-right font-medium">Pedidos</th>
          <th className="py-1 text-right font-medium">Ingresos</th>
        </tr>
      </thead>
      <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
        {conVentas.map((d) => (
          <tr key={d.fecha} className="border-t">
            <td className="py-1">{d.fecha}</td>
            <td className="py-1 text-right">{d.pedidos}</td>
            <td className="py-1 text-right">{formatEUR(d.ingresos)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
