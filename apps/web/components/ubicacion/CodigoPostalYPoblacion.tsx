"use client";

import { useState } from "react";
import { codigoPostalValido, provinciaPorCP } from "@valatino/types";
import { useMunicipios } from "@lib/hooks/useMunicipios";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

/**
 * Código postal, población y provincia, con la regla del proyecto entera: **el CP
 * manda**. La provincia se deduce de sus dos primeros dígitos y la población sale
 * de un desplegable acotado a los municipios de ese CP, del diccionario del INE.
 *
 * ⚠️⚠️ NACE DE UN FALLO QUE LLEGÓ A UN DOCUMENTO CONTABLE. La tienda validaba así
 * sus direcciones de envío desde la 041, pero los **datos fiscales** eran tres
 * campos de texto libre — y el 2026-08-14 la primera factura real salió con el
 * domicilio `Calle del Arco, 9 · 28840 españa`, y el receptor de `VALF202600100`
 * con «Mejorada del campo» en minúscula. Dos formularios distintos, el mismo
 * hueco. Este componente existe para que sea **uno**.
 *
 * ⚠️ EL ACOTADO POR CP ES UNA AYUDA, NO UNA PUERTA CERRADA, y ese matiz es todo el
 * diseño — igual que en `DireccionForm`. La tabla de códigos postales no es
 * oficial (Correos no la publica), así que puede faltarle un CP o un municipio.
 * Si acotar cerrase la puerta, una laguna dejaría a alguien sin poder facturar y
 * sin ninguna pista de por qué. Por eso siempre hay salida a la provincia entera,
 * y por eso **el servidor valida contra la provincia**, jamás contra esta tabla.
 *
 * La provincia se muestra pero NO se edita: la API la recalcula desde el CP y
 * descarta lo que llegue (`ubicacionParaGuardar`). Un campo editable cuyo valor
 * se tira es una invitación a pelearse con el formulario.
 *
 * ⚠️ `DireccionForm` (checkout y perfil) sigue con su propia copia de esta lógica.
 * Es el tercer consumidor pendiente, y NO se migró a propósito: está en la ruta
 * del dinero y la web no tiene tests de componentes, así que ese cambio quiere
 * hacerse mirando la pantalla, no de paso. Apuntado en ESTADO.md.
 */
export interface UbicacionValor {
  codigoPostal: string;
  ciudad: string;
  provincia: string;
}

interface Props {
  /** Prefijo de los `id` para que los `<label>` apunten bien si hay dos en la página. */
  idPrefijo: string;
  valor: UbicacionValor;
  onChange: (v: UbicacionValor) => void;
  deshabilitado?: boolean;
}

export function CodigoPostalYPoblacion({ idPrefijo, valor, onChange, deshabilitado }: Props) {
  const provincia = provinciaPorCP(valor.codigoPostal);
  const { municipios, delCP, cargando } = useMunicipios(valor.codigoPostal);

  // Lo pide quien no ve su población. Se reinicia al cambiar de CP: es una salida
  // para ESE código postal, no una preferencia del formulario.
  const [verProvinciaEntera, setVerProvinciaEntera] = useState(false);

  // Si la población ya elegida no está entre las del CP, se muestra la provincia
  // entera: esconderla la borraría de la vista sin avisar a nadie.
  const acotaElCP =
    delCP.length > 0 && !verProvinciaEntera && (!valor.ciudad || delCP.includes(valor.ciudad));
  const opciones = acotaElCP ? delCP : municipios;

  const cpInvalido = valor.codigoPostal.trim() !== "" && !codigoPostalValido(valor.codigoPostal);

  /**
   * Al cambiar el CP se borra la población si cambia de provincia. Sin esto,
   * corregir «28001» por «46001» dejaba «Madrid» elegido con un CP de Valencia, y
   * el rechazo llegaba al guardar: el peor momento posible.
   */
  const cambiarCP = (bruto: string) => {
    const cp = bruto.replace(/\D/g, "").slice(0, 5);
    const provinciaNueva = provinciaPorCP(cp);
    setVerProvinciaEntera(false);
    onChange({
      codigoPostal: cp,
      ciudad: provinciaNueva === provincia ? valor.ciudad : "",
      provincia: provinciaNueva ?? "",
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefijo}-cp`}>Código postal</Label>
        <Input
          id={`${idPrefijo}-cp`}
          value={valor.codigoPostal}
          onChange={(e) => cambiarCP(e.target.value)}
          placeholder="28001"
          className="font-mono"
          inputMode="numeric"
          autoComplete="postal-code"
          aria-invalid={cpInvalido || undefined}
          aria-describedby={cpInvalido ? `${idPrefijo}-cp-error` : undefined}
          disabled={deshabilitado}
        />
        {cpInvalido && (
          <p id={`${idPrefijo}-cp-error`} className="text-xs text-destructive">
            Son cinco cifras.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefijo}-poblacion`}>Población</Label>
        <select
          id={`${idPrefijo}-poblacion`}
          value={valor.ciudad}
          onChange={(e) => onChange({ ...valor, ciudad: e.target.value, provincia: provincia ?? "" })}
          disabled={deshabilitado || !provincia || cargando}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">
            {!provincia
              ? "Escribe antes el código postal"
              : cargando
                ? "Cargando…"
                : `Elige la población (${opciones.length})`}
          </option>
          {opciones.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {provincia && !cargando && (
          <p className="text-xs text-muted-foreground">
            {acotaElCP ? (
              <>
                {opciones.length === 1
                  ? `Única población del ${valor.codigoPostal.trim()}.`
                  : `Poblaciones del ${valor.codigoPostal.trim()}.`}{" "}
                {/* La salida. Va como botón y no como enlace porque no navega a
                    ningún sitio, y se anuncia con `aria-controls` para que con
                    lector de pantalla se entienda qué cambia al pulsarlo. */}
                <button
                  type="button"
                  onClick={() => setVerProvinciaEntera(true)}
                  aria-controls={`${idPrefijo}-poblacion`}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  ¿No ves la tuya? Ver las {municipios.length} de {provincia}
                </button>
              </>
            ) : (
              <>Municipios de {provincia}, según el INE.</>
            )}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefijo}-provincia`}>Provincia</Label>
        <Input
          id={`${idPrefijo}-provincia`}
          value={provincia ?? ""}
          readOnly
          disabled
          placeholder="Sale del código postal"
          aria-describedby={`${idPrefijo}-provincia-nota`}
        />
        <p id={`${idPrefijo}-provincia-nota`} className="text-xs text-muted-foreground">
          La deciden las dos primeras cifras del CP.
        </p>
      </div>
    </div>
  );
}
