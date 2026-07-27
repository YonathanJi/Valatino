"use client";

import { useEffect, useState } from "react";
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

/** Que no vuelva a preguntar a quien ya dijo que no. */
const claveDescarte = (token: string) => `calificacion-descartada:${token}`;

interface CalificarCompraProps {
  token: string;
}

/**
 * Pide opinión sobre el proceso de compra al terminar el pago.
 *
 * Dos preguntas y un comentario opcional. Las escalas tienen FORMA distinta a
 * propósito (tres botones con etiqueta vs. cinco caras): dos escalas idénticas
 * una debajo de otra invitan a marcar lo mismo dos veces sin pensarlo, y
 * entonces los dos datos valen lo que uno.
 *
 * ⚠️ Nada de esto es obligatorio: se puede cerrar, el descarte se recuerda, y si
 * la API falla el bloque desaparece en silencio. A quien acaba de pagar no se le
 * enseña un error por no haber podido guardar una opinión.
 */
export function CalificarCompra({ token }: CalificarCompraProps) {
  const [visible, setVisible] = useState(false);
  const [esfuerzo, setEsfuerzo] = useState<EsfuerzoCompra | null>(null);
  const [satisfaccion, setSatisfaccion] = useState<SatisfaccionCompra | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // Se pregunta solo si el token vale y no lo descartó ya. La respuesta también
  // trae lo ya opinado, para que vuelva relleno si recarga la página.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(claveDescarte(token))) return;

    let vigente = true;

    void fetch(`${API_URL}/calificaciones/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { calificacion: Calificacion | null } | null) => {
        if (!vigente || !json) return;
        const previa = json.calificacion;
        if (previa) {
          setEsfuerzo(previa.esfuerzo);
          setSatisfaccion(previa.satisfaccion);
          setComentario(previa.comentario ?? "");
          setEnviado(true);
        }
        setVisible(true);
      })
      .catch(() => {
        // En silencio: sin opinión se sigue viviendo, con un error en la página
        // de «gracias por tu compra» no.
      });

    return () => {
      vigente = false;
    };
  }, [token]);

  const enviar = async (
    e: EsfuerzoCompra,
    s: SatisfaccionCompra,
    texto: string,
  ): Promise<boolean> => {
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/calificaciones/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          esfuerzo: e,
          satisfaccion: s,
          comentario: texto.trim() || undefined,
        }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setEnviando(false);
    }
  };

  /**
   * Se guarda en cuanto están las dos respuestas, sin esperar a un botón: si
   * cierra la pestaña después de puntuar, la opinión ya está. El comentario se
   * pide DESPUÉS, que es cuando ya ha invertido dos toques y está dispuesto —
   * un campo de texto por delante espanta.
   */
  const responder = (e: EsfuerzoCompra | null, s: SatisfaccionCompra | null) => {
    setEsfuerzo(e);
    setSatisfaccion(s);
    if (e && s) void enviar(e, s, comentario).then((ok) => ok && setEnviado(true));
  };

  const descartar = () => {
    localStorage.setItem(claveDescarte(token), "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section className="mt-8 rounded-xl border bg-card p-5 text-left">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">
            {enviado ? "¡Gracias por tu opinión!" : "¿Qué tal fue comprar?"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enviado
              ? "Nos ayuda a mejorar la tienda. Puedes cambiarla si quieres."
              : "Dos toques y nos ayudas a mejorar. No es obligatorio."}
          </p>
        </div>
        {!enviado && (
          <button
            type="button"
            onClick={descartar}
            aria-label="No quiero calificar"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            No, gracias
          </button>
        )}
      </div>

      <fieldset className="mt-4" disabled={enviando}>
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

      <fieldset className="mt-4" disabled={enviando}>
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
      {esfuerzo && satisfaccion && (
        <div className="mt-4 space-y-2">
          <label htmlFor="calificacion-comentario" className="block text-sm font-medium">
            ¿Algo que podamos mejorar? (opcional)
          </label>
          <textarea
            id="calificacion-comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Lo que quieras contarnos"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enviando}
              onClick={() =>
                void enviar(esfuerzo, satisfaccion, comentario).then((ok) => ok && setEnviado(true))
              }
            >
              {enviando ? "Guardando…" : "Enviar comentario"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
