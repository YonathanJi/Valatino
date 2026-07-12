"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@lib/api/client";
import { toast } from "sonner";
import { Button } from "@components/ui/button";
import { STAFF_MODULOS, type StaffModulo, type UserRole } from "@valatino/types";

const MODULO_LABELS: Record<StaffModulo, string> = {
  pedidos: "📦 Pedidos",
  catalogo: "🛍️ Catálogo",
  inventario: "📊 Inventario",
};

interface StaffMiembro {
  user_id: string;
  email: string | null;
  nombre: string | null;
  rol: UserRole;
  modulos: StaffModulo[];
  created_at: string;
}

export default function BackofficeUsuariosPage() {
  const [staff, setStaff] = useState<StaffMiembro[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Formulario de nuevo asesor
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modulos, setModulos] = useState<StaffModulo[]>(["pedidos"]);
  const [isCreating, setIsCreating] = useState(false);

  // Edición de módulos por fila
  const [editing, setEditing] = useState<string | null>(null);
  const [editModulos, setEditModulos] = useState<StaffModulo[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const loadStaff = async () => {
    try {
      setStaff(await apiFetch<StaffMiembro[]>("/admin/usuarios"));
    } catch {
      // el layout ya protege la ruta
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  const toggleModulo = (lista: StaffModulo[], m: StaffModulo): StaffModulo[] =>
    lista.includes(m) ? lista.filter((x) => x !== m) : [...lista, m];

  const crearAsesor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await apiFetch("/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({ nombre, email, password, modulos }),
      });
      toast.success(`Asesor ${nombre} creado. Comparte sus credenciales de acceso a /admin.`);
      setNombre("");
      setEmail("");
      setPassword("");
      setModulos(["pedidos"]);
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al crear el asesor");
    } finally {
      setIsCreating(false);
    }
  };

  const guardarModulos = async (userId: string) => {
    setIsSaving(true);
    try {
      await apiFetch(`/admin/usuarios/${userId}/modulos`, {
        method: "PATCH",
        body: JSON.stringify({ modulos: editModulos }),
      });
      toast.success("Módulos actualizados");
      setEditing(null);
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const eliminarAsesor = async (miembro: StaffMiembro) => {
    if (!window.confirm(`¿Eliminar la cuenta de asesor de ${miembro.email}?`)) return;
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}`, { method: "DELETE" });
      toast.success("Asesor eliminado");
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea asesores y decide qué módulos puede ver cada uno
        </p>
      </div>

      {/* Crear asesor */}
      <form onSubmit={crearAsesor} className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Nuevo asesor</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            minLength={2}
            className="rounded-lg border px-3 py-2 text-sm bg-background"
          />
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border px-3 py-2 text-sm bg-background"
          />
          <input
            type="text"
            placeholder="Contraseña (mín. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-lg border px-3 py-2 text-sm bg-background font-mono"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-muted-foreground">Módulos:</span>
          {STAFF_MODULOS.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={modulos.includes(m)}
                onChange={() => setModulos((prev) => toggleModulo(prev, m))}
                className="accent-primary"
              />
              {MODULO_LABELS[m]}
            </label>
          ))}
          <Button type="submit" disabled={isCreating} className="ml-auto">
            {isCreating ? "Creando..." : "Crear asesor"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          El asesor iniciará sesión con email y contraseña en <code>/admin</code>.
        </p>
      </form>

      {/* Tabla del equipo */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Equipo del Back-Office</h2>
        </div>
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No hay usuarios con roles internos todavía
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium">Rol</th>
                  <th className="text-left px-4 py-3 font-medium">Módulos</th>
                  <th className="text-left px-4 py-3 font-medium">Alta</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.user_id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.nombre ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email ?? u.user_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.rol === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {u.rol === "admin" ? "súper admin" : u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.rol === "admin" ? (
                        <span className="text-xs text-muted-foreground">Todos</span>
                      ) : editing === u.user_id ? (
                        <div className="flex flex-wrap items-center gap-3">
                          {STAFF_MODULOS.map((m) => (
                            <label
                              key={m}
                              className="flex items-center gap-1.5 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={editModulos.includes(m)}
                                onChange={() => setEditModulos((prev) => toggleModulo(prev, m))}
                                className="accent-primary"
                              />
                              {MODULO_LABELS[m]}
                            </label>
                          ))}
                          <button
                            type="button"
                            onClick={() => void guardarModulos(u.user_id)}
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
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.modulos.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Sin módulos</span>
                          ) : (
                            u.modulos.map((m) => (
                              <span
                                key={m}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
                              >
                                {MODULO_LABELS[m]}
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {u.rol === "asesor" && editing !== u.user_id && (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(u.user_id);
                              setEditModulos(u.modulos);
                            }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Editar módulos
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminarAsesor(u)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
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
