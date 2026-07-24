"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Briefcase, Pencil, CalendarClock } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { PageHeader } from "@components/backoffice/PageHeader";
import type { Empleado } from "@valatino/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function GestionHumanaPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [generando, setGenerando] = useState(false);

  const cargar = async () => {
    try {
      setEmpleados(await apiFetch<Empleado[]>("/admin/gestion-humana/empleados"));
    } catch {
      // el layout ya protege la ruta
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const generarHistorico = async () => {
    setGenerando(true);
    try {
      const r = await apiFetch<{ generados: number }>("/admin/gestion-humana/historial/generar", {
        method: "POST",
        body: JSON.stringify({ anio, mes }),
      });
      toast.success(`Histórico de ${MESES[mes - 1]} ${anio} generado (${r.generados} empleados)`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo generar el histórico");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Briefcase}
        title="Gestión Humana"
        description="Empleados de la empresa, contratación e histórico mensual"
      >
        <Button asChild>
          <Link href="/backoffice/gestion-humana/nuevo">＋ Nuevo empleado</Link>
        </Button>
      </PageHeader>

      {/* Generar histórico mensual */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold leading-none">Histórico mensual</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Toma una foto del estado de la plantilla para el mes elegido
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Mes
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {MESES.map((nombre, i) => (
                  <option key={i} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Año
              <input
                type="number"
                min={2000}
                max={2100}
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="mt-1 block w-24 rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </label>
            <Button variant="outline" onClick={() => void generarHistorico()} disabled={generando}>
              {generando ? "Generando…" : "Generar histórico"}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabla de empleados */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Plantilla ({empleados.length})</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : empleados.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Todavía no hay empleados. Crea el primero con «Nuevo empleado».
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Empleado</th>
                  <th className="px-4 py-3 text-left font-medium">Cargo</th>
                  <th className="px-4 py-3 text-left font-medium">Contratación</th>
                  <th className="px-4 py-3 text-left font-medium">Vinculación</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {empleados.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-primary">
                          {e.codigo_empleado}
                        </span>
                        <p className="font-medium">{e.nombre_completo}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.documento} · {e.correo_empresa}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {e.cargo_codigo ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {e.cargo_codigo}
                          </span>
                          <span className="text-xs">{e.cargo_nombre}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.tipo_contratacion}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {fmtFecha(e.fecha_vinculacion)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          e.activo
                            ? "bg-green-100 text-green-700"
                            : "bg-neutral-200 text-neutral-600"
                        }`}
                      >
                        {e.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/backoffice/gestion-humana/${e.id}`}
                        title="Ver / editar"
                        aria-label={`Ver ${e.nombre_completo}`}
                        className="inline-flex rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
