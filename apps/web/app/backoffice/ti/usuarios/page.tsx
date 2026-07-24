"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@lib/api/client";
import { toast } from "sonner";
import { Button } from "@components/ui/button";
import { EditarUsuarioModal } from "@components/backoffice/EditarUsuarioModal";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { STAFF_MODULOS, type StaffModulo, type UserRole } from "@valatino/types";
import { Pencil, Trash2, Users, UserPlus } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { MODULO_LABELS, MODULO_ICONOS } from "@lib/backoffice/iconos";
import {
  ProvisionarCuentaModal,
  type EmpleadoPendiente,
} from "@components/backoffice/ProvisionarCuentaModal";

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

  // Edición completa por fila (modal)
  const [editingUser, setEditingUser] = useState<StaffMiembro | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Empleados de RRHH pendientes de cuenta + provisión
  const [pendientes, setPendientes] = useState<EmpleadoPendiente[]>([]);
  const [provisionando, setProvisionando] = useState<EmpleadoPendiente | null>(null);

  const loadStaff = async () => {
    try {
      setStaff(await apiFetch<StaffMiembro[]>("/admin/usuarios"));
    } catch {
      // el layout ya protege la ruta
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendientes = async () => {
    try {
      setPendientes(await apiFetch<EmpleadoPendiente[]>("/admin/usuarios/empleados-pendientes"));
    } catch {
      /* el layout protege la ruta */
    }
  };

  useEffect(() => {
    void loadStaff();
    void loadPendientes();
    void (async () => {
      const {
        data: { user },
      } = await createSupabaseBrowserClient().auth.getUser();
      setMyUserId(user?.id ?? null);
    })();
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
      <PageHeader
        icon={Users}
        title="Usuarios"
        description="Cuentas de acceso, contraseñas y módulos del personal (módulo TI)"
      />

      {/* Empleados de RRHH pendientes de cuenta */}
      {pendientes.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Empleados pendientes de cuenta ({pendientes.length})</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Personal creado por Gestión Humana que aún no tiene acceso al sistema
            </p>
          </div>
          <ul className="divide-y">
            {pendientes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                      {p.codigo_empleado}
                    </span>
                    {p.nombre_completo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.correo_empresa}
                    {p.cargo_codigo ? ` · ${p.cargo_codigo} — ${p.cargo_nombre}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setProvisionando(p)}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Crear cuenta
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {STAFF_MODULOS.map((m) => {
            const Icon = MODULO_ICONOS[m];
            return (
              <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={modulos.includes(m)}
                  onChange={() => setModulos((prev) => toggleModulo(prev, m))}
                  className="accent-primary"
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                {MODULO_LABELS[m]}
              </label>
            );
          })}
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
                      ) : u.modulos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sin módulos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.modulos.map((m) => {
                            const Icon = MODULO_ICONOS[m];
                            return (
                              <span
                                key={m}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                              >
                                <Icon className="h-3 w-3" />
                                {MODULO_LABELS[m]}
                              </span>
                            );
                          })}
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
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          title="Editar"
                          aria-label={`Editar ${u.nombre ?? u.email ?? "usuario"}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.rol === "asesor" && u.user_id !== myUserId && (
                          <button
                            type="button"
                            onClick={() => void eliminarAsesor(u)}
                            title="Eliminar"
                            aria-label={`Eliminar ${u.nombre ?? u.email ?? "asesor"}`}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <EditarUsuarioModal
          miembro={editingUser}
          esUnoMismo={editingUser.user_id === myUserId}
          onClose={() => setEditingUser(null)}
          onUpdated={() => void loadStaff()}
        />
      )}

      {provisionando && (
        <ProvisionarCuentaModal
          empleado={provisionando}
          onClose={() => setProvisionando(null)}
          onProvisioned={() => {
            setProvisionando(null);
            void loadStaff();
            void loadPendientes();
          }}
        />
      )}
    </div>
  );
}
