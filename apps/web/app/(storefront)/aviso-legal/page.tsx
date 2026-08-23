import Link from "next/link";
import { getIdentidad, domicilioEnUnaLinea } from "@lib/tienda/identidad";
import { HuellaDiagnostico } from "@components/storefront/HuellaDiagnostico";

/**
 * Aviso legal — art. 10 de la Ley 34/2002 (LSSI-CE).
 *
 * ⚠️⚠️ ESTA PÁGINA NO ES DECORATIVA NI OPCIONAL. La norma obliga a que el nombre,
 * el NIF y el domicilio de quien vende estén disponibles «de forma permanente,
 * fácil, directa y gratuita». Hasta el 2026-08-22 no aparecían en ninguna parte
 * de la tienda: el pie decía «© 2026 Valatino» y dos enlaces, y punto.
 *
 * ⭐ LOS DATOS NO ESTÁN ESCRITOS AQUÍ, y es lo importante del diseño: salen de
 * `ajustes_tienda`, las MISMAS columnas que firman cada factura (migración 071).
 * Escribirlos en el JSX habría creado un segundo sitio donde vive el NIF, y el
 * día que cambiara uno la factura diría una cosa y esta página otra — con la
 * particularidad de que nadie mira esta página, así que la discrepancia viviría
 * años.
 *
 * ── LO QUE DEBERÍA REVISAR UNA GESTORÍA ──────────────────────────────────────
 * · Si al vender a consumidores hace falta declarar adhesión a algún sistema de
 *   resolución de litigios, más allá del enlace a la plataforma ODR europea.
 * · Si procede indicar datos de inscripción registral (no aplica a autónomos,
 *   pero conviene confirmarlo si algún día se constituye sociedad).
 * · Si la actividad de alimentación exige mencionar algún registro sanitario
 *   (RGSEAA) en la web.
 */
export const metadata = {
  title: "Aviso legal · Valatino",
  description: "Identidad del titular de la tienda, condiciones de uso y propiedad intelectual.",
  alternates: { canonical: "https://valatino.es/aviso-legal" },
};

export const revalidate = 300;

export default async function AvisoLegalPage() {
  const identidad = await getIdentidad();
  const domicilio = domicilioEnUnaLinea(identidad);

  return (
    <>
      {/* Ver la cabecera de `HuellaDiagnostico`: el commit desplegado y, si la
          identidad no se pudo traer, el motivo. Dos sesiones se perdieron por no
          tener ni una cosa ni la otra. */}
      <HuellaDiagnostico fallo={identidad.fallo} />
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-3xl font-bold">Aviso legal</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Titular de esta tienda</h2>

        {identidad.identificada ? (
          <dl className="rounded-xl border bg-card p-5 text-sm space-y-2">
            <div className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="w-40 shrink-0 text-muted-foreground">Titular</dt>
              <dd className="font-medium">{identidad.nombre}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="w-40 shrink-0 text-muted-foreground">NIF</dt>
              <dd className="font-mono">{identidad.nif}</dd>
            </div>
            {domicilio && (
              <div className="flex flex-col sm:flex-row sm:gap-2">
                <dt className="w-40 shrink-0 text-muted-foreground">Domicilio</dt>
                <dd>{domicilio}</dd>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="w-40 shrink-0 text-muted-foreground">Nombre comercial</dt>
              <dd>Valatino</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-2">
              <dt className="w-40 shrink-0 text-muted-foreground">Sitio web</dt>
              <dd>valatino.es</dd>
            </div>
            {identidad.email && (
              <div className="flex flex-col sm:flex-row sm:gap-2">
                <dt className="w-40 shrink-0 text-muted-foreground">Correo</dt>
                <dd>
                  <a className="text-primary hover:underline" href={`mailto:${identidad.email}`}>
                    {identidad.email}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        ) : (
          /**
           * ⚠️ Que esto se pueda ver es a propósito. Antes de la 071 no había
           * datos fiscales, y una tienda a medio configurar tiene que DECIRLO en
           * vez de enseñar una página en blanco que parece rota — y de paso es un
           * recordatorio bien visible de que falta algo obligatorio.
           */
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Los datos del titular todavía no están configurados. Si necesitas
            identificar a quien vende en esta tienda, escríbenos y te los facilitamos.
          </div>
        )}
      </section>

      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Objeto</h2>
        <p>
          Este aviso regula el acceso y el uso de valatino.es, una tienda online de
          alimentación y productos latinoamericanos con envío en España. Navegar por el
          sitio te atribuye la condición de usuario y supone aceptar estas condiciones.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Uso del sitio</h2>
        <p>
          Te comprometes a usar la tienda conforme a la ley y a no realizar actividades
          que puedan dañarla, sobrecargarla o impedir su uso normal por otras personas.
          Los datos que facilites al comprar deben ser veraces: son los que se usan para
          entregarte el pedido y para emitir tu factura.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Propiedad intelectual</h2>
        <p>
          Los textos, el diseño y la estructura del sitio son titularidad de Valatino. Las
          marcas, envases y fotografías de los productos pertenecen a sus respectivos
          fabricantes y se muestran únicamente para identificar los artículos a la venta.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Responsabilidad</h2>
        <p>
          Cuidamos que la información de los productos sea correcta, pero la composición y
          los alérgenos los define el fabricante y pueden cambiar sin previo aviso. Antes de
          consumir cualquier producto, revisa siempre el etiquetado del envase que recibas.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Resolución de litigios</h2>
        <p>
          Si tienes una reclamación, escríbenos primero: lo normal es que se resuelva ahí.
          Si no quedas conforme, la Comisión Europea ofrece una plataforma de resolución de
          litigios en línea en{" "}
          <a
            className="text-primary hover:underline"
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
          >
            ec.europa.eu/consumers/odr
          </a>
          .
        </p>

        <h2 className="text-lg font-semibold text-foreground">Ley aplicable</h2>
        <p>
          Estas condiciones se rigen por la legislación española. Como consumidor, conservas
          el derecho a acudir a los tribunales de tu domicilio.
        </p>
      </section>

      <nav className="flex flex-wrap gap-4 border-t pt-6 text-sm">
        <Link href="/contacto" className="text-primary hover:underline">
          Contacto
        </Link>
        <Link href="/terminos" className="text-primary hover:underline">
          Términos y condiciones
        </Link>
        <Link href="/politica-privacidad" className="text-primary hover:underline">
          Política de privacidad
        </Link>
      </nav>
    </main>
    </>
  );
}
