"use client";

import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { codigoPostalValido, provinciaPorCP, telefonoValido } from "@valatino/types";
import { useMunicipios } from "@lib/hooks/useMunicipios";

export interface DireccionInline {
  nombre_destinatario: string;
  linea1: string;
  linea2: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  pais: string;
  telefono: string;
}

export const DIRECCION_VACIA: DireccionInline = {
  nombre_destinatario: "",
  linea1: "",
  linea2: "",
  ciudad: "",
  codigo_postal: "",
  provincia: "",
  pais: "ES",
  telefono: "",
};

export function direccionCompleta(d: DireccionInline): boolean {
  return Boolean(
    d.nombre_destinatario.trim() &&
      d.linea1.trim() &&
      codigoPostalValido(d.codigo_postal) &&
      d.ciudad.trim() &&
      telefonoValido(d.telefono),
  );
}

interface DireccionFormProps {
  value: DireccionInline;
  onChange: (value: DireccionInline) => void;
}

/**
 * Formulario de dirección de envío inline: usado por invitados y por
 * usuarios autenticados sin direcciones guardadas.
 *
 * El código postal manda. Sus dos primeros dígitos son el código de provincia
 * del INE, así que la provincia no se pregunta —se deduce y se muestra— y la
 * lista de localidades se limita a los municipios de esa provincia. Antes los
 * tres campos eran texto libre y ya habían dejado «españa» escrito como ciudad.
 */
export function DireccionForm({ value, onChange }: DireccionFormProps) {
  const set = (field: keyof DireccionInline) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  const provincia = provinciaPorCP(value.codigo_postal);
  const { municipios, cargando } = useMunicipios(value.codigo_postal);

  const cpInvalido = value.codigo_postal.trim() !== "" && !codigoPostalValido(value.codigo_postal);

  /**
   * Al cambiar el CP se borra la localidad si cambia de provincia. Sin esto,
   * corregir «28001» por «46001» dejaba «Madrid» seleccionado con un CP de
   * Valencia, y el rechazo llegaba al pagar: el peor momento posible.
   */
  const cambiarCP = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cp = e.target.value;
    const provinciaNueva = provinciaPorCP(cp);
    onChange({
      ...value,
      codigo_postal: cp,
      provincia: provinciaNueva ?? "",
      ciudad: provinciaNueva === provincia ? value.ciudad : "",
    });
  };

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
            onChange={cambiarCP}
            required
            aria-describedby="dir-cp-ayuda"
          />
          {cpInvalido ? (
            <p className="text-xs text-destructive">
              Cinco dígitos de un código postal español.
            </p>
          ) : (
            <p id="dir-cp-ayuda" className="text-xs text-muted-foreground">
              La provincia se rellena sola.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="dir-provincia">Provincia</Label>
          {/* Solo lectura: sale del CP. `readOnly` y no `disabled` para que siga
              leyéndose con lector de pantalla. */}
          <Input
            id="dir-provincia"
            value={provincia ?? ""}
            placeholder="—"
            readOnly
            tabIndex={-1}
            className="bg-muted/50 text-muted-foreground"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="dir-ciudad">Localidad</Label>
        <select
          id="dir-ciudad"
          value={value.ciudad}
          onChange={(e) => onChange({ ...value, ciudad: e.target.value })}
          required
          disabled={!provincia || cargando}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">
            {!provincia
              ? "Escribe primero el código postal"
              : cargando
                ? "Cargando…"
                : `Elige tu localidad (${municipios.length})`}
          </option>
          {municipios.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {provincia && !cargando && (
          <p className="text-xs text-muted-foreground">
            Municipios de {provincia}, según el INE.
          </p>
        )}
      </div>

      {/* Obligatorio: es por donde el repartidor avisa o pregunta si no
          encuentra el portal. Sin esto el pedido llega al almacén sin ninguna
          forma de contactar con quien lo espera. */}
      <div className="space-y-1">
        <Label htmlFor="dir-telefono">Teléfono de contacto</Label>
        <Input
          id="dir-telefono"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="600 11 22 33"
          maxLength={20}
          value={value.telefono}
          onChange={set("telefono")}
          required
          aria-describedby="dir-telefono-ayuda"
        />
        {value.telefono !== "" && !telefonoValido(value.telefono) ? (
          <p className="text-xs text-destructive">
            Introduce un teléfono español de 9 dígitos (móvil o fijo).
          </p>
        ) : (
          <p id="dir-telefono-ayuda" className="text-xs text-muted-foreground">
            Para avisarte de la entrega. No se usa para nada más.
          </p>
        )}
      </div>
    </div>
  );
}
