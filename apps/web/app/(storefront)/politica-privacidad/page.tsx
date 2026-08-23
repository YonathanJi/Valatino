import Link from "next/link";
import { getIdentidad, domicilioEnUnaLinea } from "@lib/tienda/identidad";
import { HuellaDiagnostico } from "@components/storefront/HuellaDiagnostico";

/**
 * Política de privacidad — RGPD (UE 2016/679) y LOPDGDD (3/2018).
 *
 * ⚠️⚠️ LO MÁS GRAVE QUE SE ARREGLA AQUÍ NO ES LO QUE FALTABA, ES QUE EL ÚNICO
 * CANAL QUE SE DABA NO EXISTÍA. El texto anterior mandaba ejercer los derechos
 * del RGPD escribiendo a `soporte@valatino.es`, y **valatino.es no tiene
 * registros MX**: ese buzón no recibe nada, así que toda solicitud de acceso o
 * supresión rebotaba. Una obligación legal enrutada a la nada, invisible porque
 * nadie prueba el correo entrante.
 *
 * ⭐ Por eso el contacto ya NO está escrito en esta página: sale de
 * `ajustes_tienda` (migración 081) y se cambia desde el panel el mismo día que
 * alguien detecte que un canal no contesta, sin desplegar.
 *
 * ⚠️ También se quita el «este texto es provisional… antes del lanzamiento», que
 * estaba impreso justo donde el cliente entra a decidir si se fía.
 *
 * ── LO QUE DEBERÍA REVISAR UNA GESTORÍA / DPD ────────────────────────────────
 * · Los plazos de conservación: aquí se dice «mientras exista la relación y
 *   después el plazo legal», y las facturas se conservan por el art. 30 del
 *   Código de Comercio y la LGT. Conviene fijar años concretos.
 * · Si procede designar Delegado de Protección de Datos (probablemente no, por
 *   volumen y por no tratar categorías especiales, pero que lo confirmen).
 * · Las transferencias internacionales: Stripe, PayPal y SendGrid tratan datos
 *   fuera del EEE amparados en cláusulas contractuales tipo. Hay que verificar
 *   que los contratos de encargado están firmados con los tres.
 * · Si el registro de actividades de tratamiento del art. 30.5 RGPD es exigible
 *   aquí (menos de 250 empleados, pero el tratamiento no es ocasional).
 */
export const metadata = {
  title: "Política de privacidad · Valatino",
  description:
    "Qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos.",
  alternates: { canonical: "https://valatino.es/politica-privacidad" },
};

export const revalidate = 300;

