"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@lib/api/client";
import { toast } from "sonner";
import { Button } from "@components/ui/button";
import { EditarUsuarioModal } from "@components/backoffice/EditarUsuarioModal";
import { ListaPermisos } from "@components/backoffice/ChipPermiso";
import type { PermisoModulo, UserRole } from "@valatino/types";
import { Pencil, Trash2, Users, UserPlus, Ban, ShieldCheck } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { usePermisos } from "@components/backoffice/PermisosProvider";
import {
  ProvisionarCuentaModal,
  type EmpleadoPendiente,
} from "@components/backoffice/ProvisionarCuentaModal";

interface StaffMiembro {
  user_id: string;
  email: string | null;
  nombre: string | null;
  rol: UserRole;
  cargo_nombre: string | null;
  permisos: PermisoModulo[];
  bloqueado: boolean;
  created_at: string;
}

export function UsuariosPanel() {
  // Quién está mirando sale del contexto (resuelto en el servidor). Antes el
  // panel se buscaba a sí mismo dentro de la lista de staff ya cargada, así que
  // los botones no aparecían hasta que llegaba la respuesta.
  const { userId: miUserId, esAdmin } = usePermisos();
  const [staff, setStaff] = useState<StaffMiembro[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<StaffMiembro | null>(null);
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
  }, []);

  const eliminarAsesor = async (miembro: StaffMiembro) => {
    if (!window.confirm(`¿Eliminar la cuenta de ${miembro.email}?`)) return;
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}`, { method: "DELETE" });
      toast.success("Cuenta eliminada");
      void loadStaff();
      void loadPendientes();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar");
    }
  };

  const toggleBloqueo = async (miembro: StaffMiembro) => {
    const bloquear = !miembro.bloqueado;
    if (!window.confirm(`¿${bloquear ? "Bloquear" : "Desbloquear"} la cuenta de ${miembro.email}?`))
      return;
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}/bloqueo`, {
        method: "PATCH",
        body: JSON.stringify({ bloquear }),
      });
      toast.success(bloquear ? "Cuenta bloqueada" : "Cuenta desbloqueada");
      void loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al actualizar el bloqueo");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Users}
        title="Usuarios"
        description="Cuentas de acceso, contraseñas y niveles de permiso del personal"
      />

      {/* Único camino de alta: RRHH crea la ficha, TI le da acceso. */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">
            Empleados pendientes de cuenta{pendientes.length > 0 ? ` (${pendientes.length})` : ""}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Personal dado de alta por Gestión Humana que todavía no tiene acceso al sistema
          </p>
        </div>
        {pendientes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No hay nadie pendiente. Las cuentas nuevas nacen de una ficha de Gestión Humana: si
            falta alguien, pídeles que le den de alta primero.
          </p>
        ) : (
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
                    {p.cargo_nombre ? ` · ${p.cargo_nombre}` : ""}
                    {p.plantilla.length > 0 ? ` · ${p.plantilla.length} accesos por plantilla` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setProvisionando(p)}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Dar acceso
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Equipo con acceso al panel</h2>
        </div>
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nadie tiene acceso al panel todavía
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium">Cargo</th>
                  <th className="text-left px-4 py-3 font-medium">Accesos</th>
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
                      {u.rol === "admin" ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          Súper admin
                        </span>
                      ) : u.cargo_nombre ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {u.cargo_nombre}
                        </span>
                      ) : (
                        // Cuenta anterior al flujo RRHH → TI. Se marca para que
                        // se vea de un vistazo quién está fuera del circuito.
                        <span
                          className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                          title="Cuenta sin ficha en Gestión Humana"
                        >
                          Sin ficha de RRHH
                        </span>
                      )}
                      {u.bloqueado && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Bloqueada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.rol === "admin" ? (
                        <span className="text-xs text-muted-foreground">Control total de todo</span>
                      ) : (
                        <ListaPermisos permisos={u.permisos} vacio="Sin accesos" />
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
                        {/* Sobre una cuenta admin solo actúa otro admin: la API
                            responde 403 igualmente (asegurarStaffEditable). */}
                        {(esAdmin || u.rol !== "admin") && (
                          <button
                            type="button"
                            onClick={() => setEditingUser(u)}
                            title="Editar"
                            aria-label={`Editar ${u.nombre ?? u.email ?? "usuario"}`}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {esAdmin && u.rol === "asesor" && u.user_id !== miUserId && (
                          <>
                            <button
                              type="button"
                              onClick={() => void toggleBloqueo(u)}
                              title={u.bloqueado ? "Desbloquear" : "Bloquear"}
                              aria-label={`${u.bloqueado ? "Desbloquear" : "Bloquear"} ${
                                u.nombre ?? u.email ?? "cuenta"
                              }`}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {u.bloqueado ? (
                                <ShieldCheck className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void eliminarAsesor(u)}
                              title="Eliminar"
                              aria-label={`Eliminar ${u.nombre ?? u.email ?? "cuenta"}`}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
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
          esUnoMismo={editingUser.user_id === miUserId}
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
