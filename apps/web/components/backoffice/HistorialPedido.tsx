import { ArrowRight, CreditCard, Mail, Undo2, UserCircle2, Cog } from "lucide-react";
import { ORIGEN_LABELS, PEDIDO_ESTADO_LABELS } from "@valatino/types";
import type { PedidoEvento, TipoEventoPedido } from "@valatino/types";
import { formatEUR } from "@lib/utils";

const ICONO: Record<TipoEventoPedido, typeof Mail> = {
  estado: ArrowRight,
  pago: CreditCard,
  reembolso: Undo2,
  email: Mail,
};

const COLOR: Record<TipoEventoPedido, string> = {
  estado: "bg-blue-100 text-blue-700",
  pago: "bg-green-100 text-green-700",
  reembolso: "bg-amber-100 text-amber-800",
  email: "bg-muted text-muted-foreground",
};

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Qué pasó, en una frase. */
function titulo(evento: PedidoEvento): string {
  switch (evento.tipo) {
    case "estado":
      // Sin estado anterior = es el alta del pedido.
      return evento.estado_anterior === null
        ? `Pedido creado como ${PEDIDO_ESTADO_LABELS[evento.estado_nuevo!] ?? evento.estado_nuevo}`
        : `${PEDIDO_ESTADO_LABELS[evento.estado_anterior] ?? evento.estado_anterior} → ${
            PEDIDO_ESTADO_LABELS[evento.estado_nuevo!] ?? evento.estado_nuevo
          }`;
    case "pago":
      return `Pago confirmado${evento.importe != null ? ` de ${formatEUR(Number(evento.importe))}` : ""}`;
    case "reembolso":
      return `Devolución${evento.importe != null ? ` de ${formatEUR(Number(evento.importe))}` : ""}`;
    case "email":
      return "Correo enviado al cliente";
  }
}

export function HistorialPedido({ eventos }: { eventos: PedidoEvento[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay actividad registrada en este pedido.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {eventos.map((e) => {
        const Icono = ICONO[e.tipo];
        const conPersona = e.actor_nombre ?? e.actor_email;

        return (
          <li key={e.id} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${COLOR[e.tipo]}`}
            >
              <Icono className="h-4 w-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{titulo(e)}</p>
              {e.detalle && (
                <p className="truncate text-xs text-muted-foreground" title={e.detalle}>
                  {e.detalle}
                </p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {/* Quién es lo que se viene a mirar aquí, así que va primero y
                    en negrita cuando hay una persona detrás. */}
                {conPersona ? (
                  <>
                    <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="font-medium text-foreground">{conPersona}</span>
                  </>
                ) : (
                  <>
                    <Cog className="h-3.5 w-3.5" aria-hidden />
                    <span>Sistema · {ORIGEN_LABELS[e.origen]}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <time dateTime={e.created_at}>{fechaLarga(e.created_at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
