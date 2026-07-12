"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle, LogIn } from "lucide-react";
import { Button } from "@components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type EstadoPago = "exitoso" | "procesando" | "fallido";

/**
 * El pedido lo crea el webhook del proveedor de pago unos segundos después
 * de la redirección, así que se consulta con reintentos hasta obtener el
 * número de pedido.
 */
function useNumeroPedido(referencia: string, activo: boolean): string | null {
  const [numeroPedido, setNumeroPedido] = useState<string | null>(null);

  useEffect(() => {
    if (!referencia || !activo) return;

    let cancelado = false;
    let intentos = 0;

    const consultar = async () => {
      try {
        const res = await fetch(
          `${API_URL}/pedidos/por-referencia/${encodeURIComponent(referencia)}`,
        );
        if (res.ok) {
          const json = (await res.json()) as { numero_pedido: string | null };
          if (!cancelado && json.numero_pedido) {
            setNumeroPedido(json.numero_pedido);
            return;
          }
        }
      } catch {
        // reintentar
      }

      intentos += 1;
      if (!cancelado && intentos < 15) {
        setTimeout(() => void consultar(), 2000);
      }
    };

    void consultar();
    return () => {
      cancelado = true;
    };
  }, [referencia, activo]);

  return numeroPedido;
}

function resolverEstado(redirectStatus: string | null): EstadoPago {
  // Stripe: succeeded | processing | requires_payment_method | failed
  // PayPal (nuestro capture): succeeded | failed
  if (redirectStatus === "succeeded") return "exitoso";
  if (redirectStatus === "processing") return "procesando";
  if (redirectStatus === null) return "exitoso"; // compat: enlaces antiguos
  return "fallido";
}

function ConfirmacionContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const redirectStatus = searchParams.get("redirect_status");
  const referencia =
    searchParams.get("payment_intent") ?? searchParams.get("referencia") ?? "";

  const estado = resolverEstado(redirectStatus);
  const numeroPedido = useNumeroPedido(referencia, estado === "exitoso");

  if (estado === "fallido") {
    return (
      <main className="max-w-xl mx-auto px-4 py-24 text-center space-y-6">
        <div className="flex justify-center">
          <XCircle className="h-20 w-20 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold">El pago no se completó</h1>
        <p className="text-muted-foreground leading-relaxed">
          Tu banco rechazó el pago o la operación fue cancelada.
          No se ha realizado ningún cargo. Tus productos siguen en el carrito.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/checkout">Intentar de nuevo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/carrito">Ver mi carrito</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (estado === "procesando") {
    return (
      <main className="max-w-xl mx-auto px-4 py-24 text-center space-y-6">
        <div className="flex justify-center">
          <Clock3 className="h-20 w-20 text-amber-500" />
        </div>
        <h1 className="text-3xl font-bold">Pago en proceso</h1>
        <p className="text-muted-foreground leading-relaxed">
          Tu banco está procesando el pago. Te enviaremos un correo en cuanto
          se confirme. No es necesario que repitas la compra.
        </p>
        {referencia && (
          <p className="text-xs text-muted-foreground">
            Referencia de pago: <span className="font-mono">{referencia}</span>
          </p>
        )}
        <Button asChild variant="outline">
          <Link href="/">Volver a la tienda</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-24 text-center space-y-6">
      <div className="flex justify-center">
        <CheckCircle2 className="h-20 w-20 text-green-500" />
      </div>
      <h1 className="text-3xl font-bold">¡Pedido confirmado!</h1>
      <p className="text-muted-foreground leading-relaxed">
        Tu pago ha sido procesado correctamente. Recibirás un correo de confirmación con
        los detalles de tu pedido y el seguimiento del envío.
      </p>

      {numeroPedido ? (
        <p className="text-sm text-muted-foreground">
          Número de pedido: <span className="font-mono font-semibold text-foreground">{numeroPedido}</span>
          <br />
          <span className="text-xs">Guárdalo por si necesitas contactar con soporte.</span>
        </p>
      ) : (
        referencia && (
          <p className="text-xs text-muted-foreground">
            Generando tu número de pedido…
          </p>
        )
      )}

      {email && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <p className="text-sm font-medium">
            ¿Quieres hacer seguimiento a tu pedido?
          </p>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Inicia sesión con tu correo. Si no tienes cuenta, se creará automáticamente.
            </p>
            <Button asChild className="w-full">
              <Link href={`/login?email=${encodeURIComponent(email)}&redirectTo=/cuenta/pedidos`}>
                <LogIn className="h-4 w-4 mr-2" />
                Iniciar sesión
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild variant="outline">
          <Link href="/">Seguir comprando</Link>
        </Button>
      </div>
    </main>
  );
}

export default function ConfirmacionPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmacionContent />
    </Suspense>
  );
}
