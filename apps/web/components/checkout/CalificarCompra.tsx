"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@lib/api/client";
import { Button } from "@components/ui/button";
import {
  ESFUERZO_LABELS,
  SATISFACCION_LABELS,
  type Calificacion,
  type EsfuerzoCompra,
  type SatisfaccionCompra,
} from "@valatino/types";

/** Caras en vez de números: en móvil se toca una cara sin pensar; un 1-5 se lee. */
const CARAS: Record<SatisfaccionCompra, string> = {
  1: "😞",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

const ESFUERZOS: EsfuerzoCompra[] = [1, 2, 3];
const SATISFACCIONES: SatisfaccionCompra[] = [1, 2, 3, 4, 5];

/** Que no vuelva a preguntar a quien ya dijo que no, ni a quien ya opinó. */
const claveDescarte = (token: string) => `calificacion-descartada:${token}`;

type Estado = "quieto" | "guardando" | "guardado" | "error";

/**
 * Lo que se ve el ✓ antes de que la ventana se cierre sola tras pulsar «Enviar».
 * Suficiente para leerlo; más y parece que se ha quedado colgada.
 */
const MS_ANTES_DE_CERRAR = 1400;

interface CalificarCompraProps {
  token: string;
}

/**
 * Pide opinión sobre el proceso de compra, en ventana emergente.
 *
 * Fue una tarjeta al final de la página de confirmación y **no servía**: quedaba
 * bajo el pliegue y nadie llegaba. Ahora se abre sola al confirmarse el pedido.
 *
 * ⚠️ Y aquí el aviso importante, porque ya falló una vez: **cada acción tiene que
 * confirmarse DONDE se pulsó**. La primera versión guardaba bien pero solo
 * cambiaba el título de arriba, así que quien miraba el botón veía «Guardando…»
 * y luego el botón otra vez, sin más. Parecía roto estando bien, y se pulsó tres
 * veces (las tres se guardaron). Un fallo silencioso tras un clic es indistinguible
 * de que no pase nada: callar está bien ANTES de que alguien pulse, no después.
 */
export function CalificarCompra({ token }: CalificarCompraProps) {
  const [abierto, setAbierto] = useState(false);
  const [esfuerzo, setEsfuerzo] = useState<EsfuerzoCompra | null>(null);
  const [satisfaccion, setSatisfaccion] = useState<SatisfaccionCompra | null>(null);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<Estado>("quieto");
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  // Se está yendo sola tras pulsar «Enviar»: nada más que tocar mientras.
  const [cerrandose, setCerrandose] = useState(false);
  const dialogo = useRef<HTMLDivElement>(null);
  const relojDeCierre = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se abre sola solo si el token vale, no lo descartó y no ha opinado ya:
  // recargar la página de confirmación no debe volver a saltar.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(claveDescarte(token))) return;

    let vigente = true;

    void fetch(`${API_URL}/calificaciones/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { calificacion: Calificacion | null } | null) => {
        if (!vigente || !json) return;
        if (json.calificacion) {
          // Ya opinó: no se le vuelve a preguntar.
          localStorage.setItem(claveDescarte(token), "1");
          return;
        }
        setAbierto(true);
      })
      .catch(() => {
        // Sin opinión se sigue viviendo; con un error en la página de «gracias
        // por tu compra», no. Esto es ANTES de que el cliente pulse nada.
      });

    return () => {
      vigente = false;
    };
  }, [token]);

  const cerrar = () => {
    if (relojDeCierre.current) clearTimeout(relojDeCierre.current);
    localStorage.setItem(claveDescarte(token), "1");
    setAbierto(false);
  };

  // Cerrar a mano durante el cierre automático no debe dejar el reloj corriendo.
  useEffect(
    () => () => {
      if (relojDeCierre.current) clearTimeout(relojDeCierre.current);
    },
    [],
  );

  // Escape cierra, y al abrir se lleva el foco al diálogo para que el lector de
  // pantalla anuncie de qué va la ventana que acaba de aparecer.
  useEffect(() => {
    if (!abierto) return;
    dialogo.current?.focus();
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  /**
   * `alPulsarEnviar` distingue las dos formas de guardar, que son distintas de
   * verdad:
   *
   * - **Automático** (al completar las dos puntuaciones): la ventana se queda,
   *   porque justo después aparece el hueco del comentario y cerrarla se lo
   *   llevaría por delante.
   * - **Pulsando «Enviar»**: enviar es un acto de terminar. Se muestra el ✓ y la
   *   ventana se va sola. Dejarla abierta hacía creer que no había enviado, así
   *   que se volvía a puntuar —y cada toque manda otro POST— o se pulsaba otra
   *   vez. Mismo error que en la versión de la tarjeta, con otra cara: el éxito
   *   estaba escrito, pero no pasaba nada de lo que se espera al enviar algo.
   */
  const guardar = async (
    e: EsfuerzoCompra,
    s: SatisfaccionCompra,
    texto: string,
    alPulsarEnviar = false,
  ) => {
    setEstado("guardando");
    setMensajeError(null);
    try {
      const res = await fetch(`${API_URL}/calificaciones/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esfuerzo: e, satisfaccion: s, comentario: texto.trim() || undefined }),
      });

      if (res.ok) {
        setEstado("guardado");
        if (alPulsarEnviar) {
          setCerrandose(true);
          relojDeCierre.current = setTimeout(cerrar, MS_ANTES_DE_CERRAR);
        }
        return;
      }

      // Se DICE qué pasó. La versión anterior devolvía false y no mostraba nada.
      setEstado("error");
      setMensajeError(
        res.status === 429
          ? "Demasiados intentos seguidos. Espera un momento y vuelve a probar."
          : "No se pudo guardar tu opinión. Inténtalo de nuevo.",
      );
    } catch {
      setEstado("error");
      setMensajeError("No hay conexión con el servidor. Inténtalo de nuevo.");
    }
  };

  /**
   * Se guarda en cuanto están las dos respuestas, sin esperar a un botón: si
   * cierra la ventana después de puntuar, la opinión ya está. El comentario se
   * pide DESPUÉS, que es cuando ya ha invertido dos toques.
   */
  const responder = (e: EsfuerzoCompra | null, s: SatisfaccionCompra | null) => {
    if (cerrandose) return; // ya se está despidiendo: otro POST no aporta nada
    setEsfuerzo(e);
    setSatisfaccion(s);
    if (e && s) void guardar(e, s, comentario);
  };

  if (!abierto) return null;

  const puntuado = esfuerzo !== null && satisfaccion !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calificar-titulo"
      onClick={cerrar}
    >
      <div
        ref={dialogo}
        tabIndex={-1}
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5 text-left shadow-lg outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="calificar-titulo" className="font-semibold">
              ¿Qué tal fue comprar?
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dos toques y nos ayudas a mejorar. No es obligatorio.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar sin calificar"
            className="shrink-0 rounded-lg p-1 text-xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <fieldset disabled={estado === "guardando" || cerrandose}>
          <legend className="text-sm font-medium">El proceso te resultó…</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ESFUERZOS.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => responder(valor, satisfaccion)}
                aria-pressed={esfuerzo === valor}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  esfuerzo === valor
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "hover:bg-muted"
                }`}
              >
                {ESFUERZO_LABELS[valor]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={estado === "guardando" || cerrandose}>
          <legend className="text-sm font-medium">¿Cómo lo calificarías?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SATISFACCIONES.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => responder(esfuerzo, valor)}
                aria-label={SATISFACCION_LABELS[valor]}
                aria-pressed={satisfaccion === valor}
                title={SATISFACCION_LABELS[valor]}
                className={`rounded-lg border px-3 py-1.5 text-xl transition-colors ${
                  satisfaccion === valor ? "border-primary bg-primary/10" : "hover:bg-muted"
                }`}
              >
                {CARAS[valor]}
              </button>
            ))}
          </div>
        </fieldset>

        {/* El comentario aparece cuando ya ha puntuado: es donde está lo
            accionable, y pedirlo antes reduce las respuestas. */}
        {puntuado && (
          <div className="space-y-2 border-t pt-4">
            <label htmlFor="calificacion-comentario" className="block text-sm font-medium">
              ¿Algo que podamos mejorar? (opcional)
            </label>
            <textarea
              id="calificacion-comentario"
              value={comentario}
              onChange={(ev) => {
                setComentario(ev.target.value);
                // Al escribir se vuelve a «sin guardar»: si no, el ✓ de la
                // puntuación haría creer que el texto nuevo ya está a salvo.
                if (estado === "guardado") setEstado("quieto");
              }}
              maxLength={2000}
              rows={3}
              // Mientras se cierra no se escribe: el texto nuevo se iría con la
              // ventana y el ✓ diría que se guardó.
              disabled={cerrandose}
              placeholder="Lo que quieras contarnos"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        )}

        {/* Estado y acción, JUNTOS y al lado del botón: es donde mira quien acaba
            de pulsar. Aquí se rompió la versión anterior. */}
        {puntuado && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p
              aria-live="polite"
              className={`text-sm ${
                estado === "error"
                  ? "text-destructive"
                  : estado === "guardado"
                    ? "text-green-700"
                    : "text-muted-foreground"
              }`}
            >
              {estado === "guardando" && "Guardando…"}
              {estado === "guardado" &&
                (cerrandose ? "✓ ¡Gracias! Cerrando…" : "✓ Guardado. ¡Gracias!")}
              {estado === "error" && mensajeError}
            </p>

            <div className="flex gap-2">
              {estado === "guardado" ? (
                <Button type="button" size="sm" onClick={cerrar}>
                  Cerrar
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={estado === "guardando"}
                  onClick={() => void guardar(esfuerzo, satisfaccion, comentario, true)}
                >
                  {estado === "guardando" ? "Guardando…" : "Enviar"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
