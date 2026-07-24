"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { STAFF_MODULOS, type StaffModulo } from "@valatino/types";
import { MODULO_ICONOS, MODULO_LABELS } from "@lib/backoffice/iconos";

export interface EmpleadoPendiente {
  id: string;
  codigo_empleado: string;
  nombre_completo: string;
  correo_empresa: string;
  cargo_codigo: string | null;
  cargo_nombre: string | null;
}

interface ProvisionarCuentaModalProps {
  empleado: EmpleadoPendiente;
  onClose: () => void;
  onProvisioned: () => void;
}

export function ProvisionarCuentaModal({
  empleado,
  onClose,
  onProvisioned,
}: ProvisionarCuentaModalProps) {
  const [email, setEmail] = useState(empleado.correo_empresa);
  const [password, setPassword] = useState("");
  const [modulos, setModulos] = useState<StaffModulo[]>(["pedidos"]);
  const [saving, setSaving] = useState(false);

  const toggle = (m: StaffModulo) =>
    setModulos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/admin/usuarios/provisionar", {
        method: "POST",
        body: JSON.stringify({ empleadoId: empleado.id, email, password, modulos }),
      });
      toast.success(`Cuenta creada para ${empleado.nombre_completo}. Comparte las credenciales.`);
      onProvisioned();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo provisionar la cuenta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Provisionar cuenta</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {empleado.codigo_empleado} · {empleado.nombre_completo}
              {empleado.cargo_codigo ? ` · ${empleado.cargo_codigo}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="prov-email">Correo de acceso</Label>
            <Input
              id="prov-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-pass">Contraseña</Label>
            <Input
              id="prov-pass"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              placeholder="Mín. 8 caracteres"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Módulos / aplicaciones</span>
            <div className="flex flex-wrap gap-3">
              {STAFF_MODULOS.map((m) => {
                const Icon = MODULO_ICONOS[m];
                return (
                  <label key={m} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={modulos.includes(m)}
                      onChange={() => toggle(m)}
                      className="accent-primary"
                    />
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {MODULO_LABELS[m]}
                  </label>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se crea la cuenta como <strong>asesor</strong> con los módulos marcados y se vincula al
            empleado. El rol de admin lo cambia un administrador.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear cuenta"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
