"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { PageHeader } from "@components/backoffice/PageHeader";
import {
  TIPOS_CONTRATACION,
  type Cargo,
  type CuentaVinculable,
  type TipoContratacion,
} from "@valatino/types";

export default function NuevoEmpleadoPage() {
  const router = useRouter();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [cuentas, setCuentas] = useState<CuentaVinculable[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    userId: "",
    nombreCompleto: "",
    documento: "",
    telefono: "",
    correoPersonal: "",
    correoEmpresa: "",
    cargoId: "",
    tipoContratacion: "Indefinido" as TipoContratacion,
    fechaVinculacion: "",
    salario: "",
    notas: "",
  });

  const set = (campo: keyof typeof form, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  useEffect(() => {
    void (async () => {
      try {
        const [c, cu] = await Promise.all([
          apiFetch<Cargo[]>("/admin/gestion-humana/cargos"),
          apiFetch<CuentaVinculable[]>("/admin/gestion-humana/cuentas-vinculables"),
        ]);
        setCargos(c);
        setCuentas(cu);
      } catch {
        /* el layout protege la ruta */
      }
    })();
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await apiFetch("/admin/gestion-humana/empleados", {
        method: "POST",
        body: JSON.stringify({
          userId: form.userId,
          nombreCompleto: form.nombreCompleto,
          documento: form.documento,
          telefono: form.telefono || undefined,
          correoPersonal: form.correoPersonal || undefined,
          correoEmpresa: form.correoEmpresa,
          cargoId: form.cargoId,
          tipoContratacion: form.tipoContratacion,
          fechaVinculacion: form.fechaVinculacion,
          salario: form.salario ? Number(form.salario) : undefined,
          notas: form.notas || undefined,
        }),
      });
      toast.success("Empleado creado");
      router.push("/backoffice/gestion-humana");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el empleado");
    } finally {
      setEnviando(false);
    }
  };

  const inputCls = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  const labelCls = "block space-y-1 text-sm";

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <PageHeader
        icon={Briefcase}
        back={{ href: "/backoffice/gestion-humana", label: "Gestión Humana" }}
        title="Nuevo empleado"
        description="Vincula una cuenta de acceso y completa los datos de contratación"
      />

      {cuentas.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No hay cuentas de acceso libres para vincular. Crea primero la cuenta en{" "}
          <Link href="/backoffice/usuarios" className="font-medium text-primary hover:underline">
            Usuarios
          </Link>{" "}
          (cada empleado se vincula a una cuenta admin/asesor).
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-5 rounded-xl border bg-card p-6">
          <label className={labelCls}>
            <span className="font-medium">Cuenta de acceso *</span>
            <select
              value={form.userId}
              onChange={(e) => set("userId", e.target.value)}
              required
              className={inputCls}
            >
              <option value="">Selecciona una cuenta…</option>
              {cuentas.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.nombre ? `${c.nombre} — ${c.email}` : c.email}
                </option>
              ))}
            </select>
          </label>

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
                placeholder="DNI / NIE / pasaporte"
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
                placeholder="nombre@valatino.com"
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
                <option value="">Selecciona un cargo…</option>
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
              <span className="font-medium">Salario (€, opcional)</span>
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/backoffice/gestion-humana">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Crear empleado"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
