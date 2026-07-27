"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { formatearTelefono, normalizarTelefono, telefonoValido } from "@valatino/types";

interface Direccion {
  id: string;
  nombre_destinatario: string;
  linea1: string;
  linea2?: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  telefono: string | null;
  es_predeterminada: boolean;
}

interface DireccionSelectorProps {
  onSelect: (id: string) => void;
  selectedId?: string;
  /** Notifica cuántas direcciones guardadas tiene el usuario (o null si no hay sesión) */
  onLoaded?: (count: number | null) => void;
  /**
   * Avisa de si a la dirección elegida le falta el teléfono. El checkout usa
   * esto para no dejar pagar: las direcciones guardadas antes de la 040 no lo
   * tienen, y sin él el pedido llega al almacén sin forma de avisar al cliente.
   */
  onTelefonoPendiente?: (pendiente: boolean) => void;
}

export function DireccionSelector({
  onSelect,
  selectedId,
  onLoaded,
  onTelefonoPendiente,
}: DireccionSelectorProps) {
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  const supabase = createSupabaseBrowserClient();

  const cargar = async (): Promise<Direccion[]> => {
    try {
      const data = await apiFetch<Direccion[]>("/direcciones");
      setDirecciones(data);
      onLoaded?.(data.length);
      return data;
    } catch {
      onLoaded?.(0);
      return [];
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        onLoaded?.(null);
        return;
      }

      const data = await cargar();
      if (data.length > 0 && !selectedId) {
        const predeterminada = data.find((d) => d.es_predeterminada) ?? data[0];
        if (predeterminada) onSelect(predeterminada.id);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const elegida = direcciones.find((d) => d.id === selectedId) ?? null;
  const faltaTelefono = Boolean(elegida) && !elegida?.telefono;

  // Se notifica al padre desde un efecto y no durante el render: llamar a un
  // setState del padre mientras se renderiza el hijo es un aviso de React.
  useEffect(() => {
    onTelefonoPendiente?.(faltaTelefono);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltaTelefono]);

  /**
   * Guarda el teléfono EN LA DIRECCIÓN, no solo para este pedido: es un dato de
   * la dirección, la RPC del pago lo lee de ahí, y así el cliente no vuelve a
   * tropezar con esto en la siguiente compra.
   */
  const guardarTelefono = async () => {
    if (!elegida || !telefonoValido(telefono)) return;
    setGuardando(true);
    try {
      await apiFetch(`/direcciones/${elegida.id}`, {
        method: "PATCH",
        body: JSON.stringify({ telefono: normalizarTelefono(telefono) }),
      });
      setTelefono("");
      await cargar();
      toast.success("Teléfono guardado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar el teléfono");
    } finally {
      setGuardando(false);
    }
  };

  if (direcciones.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Dirección de envío</p>
      {direcciones.map((dir) => (
        <button
          key={dir.id}
          type="button"
          onClick={() => onSelect(dir.id)}
          className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
            selectedId === dir.id
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50"
          }`}
        >
          <p className="font-medium">{dir.nombre_destinatario}</p>
          <p className="text-muted-foreground">
            {dir.linea1}
            {dir.linea2 ? `, ${dir.linea2}` : ""} · {dir.codigo_postal} {dir.ciudad}
          </p>
          {dir.telefono ? (
            <p className="text-muted-foreground">Tel. {formatearTelefono(dir.telefono)}</p>
          ) : (
            <p className="text-amber-700">Sin teléfono de contacto</p>
          )}
        </button>
      ))}

      {faltaTelefono && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="space-y-1">
            <Label htmlFor="tel-direccion" className="text-sm font-medium">
              Añade un teléfono de contacto
            </Label>
            <p className="text-xs text-muted-foreground">
              Esta dirección se guardó sin teléfono. Hace falta para avisarte de la entrega.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id="tel-direccion"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="600 11 22 33"
              maxLength={20}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <Button
              type="button"
              onClick={() => void guardarTelefono()}
              disabled={guardando || !telefonoValido(telefono)}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </div>
          {telefono !== "" && !telefonoValido(telefono) && (
            <p className="text-xs text-destructive">
              Introduce un teléfono español de 9 dígitos (móvil o fijo).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
