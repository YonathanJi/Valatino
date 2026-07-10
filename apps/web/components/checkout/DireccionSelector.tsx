"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Direccion {
  id: string;
  nombre_destinatario: string;
  linea1: string;
  linea2?: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  es_predeterminada: boolean;
}

interface DireccionSelectorProps {
  onSelect: (id: string) => void;
  selectedId?: string;
  /** Notifica cuántas direcciones guardadas tiene el usuario (o null si no hay sesión) */
  onLoaded?: (count: number | null) => void;
}

export function DireccionSelector({ onSelect, selectedId, onLoaded }: DireccionSelectorProps) {
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        onLoaded?.(null);
        return;
      }

      const res = await fetch(`${API_URL}/direcciones`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      });

      if (res.ok) {
        const data = (await res.json()) as Direccion[];
        setDirecciones(data);
        onLoaded?.(data.length);
        if (data.length > 0 && !selectedId) {
          const predeterminada = data.find((d) => d.es_predeterminada) ?? data[0];
          if (predeterminada) onSelect(predeterminada.id);
        }
      } else {
        onLoaded?.(0);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

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
        </button>
      ))}
    </div>
  );
}