export default async function PoliticaPrivacidadPage() {
  const identidad = await getIdentidad();
  const domicilio = domicilioEnUnaLinea(identidad);

  return (
    <>
      {/* Ver la cabecera de `HuellaDiagnostico`: el commit desplegado y, si la
          identidad no se pudo traer, el motivo. Dos sesiones se perdieron por no
          tener ni una cosa ni la otra. */}
      <HuellaDiagnostico fallo={identidad.fallo} />
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-3xl font-bold">Política de privacidad</h1>
      <p className="text-muted-foreground leading-relaxed">
        Tratamos tus datos personales para gestionar tu compra, entregarte el pedido, emitir
        tu factura y atenderte si algo va mal. Nada más.
      </p>

      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Quién es el responsable</h2>
        {identidad.identificada ? (
          <p>
            <strong className="text-foreground">{identidad.nombre}</strong>, con NIF{" "}
            {identidad.nif}
            {domicilio ? ` y domicilio en ${domicilio}` : ""}, titular de valatino.es. Puedes ver
            todos los datos identificativos en el{" "}
            <Link href="/aviso-legal" className="text-primary hover:underline">
              aviso legal
            </Link>
            .
          </p>
        ) : (
          <p>
            El titular de valatino.es. Consulta el{" "}
            <Link href="/aviso-legal" className="text-primary hover:underline">
              aviso legal
            </Link>{" "}
            para los datos identificativos.
          </p>
        )}

        <h2 className="text-lg font-semibold text-foreground">Qué datos tratamos y por qué</h2>
        <p>
          <strong className="text-foreground">Para gestionar tu pedido:</strong> tu correo
          electrónico, la dirección de envío, un teléfono de contacto para la entrega y el
          detalle de lo que compras. La base legal es la ejecución del contrato de compraventa
          (art. 6.1.b RGPD).
        </p>
        <p>
          <strong className="text-foreground">Para facturar:</strong> tu documento de identidad
          cuando pides factura completa, y los datos fiscales que nos indiques. La base legal es
          el cumplimiento de una obligación legal (art. 6.1.c RGPD): la normativa de facturación
          nos obliga a emitir y conservar estos documentos.
        </p>
        <p>
          <strong className="text-foreground">Para acceder a tu cuenta:</strong> tu correo
          electrónico, al que enviamos un código de un solo uso. No guardamos contraseñas porque
          no las usamos.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Pagos</h2>
        <p>
          Los pagos con tarjeta y Bizum los procesa Stripe, y los de PayPal, PayPal. Los datos
          de tu tarjeta se introducen directamente en sus sistemas:{" "}
          <strong className="text-foreground">
            Valatino no los ve, no los recibe y no los almacena en ningún momento
          </strong>
          . De un pago solo conservamos la referencia de la operación y su importe, para poder
          identificarlo si hay una incidencia o una devolución.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Con quién los compartimos</h2>
        <p>
          Solo con quien hace falta para que recibas tu pedido, y siempre como encargados del
          tratamiento: la pasarela de pago (Stripe o PayPal), el proveedor de correo con el que
          te enviamos las confirmaciones y facturas, el proveedor de alojamiento de la tienda y
          la base de datos, y la empresa de transporte que te entrega el paquete. No vendemos ni
          cedemos tus datos a nadie más, ni los usamos para publicidad de terceros.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Cuánto tiempo los guardamos</h2>
        <p>
          Los datos de tu cuenta, mientras la mantengas abierta. Los de tus pedidos y facturas,
          durante los plazos que exige la normativa mercantil y fiscal, aunque cierres la
          cuenta: son documentos contables y no podemos borrarlos antes.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Tus derechos</h2>
        <p>
          Puedes pedirnos acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a
          su tratamiento y solicitar su portabilidad. Escríbenos por{" "}
          <Link href="/contacto" className="text-primary hover:underline">
            cualquiera de nuestros canales de contacto
          </Link>{" "}
          indicando qué derecho quieres ejercer. Te contestamos en el plazo máximo de un mes.
        </p>
        <p>
          Si consideras que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia
          Española de Protección de Datos en{" "}
          <a
            className="text-primary hover:underline"
            href="https://www.aepd.es"
            target="_blank"
            rel="noopener noreferrer"
          >
            aepd.es
          </a>
          .
        </p>

        {/**
         * ⚠️⚠️ ESTE PÁRRAFO ES VERDAD HOY Y DEJA DE SERLO EN CUANTO SE PONGA
         * ANALÍTICA. Comprobado el 2026-08-22: cero rastreadores en la web (ni
         * gtag, ni GTM, ni Plausible, ni Vercel Analytics), así que decir que no
         * se piden cookies de análisis es exacto y es además una ventaja que
         * conviene contar.
         *
         * El día que se añada la primera herramienta de medición hay que hacer
         * DOS cosas, y son inseparables: reescribir esto y montar el banner de
         * consentimiento previo. Poner el rastreador sin el banner es la
         * infracción del art. 22.2 de la LSSI, y además dejaría esta página
         * mintiendo — que es justo el problema que esta reescritura viene a
         * arreglar. Está anotado en ESTADO.md.
         */}
        <h2 className="text-lg font-semibold text-foreground">Cookies</h2>
        <p>
          Esta tienda usa únicamente las cookies necesarias para que funcione: mantener tu
          carrito y tu sesión iniciada. No usamos cookies de publicidad ni de análisis de
          terceros, y por eso no te pedimos consentimiento para ellas.
        </p>
      </section>

      <p className="border-t pt-6 text-xs text-muted-foreground">
        Última actualización: agosto de 2026.
      </p>
    </main>
    </>
  );
}
