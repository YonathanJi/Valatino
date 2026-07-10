export const metadata = {
  title: "Política de privacidad · Valatino",
};

export default function PoliticaPrivacidadPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-6">
      <h1 className="text-3xl font-bold">Política de privacidad</h1>
      <p className="text-muted-foreground leading-relaxed">
        En Valatino tratamos tus datos personales con la única finalidad de
        gestionar tu compra, el envío de tus pedidos y la comunicación
        relacionada con ellos.
      </p>
      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Qué datos recogemos</h2>
        <p>
          Email de contacto, documento de identidad (para facturación y
          gestión aduanera cuando aplica), dirección de envío y el historial
          de tus pedidos.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Pagos</h2>
        <p>
          Los pagos se procesan directamente por Stripe o PayPal. Valatino no
          almacena en ningún caso los datos de tu tarjeta.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Tus derechos</h2>
        <p>
          Puedes solicitar el acceso, rectificación o supresión de tus datos
          escribiendo a soporte@valatino.es.
        </p>
      </section>
      <p className="text-xs text-muted-foreground">
        Última actualización: julio de 2026. Este texto es provisional y será
        revisado por asesoría legal antes del lanzamiento.
      </p>
    </main>
  );
}
