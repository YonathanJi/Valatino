"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import type { Proveedor } from "@valatino/types";

interface FormProveedor {
  cif: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
}

const FORM_VACIO: FormProveedor = {
  cif: "",
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  notas: "",
};

function aPayload(form: FormProveedor) {
  return {
    cif: form.cif.trim(),
    nombre: form.nombre.trim(),
    telefono: form.telefono.trim() || undefined,
    email: form.email.trim() || undefined,
    direccion: form.direccion.trim() || undefined,
    notas: form.notas.trim() || undefined,
  };
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState<FormProveedor>(FORM_VACIO);
  const [isSaving, setIsSaving] = useState(false);

  // Edición inline
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormProveedor>(FORM_VACIO);

  const load = async () => {
    try {
      setProveedores(await apiFetch<Proveedor[]>("/admin/proveedores"));
    } catch {
      // el layout ya protege la ruta
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiFetch("/admin/proveedores", {
        method: "POST",
        body: JSON.stringify(aPayload(form)),
      });
      toast.success(`Proveedor ${form.nombre} creado`);
      setForm(FORM_VACIO);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al crear el proveedor");
    }
    setIsSaving(false);
  };

  const guardar = async (id: string) => {
    setIsSaving(true);
    try {
      await apiFetch(`/admin/proveedores/${id}`, {
        method: "PATCH",
        body: JSON.stringify(aPayload(editForm)),
      });
      toast.success("Proveedor actualizado");
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar");
    }
    setIsSaving(false);
  };

  const eliminar = async (p: Proveedor) => {
    if (!window.confirm(`¿Eliminar el proveedor "${p.nombre}" (${p.cif})?`)) return;
    try {
      await apiFetch(`/admin/proveedores/${p.id}`, { method: "DELETE" });
      toast.success("Proveedor eliminado");
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar");
    }
  };

  const inputCls = "rounded-lg border px-3 py-2 text-sm bg-background";

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link
          href="/backoffice/compras"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Compras
        </Link>
        <h1 className="text-2xl font-bold mt-1">Proveedores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Datos básicos de tus proveedores — en la compra basta con el CIF para autocompletar
        </p>
      </div>

      {/* Nuevo proveedor */}
      <form onSubmit={crear} className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Nuevo proveedor</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="CIF / NIF *"
            value={form.cif}
            onChange={(e) => setForm({ ...form, cif: e.target.value })}
            required
            maxLength={20}
            className={`${inputCls} font-mono uppercase`}
          />
          <input
            type="text"
            placeholder="Nombre / Razón social *"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            maxLength={200}
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            type="tel"
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            maxLength={30}
            className={inputCls}
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={200}
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Dirección"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            maxLength={300}
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Notas"
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            maxLength={2000}
            className={`${inputCls} flex-1`}
          />
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Guardando…" : "Crear proveedor"}
          </Button>
        </div>
      </form>

      {/* Listado */}
      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : proveedores.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Aún no hay proveedores. Crea el primero con el formulario de arriba.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">CIF</th>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Contacto</th>
                  <th className="text-left px-4 py-3 font-medium">Dirección</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) =>
                  editing === p.id ? (
                    <tr key={p.id} className="border-b last:border-0 bg-muted/20 align-top">
                      <td className="px-4 py-3" colSpan={4}>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            value={editForm.cif}
                            onChange={(e) => setEditForm({ ...editForm, cif: e.target.value })}
                            placeholder="CIF *"
                            className={`${inputCls} font-mono uppercase`}
                          />
                          <input
                            value={editForm.nombre}
                            onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                            placeholder="Nombre *"
                            className={`${inputCls} sm:col-span-2`}
                          />
                          <input
                            value={editForm.telefono}
                            onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                            placeholder="Teléfono"
                            className={inputCls}
                          />
                          <input
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            placeholder="Email"
                            className={inputCls}
                          />
                          <input
                            value={editForm.direccion}
                            onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                            placeholder="Dirección"
                            className={inputCls}
                          />
                          <input
                            value={editForm.notas}
                            onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })}
                            placeholder="Notas"
                            className={`${inputCls} sm:col-span-3`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => void guardar(p.id)}
                            disabled={isSaving}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-xs text-muted-foreground"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono">{p.cif}</td>
                      <td className="px-4 py-3 font-medium">{p.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[p.telefono, p.email].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.direccion ?? "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(p.id);
                              setEditForm({
                                cif: p.cif,
                                nombre: p.nombre,
                                telefono: p.telefono ?? "",
                                email: p.email ?? "",
                                direccion: p.direccion ?? "",
                                notas: p.notas ?? "",
                              });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminar(p)}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
