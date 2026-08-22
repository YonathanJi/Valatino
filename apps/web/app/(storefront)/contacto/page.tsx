import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import {
  getIdentidad,
  domicilioEnUnaLinea,
  enlaceWhatsapp,
  whatsappLegible,
} from "@lib/tienda/identidad";

/**
 * Cómo preguntar antes de comprar.
 *
 * ⚠️⚠️ POR QUÉ ESTA PÁGINA EXISTE, Y NO ES UN CAPRICHO DE DISEÑO: hasta el
 * 2026-08-22 la tienda no tenía NINGÚN canal de contacto accesible sin cuenta.
 * El único correo publicado —`soporte@valatino.es`, en la política de
 * privacidad— **no recibe nada**: el dominio no tiene registros MX, así que
 * cualquier solicitud de derechos del RGPD rebotaba. Y el único buzón que sí
 * funcionaba estaba dentro de `/cuenta/perfil`, o sea detrás del login: invisible
 * justo para quien todavía duda de si comprar.
 *
 * ⭐ POR ESO LOS CANALES SON UN DATO Y NO UNA CONSTANTE. Se editan en TI →
 * Ajustes y se pueden cambiar el mismo día que alguien detecte que uno no
 * contesta, sin desplegar. Ver la migración 081.
 *
 * ⚠️ Y por eso NO hay formulario de contacto: un formulario manda el mensaje a un
 * buzón, y el problema que se está arreglando es precisamente que el buzón no
 * existía. Enlaces directos a canales que el cliente puede comprobar de un
 * vistazo —su WhatsApp, su correo— fallan de forma visible en vez de en silencio.
 */
export const metadata = {
  title: "Contacto · Valatino",
  description:
    "Escríbenos por WhatsApp o por correo. Resolvemos dudas sobre productos, pedidos y devoluciones.",
  alternates: { canonical: "https://valatino.es/contacto" },
};

export const revalidate = 300;

export default async function ContactoPage() {
  const identidad = await getIdentidad();
  const domicilio = domicilioEnUnaLinea(identidad);
  const whatsapp = enlaceWhatsapp(identidad, "Hola, tengo una duda sobre un producto de Valatino.");

  return (
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Contacto</h1>
        <p className="text-muted-foreground leading-relaxed">
          Escríbenos con cualquier duda sobre un producto, un pedido en marcha o una
          devolución. Contestamos de lunes a viernes.
        </p>
      </header>

      {identidad.contactable ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">WhatsApp</span>
                <span className="block text-sm text-muted-foreground">
                  {whatsappLegible(identidad)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Lo más rápido: normalmente contestamos el mismo día.
                </span>
              </span>
            </a>
          )}

          {identidad.email && (
            <a
              href={`mailto:${identidad.email}`}
              className="flex items-start gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
            >
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">Correo</span>
                <span className="block break-all text-sm text-muted-foreground">
                  {identidad.email}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Para facturas, devoluciones y todo lo que deje constancia por escrito.
                </span>
              </span>
            </a>
          )}

          {identidad.telefono && (
            <a
              href={`tel:${identidad.telefono.replace(/\s/g, "")}`}
              className="flex items-start gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary"
            >
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">Teléfono</span>
                <span className="block text-sm text-muted-foreground">{identidad.telefono}</span>
              </span>
            </a>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Todavía no hay ningún canal de contacto configurado.
        </div>
      )}

      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Si ya has comprado</h2>
        <p>
          Ten a mano el <strong>número de pedido</strong>: sale en el correo de confirmación
          y empieza por la fecha de la compra. Con él localizamos tu pedido al momento.
        </p>
        <p>
          También puedes ver el estado de tus pedidos y descargar tus facturas entrando en{" "}
          <Link href="/cuenta/pedidos" className="text-primary hover:underline">
            tu cuenta
          </Link>
          . Se entra solo con el correo con el que compraste, sin contraseña.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Devoluciones</h2>
        <p>
          Tienes 14 días naturales desde que recibes el pedido para desistir de la compra.
          Escríbenos antes de enviar nada y te decimos cómo hacerlo. Las condiciones completas
          están en los{" "}
          <Link href="/terminos" className="text-primary hover:underline">
            términos y condiciones
          </Link>
          .
        </p>

        <h2 className="text-lg font-semibold text-foreground">Protección de datos</h2>
        <p>
          Para ejercer tus derechos de acceso, rectificación o supresión, escríbenos por
          cualquiera de los canales de arriba. Puedes consultar cómo tratamos tus datos en la{" "}
          <Link href="/politica-privacidad" className="text-primary hover:underline">
            política de privacidad
          </Link>
          .
        </p>
      </section>

      {identidad.identificada && domicilio && (
        <section className="border-t pt-6 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{identidad.nombre}</span> · NIF{" "}
            {identidad.nif}
          </p>
          <p>{domicilio}</p>
          {/**
           * ⚠️ Se dice explícitamente que no es una tienda física. Publicar un
           * domicilio sin aclararlo hace que alguien se plante en la puerta a
           * recoger un pedido, y eso es peor que no publicarlo — pero publicarlo
           * es obligatorio (art. 10 LSSI).
           */}
          <p className="mt-2 text-xs">
            Este es el domicilio fiscal del titular, no una tienda abierta al público: no se
            atienden visitas ni recogidas.
          </p>
          <Link href="/aviso-legal" className="mt-2 inline-block text-primary hover:underline">
            Aviso legal
          </Link>
        </section>
      )}
    </main>
  );
}
