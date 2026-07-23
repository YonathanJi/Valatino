"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { STAFF_MODULOS, type StaffModulo, type UserRole } from "@valatino/types";

const MODULO_LABELS: Record<StaffModulo, string> = {
  pedidos: "📦 Pedidos",
  catalogo: "🛍️ Catálogo",
  inventario: "📊 Inventario",
  dashboard: "📈 Dashboard",
  compras: "🛒 Compras",
};

interface StaffMiembro {
  user_id: string;
  email: string | null;
  nombre: string | null;
  rol: UserRole;
  modulos: StaffModulo[];
  created_at: string;
}

interface EditarUsuarioModalProps {
  miembro: StaffMiembro;
  /** True si el usuario editado es el propio admin logueado (no puede cambiar su rol). */
  esUnoMismo: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditarUsuarioModal({
  miembro,
  esUnoMismo,
  onClose,
  onUpdated,
}: EditarUsuarioModalProps) {
  // Datos
  const [nombre, setNombre] = useState(miembro.nombre ?? "");
  const [email, setEmail] = useState(miembro.email ?? "");
  const [savingDatos, setSavingDatos] = useState(false);

  // Contraseña
  const [password, setPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Rol + módulos
  const [rol, setRol] = useState<"admin" | "asesor">(
    miembro.rol === "admin" ? "admin" : "asesor",
  );
  const [modulos, setModulos] = useState<StaffModulo[]>(miembro.modulos);
  const [savingRol, setSavingRol] = useState(false);

  const toggleModulo = (m: StaffModulo) =>
    setModulos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const guardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDatos(true);
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre, email }),
      });
      toast.success("Datos actualizados");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar los datos");
    } finally {
      setSavingDatos(false);
    }
  };

  const restablecerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      toast.success("Contraseña restablecida. Compártesela al usuario.");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al restablecer la contraseña");
    } finally {
      setSavingPassword(false);
    }
  };

  const guardarRol = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRol(true);
    try {
      await apiFetch(`/admin/usuarios/${miembro.user_id}/rol`, {
        method: "PATCH",
        body: JSON.stringify({ rol, ...(rol === "asesor" ? { modulos } : {}) }),
      });
      toast.success("Rol actualizado");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al actualizar el rol");
    } finally {
      setSavingRol(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editar-usuario-titulo"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-lg space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="editar-usuario-titulo" className="text-lg font-semibold">
              Editar usuario
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {miembro.email ?? miembro.user_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Datos */}
        <form onSubmit={guardarDatos} className="space-y-3">
          <h3 className="text-sm font-medium">Datos</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="edit-nombre">Nombre</Label>
              <Input
                id="edit-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-email">Correo</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={savingDatos}>
            {savingDatos ? "Guardando..." : "Guardar datos"}
          </Button>
        </form>

        <hr className="border-border" />

        {/* Contraseña */}
        <form onSubmit={restablecerPassword} className="space-y-3">
          <h3 className="text-sm font-medium">Restablecer contraseña</h3>
          <div className="space-y-1">
            <Label htmlFor="edit-password">Nueva contraseña</Label>
            <Input
              id="edit-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Mín. 8 caracteres"
              className="font-mono"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Se aplica al instante. Compártesela al usuario para que entre en <code>/admin</code>.
          </p>
          <Button type="submit" size="sm" variant="outline" disabled={savingPassword}>
            {savingPassword ? "Restableciendo..." : "Restablecer contraseña"}
          </Button>
        </form>

        <hr className="border-border" />

        {/* Rol + módulos */}
        <form onSubmit={guardarRol} className="space-y-3">
          <h3 className="text-sm font-medium">Rol y módulos</h3>
          {esUnoMismo ? (
            <p className="text-xs text-muted-foreground">
              No puedes cambiar tu propio rol (evita bloqueos accidentales de acceso).
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-rol">Rol</Label>
                <select
                  id="edit-rol"
                  value={rol}
                  onChange={(e) => setRol(e.target.value as "admin" | "asesor")}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
                >
                  <option value="admin">Súper admin (ve todo)</option>
                  <option value="asesor">Asesor</option>
                </select>
              </div>

              {rol === "asesor" && (
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Módulos autorizados:</span>
                  <div className="flex flex-wrap gap-3">
                    {STAFF_MODULOS.map((m) => (
                      <label
                        key={m}
                        className="flex items-center gap-1.5 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={modulos.includes(m)}
                          onChange={() => toggleModulo(m)}
                          className="accent-primary"
                        />
                        {MODULO_LABELS[m]}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <Button type="submit" size="sm" disabled={savingRol}>
                {savingRol ? "Guardando..." : "Guardar rol"}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
