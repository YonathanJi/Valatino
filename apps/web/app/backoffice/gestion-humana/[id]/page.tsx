"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { PageHeader } from "@components/backoffice/PageHeader";
import {
  TIPOS_CONTRATACION,
  type Cargo,
  type Empleado,
  type EmpleadoHistorialMensual,
  type TipoContratacion,
} from "@valatino/types";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtSalario(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

export default function EmpleadoDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [historial, setHistorial] = useState<EmpleadoHistorialMensual[]>([]);
  const [codigo, setCodigo] = useState("");
  const [tieneCuenta, setTieneCuenta] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const router = useRouter();

  const [form, setForm] = useState({
    nombreCompleto: "",
    documento: "",
    telefono: "",
    correoPersonal: "",
    correoEmpresa: "",
    cargoId: "",
    tipoContratacion: "Indefinido" as TipoContratacion,
    fechaVinculacion: "",
    fechaDesvinculacion: "",
    salario: "",
    activo: true,
    notas: "",
  });

  const set = (campo: keyof typeof form, valor: string | boolean) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const hidratar = (e: Empleado) =>
    setForm({
      nombreCompleto: e.nombre_completo,
      documento: e.documento,
      telefono: e.telefono ?? "",
      correoPersonal: e.correo_personal ?? "",
      correoEmpresa: e.correo_empresa,
      cargoId: e.cargo_id,
      tipoContratacion: e.tipo_contratacion,
      fechaVinculacion: e.fecha_vinculacion ?? "",
      fechaDesvinculacion: e.fecha_desvinculacion ?? "",
      salario: e.salario != null ? String(e.salario) : "",
      activo: e.activo,
      notas: e.notas ?? "",
    });

  const cargar = async () => {
    try {
      const [detalle, c, permisos] = await Promise.all([
        apiFetch<{ empleado: Empleado; historial: EmpleadoHistorialMensual[] }>(
          `/admin/gestion-humana/empleados/${id}`,
        ),
        apiFetch<Cargo[]>("/admin/gestion-humana/cargos"),
        apiFetch<{ esAdmin: boolean }>("/admin/gestion-humana/permisos"),
      ]);
      hidratar(detalle.empleado);
      setCodigo(detalle.empleado.codigo_empleado);
      setTieneCuenta(detalle.empleado.user_id != null);
      setEsAdmin(permisos.esAdmin);
      setHistorial(detalle.historial);
      setCargos(c);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el empleado");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [id]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await apiFetch(`/admin/gestion-humana/empleados/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombreCompleto: form.nombreCompleto,
          documento: form.documento,
          telefono: form.telefono,
          correoPersonal: form.correoPersonal,
          correoEmpresa: form.correoEmpresa,
          cargoId: form.cargoId,
          tipoContratacion: form.tipoContratacion,
          fechaVinculacion: form.fechaVinculacion,
          fechaDesvinculacion: form.fechaDesvinculacion || undefined,
          salario: form.salario === "" ? null : Number(form.salario),
          activo: form.activo,
          notas: form.notas,
        }),
      });
      toast.success("Empleado actualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar la ficha de este empleado? Esta acción no se puede deshacer."))
      return;
    setEliminando(true);
    try {
      await apiFetch(`/admin/gestion-humana/empleados/${id}`, { method: "DELETE" });
      toast.success("Empleado eliminado");
      router.push("/backoffice/gestion-humana");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar");
      setEliminando(false);
    }
  };

  const inputCls = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  const labelCls = "block space-y-1 text-sm";

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <PageHeader
        icon={Briefcase}
        back={{ href: "/backoffice/gestion-humana", label: "Gestión Humana" }}
        title={form.nombreCompleto || "Empleado"}
        description={`${codigo ? codigo + " · " : ""}${form.documento} · ${form.correoEmpresa}`}
      />

      <div className="rounded-xl border bg-card p-4 text-sm">
        <span className="text-muted-foreground">Cuenta de acceso: </span>
        {tieneCuenta ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Activa
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Pendiente de TI
          </span>
        )}
      </div>

      <form onSubmit={guardar} className="space-y-5 rounded-xl border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            <span className="font-medium">Nombre completo *</span>
            <input
              value={form.nombreCompleto}
              onChange={(e) => set("nombreCompleto", e.target.value)}
              required
              minLength={2}
              maxLength={200}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Documento *</span>
            <input
              value={form.documento}
              onChange={(e) => set("documento", e.target.value)}
              required
              minLength={3}
              maxLength={40}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Teléfono</span>
            <input
              value={form.telefono}
              onChange={(e) => set("telefono", e.target.value)}
              maxLength={30}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Correo personal</span>
            <input
              type="email"
              value={form.correoPersonal}
              onChange={(e) => set("correoPersonal", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Correo de empresa *</span>
            <input
              type="email"
              value={form.correoEmpresa}
              onChange={(e) => set("correoEmpresa", e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Cargo *</span>
            <select
              value={form.cargoId}
              onChange={(e) => set("cargoId", e.target.value)}
              required
              className={inputCls}
            >
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className="font-medium">Tipo de contratación *</span>
            <select
              value={form.tipoContratacion}
              onChange={(e) => set("tipoContratacion", e.target.value)}
              required
              className={inputCls}
            >
              {TIPOS_CONTRATACION.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className="font-medium">Fecha de vinculación *</span>
            <input
              type="date"
              value={form.fechaVinculacion}
              onChange={(e) => set("fechaVinculacion", e.target.value)}
              required
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Fecha de desvinculación</span>
            <input
              type="date"
              value={form.fechaDesvinculacion}
              onChange={(e) => set("fechaDesvinculacion", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span className="font-medium">Salario (€)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.salario}
              onChange={(e) => set("salario", e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => set("activo", e.target.checked)}
            className="accent-primary"
          />
          Empleado activo
        </label>

        <label className={labelCls}>
          <span className="font-medium">Notas</span>
          <textarea
            value={form.notas}
            onChange={(e) => set("notas", e.target.value)}
            maxLength={2000}
            rows={3}
            className={inputCls}
          />
        </label>

        <div className="flex justify-end">
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>

      {/* Histórico mensual del empleado */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Histórico mensual ({historial.length})</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Snapshots generados desde Gestión Humana · «Generar histórico»
          </p>
        </div>
        {historial.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Sin snapshots todavía. Genera el histórico de un mes para empezar a registrar su
            evolución.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Periodo</th>
                  <th className="px-4 py-3 text-left font-medium">Cargo</th>
                  <th className="px-4 py-3 text-left font-medium">Contratación</th>
                  <th className="px-4 py-3 text-left font-medium">Salario</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      {MESES[h.mes - 1]} {h.anio}
                    </td>
                    <td className="px-4 py-3">
                      {h.cargo_codigo ? `${h.cargo_codigo} — ${h.cargo_nombre}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {h.tipo_contratacion ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{fmtSalario(h.salario)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          h.activo
                            ? "bg-green-100 text-green-700"
                            : "bg-neutral-200 text-neutral-600"
                        }`}
                      >
                        {h.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {esAdmin && (
        <div className="rounded-xl border border-red-200 bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-red-700">Eliminar empleado</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tieneCuenta
                  ? "Este empleado tiene cuenta de acceso: TI debe eliminarla primero (TI → Usuarios)."
                  : "Borra la ficha y su histórico. Acción irreversible."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void eliminar()}
              disabled={tieneCuenta || eliminando}
              className="shrink-0 border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {eliminando ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
