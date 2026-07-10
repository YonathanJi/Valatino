"use client";

import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

export interface DireccionInline {
  nombre_destinatario: string;
  linea1: string;
  linea2: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais: string;
}

export const DIRECCION_VACIA: DireccionInline = {
  nombre_destinatario: "",
  linea1: "",
  linea2: "",
  ciudad: "",
  codigo_postal: "",
  provincia: "",
  pais: "ES",
};

export function direccionCompleta(d: DireccionInline): boolean {
  return Boolean(
    d.nombre_destinatario.trim() &&
      d.linea1.trim() &&
      d.ciudad.trim() &&
      /^\d{5}$/.test(d.codigo_postal.trim()) &&
      d.provincia.trim(),
  );
}

interface DireccionFormProps {
  value: DireccionInline;
  onChange: (value: DireccionInline) => void;
}

/**
 * Formulario de dirección de envío inline: usado por invitados y por
 * usuarios autenticados sin direcciones guardadas.
 */
export function DireccionForm({ value, onChange }: DireccionFormProps) {
  const set = (field: keyof DireccionInline) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Dirección de envío</h2>

      <div className="space-y-1">
        <Label htmlFor="dir-nombre">Nombre del destinatario</Label>
        <Input
          id="dir-nombre"
          autoComplete="name"
          placeholder="Nombre y apellidos"
          value={value.nombre_destinatario}
          onChange={set("nombre_destinatario")}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="dir-linea1">Dirección</Label>
        <Input
          id="dir-linea1"
          autoComplete="address-line1"
          placeholder="Calle, número"
          value={value.linea1}
          onChange={set("linea1")}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="dir-linea2">Piso, puerta, escalera (opcional)</Label>
        <Input
          id="dir-linea2"
          autoComplete="address-line2"
          placeholder="2ºB"
          value={value.linea2}
          onChange={set("linea2")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="dir-cp">Código postal</Label>
          <Input
            id="dir-cp"
            autoComplete="postal-code"
            inputMode="numeric"
            placeholder="28001"
            maxLength={5}
            value={value.codigo_postal}
            onChange={set("codigo_postal")}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dir-ciudad">Ciudad</Label>
          <Input
            id="dir-ciudad"
            autoComplete="address-level2"
            placeholder="Madrid"
            value={value.ciudad}
            onChange={set("ciudad")}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="dir-provincia">Provincia</Label>
        <Input
          id="dir-provincia"
          autoComplete="address-level1"
          placeholder="Madrid"
          value={value.provincia}
          onChange={set("provincia")}
          required
        />
      </div>
    </div>
  );
}
