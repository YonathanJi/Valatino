"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { StripeCheckoutForm } from "@components/checkout/StripeCheckout";
import { PaypalCheckoutButton } from "@components/checkout/PaypalCheckout";
import { DireccionSelector } from "@components/checkout/DireccionSelector";
import {
  DireccionForm,
  DIRECCION_VACIA,
  direccionCompleta,
  type DireccionInline,
} from "@components/checkout/DireccionForm";
import type { CheckoutPayload } from "@components/checkout/types";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useCarrito } from "@lib/hooks/useCarrito";
import { formatEUR } from "@lib/utils";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch, ApiError } from "@lib/api/client";
import type { ReservaCheckoutResponse } from "@valatino/types";

type MetodoPago = "stripe" | "paypal";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOCUMENTO_REGEX = /^([0-9]{8}[A-Za-z]|[XYZxyz][0-9]{7}[A-Za-z])$/;

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CheckoutPage() {
  const [metodo, setMetodo] = useState<MetodoPago>("stripe");
  const [direccionEnvioId, setDireccionEnvioId] = useState("");
  const [direccionesGuardadas, setDireccionesGuardadas] = useState<number | null>(null);
  const [direccionInline, setDireccionInline] = useState<DireccionInline>(DIRECCION_VACIA);
  const [reservaOk, setReservaOk] = useState(false);
  const [reservando, setReservando] = useState(false);
  const [reservaExpiresAt, setReservaExpiresAt] = useState<string | null>(null);
  const [reservaExpirada, setReservaExpirada] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [cuentaExistente, setCuentaExistente] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bannerDescartado, setBannerDescartado] = useState(false);
  const { carrito } = useCarrito();

  // Detectar si ya hay sesión iniciada
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(Boolean(session));
      if (session?.user?.email) setEmail(session.user.email);
    });
  }, []);

  const reservarStock = useCallback(async () => {
    setReservando(true);
    try {
      const data = await apiFetch<ReservaCheckoutResponse>("/checkout/reservar", {
        method: "POST",
      });
      setReservaOk(true);
      setReservaExpirada(false);
      setReservaExpiresAt(data.expiresAt);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo reservar el stock");
    } finally {
      setReservando(false);
    }
  }, []);

  useEffect(() => {
    if (carrito && carrito.items.length > 0 && !reservaOk && !reservando && !reservaExpirada) {
      void reservarStock();
    }
  }, [carrito, reservaOk, reservando, reservaExpirada, reservarStock]);

  // Countdown de la reserva (TTL 15 min)
  useEffect(() => {
    if (!reservaExpiresAt) return;
    const tick = () => {
      const restante = new Date(reservaExpiresAt).getTime() - Date.now();
      if (restante <= 0) {
        setReservaOk(false);
        setReservaExpirada(true);
        setReservaExpiresAt(null);
        return;
      }
      setTiempoRestante(formatCountdown(restante));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reservaExpiresAt]);

  // Verificación de email registrado: banner para invitar a iniciar sesión
  const verificarEmail = useCallback(async (emailToCheck: string) => {
    if (isAuthenticated) return;
    if (!EMAIL_REGEX.test(emailToCheck)) {
      setCuentaExistente(false);
      return;
    }
    setVerificando(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", emailToCheck.toLowerCase())
        .maybeSingle();
      setCuentaExistente(Boolean(data));
    } catch {
      // silencioso
    } finally {
      setVerificando(false);
    }
  }, [isAuthenticated]);

  // Debounce en el cambio de email
  useEffect(() => {
    const t = setTimeout(() => void verificarEmail(email), 500);
    return () => clearTimeout(t);
  }, [email, verificarEmail]);

  // ── Validaciones ──────────────────────────────────────────
  const emailValido = EMAIL_REGEX.test(email);
  const documentoValido = documento === "" || DOCUMENTO_REGEX.test(documento.trim());

  // Usuario autenticado con direcciones guardadas → selector.
  // Invitado, o autenticado sin direcciones → formulario inline.
  const usaDireccionGuardada = isAuthenticated && (direccionesGuardadas ?? 0) > 0;
  const direccionValida = usaDireccionGuardada
    ? direccionEnvioId !== ""
    : direccionCompleta(direccionInline);

  const puedePagar = emailValido && documentoValido && direccionValida;

  const payload: CheckoutPayload = useMemo(
    () => ({
      email,
      documento: documento.trim() || undefined,
      ...(usaDireccionGuardada
        ? { direccion_envio_id: direccionEnvioId }
        : {
            direccion: {
              nombre_destinatario: direccionInline.nombre_destinatario.trim(),
              linea1: direccionInline.linea1.trim(),
              linea2: direccionInline.linea2.trim() || undefined,
              ciudad: direccionInline.ciudad.trim(),
              codigo_postal: direccionInline.codigo_postal.trim(),
              provincia: direccionInline.provincia.trim(),
              pais: direccionInline.pais || "ES",
            },
          }),
    }),
    [email, documento, usaDireccionGuardada, direccionEnvioId, direccionInline],
  );

  if (!carrito || carrito.items.length === 0) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Tu carrito está vacío</h1>
        <Button asChild><a href="/">Ir al catálogo</a></Button>
      </main>
    );
  }

  if (reservaExpirada) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">Tu reserva ha expirado</h1>
        <p className="text-muted-foreground">
          Los productos volvieron a estar disponibles para otros clientes.
          Puedes renovar la reserva para continuar con la compra.
        </p>
        <Button onClick={() => void reservarStock()} disabled={reservando} size="lg">
          {reservando ? "Renovando..." : "Renovar reserva"}
        </Button>
      </main>
    );
  }

  if (!reservaOk) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse space-y-2">
          <div className="h-6 bg-muted rounded w-64 mx-auto" />
          <p className="text-muted-foreground">Reservando productos...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Pagar</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Formulario de pago */}
        <div className="lg:col-span-3 space-y-6">
          {/* Banner: ya tienes cuenta con este correo */}
          {cuentaExistente && !isAuthenticated && !bannerDescartado && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1 text-sm">
                <p className="font-medium">Tienes una cuenta con este correo</p>
                <p className="text-muted-foreground">
                  Inicia sesión para ver este pedido en tu historial.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link href={`/login?email=${encodeURIComponent(email)}&redirectTo=${encodeURIComponent("/checkout")}`}>
                    Iniciar sesión
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBannerDescartado(true)}>
                  Seguir como invitado
                </Button>
              </div>
            </div>
          )}

          {/* Datos del cliente */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="font-semibold">Tus datos</h2>
            <div className="space-y-1">
              <Label htmlFor="email-checkout">Correo electrónico</Label>
              <Input
                id="email-checkout"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isAuthenticated}
                required
              />
              {verificando && (
                <p className="text-xs text-muted-foreground animate-pulse">Verificando...</p>
              )}
              {email !== "" && !emailValido && (
                <p className="text-xs text-destructive">Introduce un correo válido.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="documento-checkout">Documento de identidad (DNI/NIE)</Label>
              <Input
                id="documento-checkout"
                placeholder="12345678A"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
              {!documentoValido && (
                <p className="text-xs text-destructive">
                  Formato no válido. Ej: 12345678A (DNI) o X1234567A (NIE).
                </p>
              )}
            </div>
          </div>

          {/* Dirección: selector (autenticado con guardadas) o formulario inline */}
          {isAuthenticated && (
            <DireccionSelector
              onSelect={setDireccionEnvioId}
              selectedId={direccionEnvioId}
              onLoaded={setDireccionesGuardadas}
            />
          )}
          {!usaDireccionGuardada && (
            <DireccionForm value={direccionInline} onChange={setDireccionInline} />
          )}

          {/* Selector de método de pago */}
          <div className="flex gap-3">
            <Button
              variant={metodo === "stripe" ? "default" : "outline"}
              onClick={() => setMetodo("stripe")}
              className="flex-1"
            >
              💳 Tarjeta
            </Button>
            <Button
              variant={metodo === "paypal" ? "default" : "outline"}
              onClick={() => setMetodo("paypal")}
              className="flex-1"
            >
              🅿️ PayPal
            </Button>
          </div>

          {metodo === "stripe" && (
            <StripeCheckoutForm
              total={carrito.total}
              payload={payload}
              documentoRegistrado={cuentaExistente}
              disabled={!puedePagar}
            />
          )}

          {metodo === "paypal" && (
            <PayPalScriptProvider
              options={{
                clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
                currency: "EUR",
              }}
            >
              <PaypalCheckoutButton
                payload={payload}
                documentoRegistrado={cuentaExistente}
                disabled={!puedePagar}
              />
            </PayPalScriptProvider>
          )}
        </div>

        {/* Resumen del pedido */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-4 h-fit">
          <h2 className="font-semibold text-lg">Tu pedido</h2>
          {carrito.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.nombre} ×{item.cantidad}
              </span>
              <span>{formatEUR(item.subtotal)}</span>
            </div>
          ))}
          <div className="border-t pt-4 flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">{formatEUR(carrito.total)}</span>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            ⏱️ Reserva válida {tiempoRestante ? `— quedan ${tiempoRestante}` : "por 15 minutos"}
          </p>
        </div>
      </div>
    </main>
  );
}
