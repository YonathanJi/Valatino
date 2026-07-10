export const metadata = {
  title: "Términos y condiciones · Valatino",
};

export default function TerminosPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold">Términos y condiciones</h1>
      <p className="text-muted-foreground leading-relaxed">
        Estas condiciones regulan la compra de productos en Valatino,
        tienda online de productos latinoamericanos con envío en España.
      </p>
      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Precios y stock</h2>
        <p>
          Los precios incluyen IVA. Al iniciar el pago, las unidades de tu
          carrito quedan reservadas durante 15 minutos; pasado ese tiempo la
          reserva se libera automáticamente.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Pagos</h2>
        <p>
          Aceptamos tarjeta (Stripe) y PayPal. El pedido se confirma únicamente
          cuando la pasarela de pago verifica la operación.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Envíos y devoluciones</h2>
        <p>
          Realizamos envíos a toda España peninsular. Dispones de 14 días
          naturales desde la recepción para ejercer tu derecho de desistimiento
          en productos no perecederos sin abrir.
        </p>
      </section>
      <p className="text-xs text-muted-foreground">
        Última actualización: julio de 2026. Este texto es provisional y será
        revisado por asesoría legal antes del lanzamiento.
      </p>
    </main>
  );
}
