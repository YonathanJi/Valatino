import Link from "next/link";

/**
 * Términos y condiciones de venta.
 *
 * ⚠️⚠️ LO QUE SE ARREGLA AQUÍ NO ES EL FORMATO, ES QUE EL TEXTO ANTERIOR ERA
 * FALSO. Decía tres cosas que la tienda ya no cumplía:
 *
 *   · «Aceptamos tarjeta (Stripe) y PayPal» — faltaban Bizum y la transferencia
 *     bancaria, que están vivas. Quien buscaba si podía pagar por transferencia
 *     leía que no.
 *   · No mencionaba los gastos de envío, que desde el 22/08 se cobran.
 *   · Terminaba con «Este texto es provisional y será revisado por asesoría legal
 *     antes del lanzamiento», impreso en la página donde el cliente entra
 *     precisamente a comprobar que la tienda es seria. Se ha quitado: un aviso
 *     así no protege de nada y espanta a quien lo lee.
 *
 * ⚠️ EL ÁMBITO DE ENVÍO ES UNA DECISIÓN PENDIENTE Y AQUÍ SE TOMA LA PRUDENTE.
 * El texto limita la oferta a península y Baleares, que es lo que decía el
 * original. Pero **el checkout acepta hoy las 52 provincias**, incluidas Canarias,
 * Ceuta y Melilla — que están FUERA del ámbito del IVA (IGIC/IPSI) y donde una
 * venta no debe llevar IVA español. Mientras eso no se resuelva, hay que
 * restringir los códigos postales en el checkout para que coincida con lo que
 * aquí se promete. Está anotado en ESTADO.md.
 *
 * ── LO QUE DEBERÍA REVISAR UNA GESTORÍA ──────────────────────────────────────
 * · Las excepciones al derecho de desistimiento en alimentación: el art. 103.d)
 *   del RDL 1/2007 excluye los bienes que puedan deteriorarse o caducar con
 *   rapidez, y aquí se ha redactado de forma conservadora (se acepta salvo
 *   perecederos y envases abiertos). Conviene que confirmen el alcance exacto.
 * · Si hace falta ofrecer el formulario de desistimiento del anexo A del RDL
 *   1/2007 como documento descargable, además de poder pedirlo por escrito.
 * · Quién asume el coste de la devolución: aquí se dice que el cliente, que es lo
 *   habitual y lo que permite el art. 108.1, pero tiene que estar informado ANTES
 *   de comprar para poder cobrárselo.
 * · Garantía legal de conformidad en productos de alimentación.
 */
export const metadata = {
  title: "Términos y condiciones",
  description:
    "Condiciones de compra en Valatino: precios, pagos, envíos, plazos de entrega y derecho de desistimiento.",
  alternates: { canonical: "https://valatino.es/terminos" },
};

export default function TerminosPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-3xl font-bold">Términos y condiciones</h1>
      <p className="text-muted-foreground leading-relaxed">
        Estas condiciones regulan la compra de productos en Valatino, tienda online de
        alimentación y productos latinoamericanos con envío en España. Al completar un
        pedido las aceptas. Puedes ver quién vende en el{" "}
        <Link href="/aviso-legal" className="text-primary hover:underline">
          aviso legal
        </Link>
        .
      </p>

      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Precios</h2>
        <p>
          Todos los precios que ves incluyen el IVA aplicable a cada producto. Los gastos de
          envío se calculan y se muestran en el carrito antes de pagar, y aparecen desglosados
          en la factura. El importe final que se cobra es siempre el que figura en el resumen
          del pedido.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Disponibilidad y reserva</h2>
        <p>
          Al iniciar el pago, las unidades de tu carrito quedan reservadas durante 15 minutos.
          Pasado ese tiempo la reserva se libera y las unidades vuelven a estar disponibles
          para otras personas.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Formas de pago</h2>
        <p>
          Puedes pagar con <strong>tarjeta o Bizum</strong> (procesado por Stripe), con{" "}
          <strong>PayPal</strong> o por <strong>transferencia bancaria</strong>. En tarjeta,
          Bizum y PayPal el pedido se confirma cuando la pasarela verifica la operación. En
          transferencia, el pedido queda reservado y se confirma cuando comprobamos el ingreso;
          si no llega en el plazo indicado, el pedido se cancela y las unidades se liberan.
        </p>
        <p>
          Valatino no accede ni almacena en ningún momento los datos de tu tarjeta.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Envíos</h2>
        <p>
          Enviamos a España peninsular y Baleares. Los gastos de envío y, si lo hay, el importe
          a partir del cual el envío es gratuito, se muestran en el carrito antes de pagar.
        </p>
        <p>
          Preparamos los pedidos de lunes a viernes. Te avisamos por correo cuando el pedido
          sale hacia tu dirección.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Facturación</h2>
        <p>
          Cada compra genera su factura. Si necesitas una factura completa a nombre de una
          empresa o con tus datos fiscales, pídenosla por{" "}
          <Link href="/contacto" className="text-primary hover:underline">
            cualquiera de nuestros canales
          </Link>{" "}
          indicando el número de pedido.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Derecho de desistimiento</h2>
        <p>
          Como consumidor tienes <strong>14 días naturales</strong> desde que recibes el pedido
          para desistir de la compra sin necesidad de justificarlo, conforme al Real Decreto
          Legislativo 1/2007. Para ejercerlo, escríbenos indicando tu número de pedido y qué
          artículos quieres devolver.
        </p>
        <p>
          Por tratarse de productos de alimentación, quedan excluidos los artículos
          perecederos y aquellos cuyo envase haya sido abierto una vez entregados, por razones
          de higiene y seguridad alimentaria.
        </p>
        <p>
          Los artículos deben devolverse en su estado original. El coste de la devolución
          corre a tu cargo, salvo que el producto llegara defectuoso o equivocado, en cuyo caso
          lo asumimos nosotros. Una vez recibida y comprobada la devolución, te reembolsamos por
          el mismo medio con el que pagaste. Si desistes del pedido completo, el reembolso
          incluye también los gastos de envío que pagaste.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Productos defectuosos</h2>
        <p>
          Si un producto llega dañado, caducado o no es el que pediste, avísanos en cuanto lo
          veas y con una foto si es posible. Lo reponemos o te devolvemos el importe, incluidos
          los gastos de envío, sin coste para ti.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Alérgenos e información del producto</h2>
        <p>
          La composición, los alérgenos y las fechas de consumo las define cada fabricante y
          pueden cambiar sin aviso. La información de la web es orientativa: antes de consumir
          cualquier producto, revisa siempre el etiquetado del envase que recibas.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Reclamaciones</h2>
        <p>
          Escríbenos por{" "}
          <Link href="/contacto" className="text-primary hover:underline">
            cualquiera de nuestros canales
          </Link>{" "}
          y lo resolvemos. Si no quedas conforme, puedes acudir a la plataforma europea de
          resolución de litigios en línea en{" "}
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
      </section>

      <p className="border-t pt-6 text-xs text-muted-foreground">
        Última actualización: agosto de 2026.
      </p>
    </main>
  );
}
