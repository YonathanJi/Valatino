import { PEDIDO_ESTADOS, type PedidoEstado } from "@valatino/types";
import { renderInstruccionesTransferencia } from "./instrucciones-transferencia";
import { renderCambioEstado, COPIAS_ESTADO, type DatosEmailEstado } from "./estado-pedido";
import { renderConfirmacionPedido, type DatosEmailPedido, etiquetaMetodoPago } from "./confirmacion-pedido";

const datosEstado = (
  estado: PedidoEstado,
  extra: Partial<DatosEmailEstado> = {},
): DatosEmailEstado => ({
  pedidoId: "b46b60d3-c18c-4104-b28d-f161e70c7f6e",
  numeroPedido: "260725018055",
  email: "cliente@ejemplo.com",
  nombre: "Ana Pérez García",
  estado,
  items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
  total: 5,
  fecha: "20 de julio de 2026",
  ...extra,
});

const datosPedido = (extra: Partial<DatosEmailPedido> = {}): DatosEmailPedido => ({
  pedidoId: "b46b60d3-c18c-4104-b28d-f161e70c7f6e",
  numeroPedido: "260725018055",
  email: "cliente@ejemplo.com",
  items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
  total: 50,
  metodoPago: "stripe",
  direccionEnvio: null,
  estado: "PROCESANDO",
  fecha: "20 de julio de 2026",
  ...extra,
});

/**
 * ⚠️⚠️ EL ENVÍO EN EL RECIBO DEL CLIENTE (migración 080).
 *
 * Este es el sitio donde el porte se puede perder sin que salte nada: las líneas
 * suman los artículos y el «Total» lleva el envío dentro. Si no se pinta la línea
 * del envío, el cliente recibe un correo que dice 5,00 € en producto y 9,95 € de
 * total, sin nada que explique la diferencia — y es el primer papel que mira
 * cuando algo no le cuadra.
 */
describe("el envío en la confirmación del pedido", () => {
  /**
   * ⚠️ La aguja es la CELDA, no la palabra. Un `toContain("Envío")` a secas pasa
   * siempre: la plantilla ya dice «Dirección de envío» más abajo. Se comprobó —
   * los tres tests de ausencia salieron rojos con el código correcto. Buscar la
   * celda es lo que distingue la línea de importe de cualquier otro rótulo.
   */
  const CELDA_ENVIO = ">Envío</td>";

  it("pinta la línea del envío cuando se cobró", () => {
    const html = renderConfirmacionPedido(datosPedido({ costeEnvio: 4.95, total: 9.95 }));
    expect(html).toContain(CELDA_ENVIO);
    expect(html).toContain("4,95");
    expect(html).toContain("9,95");
  });

  it("no enseña «Envío 0,00 €» cuando el envío fue gratis", () => {
    const html = renderConfirmacionPedido(datosPedido({ costeEnvio: 0, total: 5 }));
    expect(html).not.toContain(CELDA_ENVIO);
  });

  /** Los pedidos anteriores a la 080 no traen el campo. No se inventa una línea. */
  it("sin el campo se comporta como si no hubiera envío", () => {
    const html = renderConfirmacionPedido(datosPedido({ total: 5 }));
    expect(html).not.toContain(CELDA_ENVIO);
  });

  it("un coste_envio nulo tampoco pinta línea", () => {
    const html = renderConfirmacionPedido(datosPedido({ costeEnvio: null, total: 5 }));
    expect(html).not.toContain(CELDA_ENVIO);
  });

  /**
   * El reembolso reutiliza la misma plantilla, y ahí también tiene que cuadrar:
   * al devolver el pedido entero se devuelve el porte (art. 107 RDL 1/2007), así
   * que el importe devuelto incluye el envío y el desglose tiene que enseñarlo.
   */
  it("en un reembolso total el desglose sigue enseñando el envío", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ costeEnvio: 4.95, total: 9.95, esReembolso: true, importeReembolsado: 9.95 }),
    );
    expect(html).toContain(CELDA_ENVIO);
    expect(html).toContain("4,95");
  });
});

describe("renderCambioEstado", () => {
  it("no genera correo para los estados que avisa otro camino", () => {
    // PENDIENTE_PAGO es el estado inicial (nadie transiciona hacia él) y
    // REEMBOLSADO lo avisa el email de reembolso, que sí dice el importe.
    expect(renderCambioEstado(datosEstado("PENDIENTE_PAGO"))).toBeNull();
    expect(renderCambioEstado(datosEstado("REEMBOLSADO"))).toBeNull();
  });

  it("avisa de los estados de seguimiento del pedido", () => {
    for (const estado of ["PROCESANDO", "ENVIADO", "ENTREGADO", "CANCELADO"] as const) {
      expect(renderCambioEstado(datosEstado(estado))).not.toBeNull();
    }
  });

  it("el asunto y el cuerpo llevan el número de pedido", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO"))!;

    expect(r.asunto).toContain("260725018055");
    expect(r.html).toContain("260725018055");
  });

  it("saluda solo con el nombre de pila", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO"))!;

    expect(r.html).toContain("Hola Ana:");
    expect(r.html).not.toContain("Ana Pérez García");
  });

  it("sin nombre no deja un saludo a medias", () => {
    const r = renderCambioEstado(datosEstado("ENVIADO", { nombre: null }))!;

    expect(r.html).not.toContain("Hola ");
  });

  /** El nombre del producto lo escribe quien carga el catálogo. */
  it("escapa el HTML de los nombres de producto", () => {
    const r = renderCambioEstado(
      datosEstado("ENVIADO", {
        items: [
          { nombre_producto: '<script>alert("x")</script>', cantidad: 1, precio_unitario: 1 },
        ],
      }),
    )!;

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("todo estado con texto definido existe en la máquina de estados", () => {
    for (const estado of Object.keys(COPIAS_ESTADO)) {
      expect(PEDIDO_ESTADOS).toContain(estado as PedidoEstado);
    }
  });
});

describe("renderConfirmacionPedido — reembolsos", () => {
  it("un reembolso parcial dice cuánto se devolvió y que el resto sigue", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ esReembolso: true, importeReembolsado: 10 }),
    );

    expect(html).toContain("REEMBOLSO PARCIAL");
    expect(html).toContain("sigue su curso");
    // 10 € devueltos sobre 50 € de total: deben verse ambas cifras
    expect(html).toMatch(/10,00\s?€/);
    expect(html).toMatch(/50,00\s?€/);
  });

  it("un reembolso total no se anuncia como parcial", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ esReembolso: true, importeReembolsado: 50 }),
    );

    expect(html).toContain("importe completo");
    expect(html).not.toContain("REEMBOLSO PARCIAL");
  });

  it("sin importe explícito se asume el total (compatibilidad con el webhook)", () => {
    const html = renderConfirmacionPedido(datosPedido({ esReembolso: true }));

    expect(html).not.toContain("REEMBOLSO PARCIAL");
  });

  it("la confirmación de compra no menciona reembolsos", () => {
    const html = renderConfirmacionPedido(datosPedido());

    expect(html).toContain("PAGADO");
    expect(html.toLowerCase()).not.toContain("reembols");
  });
});

/**
 * Reportado por Jonathan: pagó con Bizum y el correo decía «Tarjeta (Stripe)».
 * Ni fue una tarjeta ni Stripe es una forma de pagar.
 */
describe("etiquetaMetodoPago", () => {
  it("dice Bizum cuando se pagó con Bizum", () => {
    expect(etiquetaMetodoPago("stripe", "bizum")).toBe("Bizum");
  });

  it("dice Tarjeta cuando se pagó con tarjeta, sin nombrar la pasarela", () => {
    expect(etiquetaMetodoPago("stripe", "card")).toBe("Tarjeta");
  });

  /** Los pedidos anteriores a la 048 no tienen detalle guardado. */
  it("sin detalle cae a la pasarela, y nunca a «Stripe»", () => {
    expect(etiquetaMetodoPago("stripe", null)).toBe("Tarjeta");
    expect(etiquetaMetodoPago("paypal")).toBe("PayPal");
    expect(etiquetaMetodoPago("transferencia")).toBe("Transferencia bancaria");
  });

  /**
   * Si mañana se activa otro método en Stripe, el correo dirá algo escueto pero
   * cierto en vez de algo pulido y falso. Es justo el fallo que se está
   * arreglando: caer en «Tarjeta» por defecto es lo que hizo mentir al correo.
   */
  it("un método desconocido se muestra tal cual, no como Tarjeta", () => {
    expect(etiquetaMetodoPago("stripe", "klarna")).toBe("Klarna");
    expect(etiquetaMetodoPago("stripe", "apple_pay")).toBe("Apple Pay");
    expect(etiquetaMetodoPago("stripe", "metodo_nuevo")).toBe("Metodo nuevo");
  });

  it("el correo de un pago con Bizum no menciona Stripe ni tarjeta", () => {
    const html = renderConfirmacionPedido(datosPedido({ metodoDetalle: "bizum" }));

    expect(html).toContain("Bizum");
    expect(html).not.toMatch(/Tarjeta \(Stripe\)/);
  });
});

/**
 * Es el único correo de la tienda que el cliente necesita PARA ACTUAR: los
 * demás cuentan algo que ya pasó. Quien cierra la pestaña del checkout se queda
 * sin el IBAN y sin el concepto, y sin esto no puede pagar lo que ha reservado.
 */
describe("instrucciones de transferencia", () => {
  const datos = {
    pedidoId: "b46b60d3-c18c-4104-b28d-f161e70c7f6e",
    numeroPedido: "260802031234",
    email: "cliente@ejemplo.com",
    importe: 12.5,
    iban: "ES33 9490 0934 2392 2994 3748",
    titular: "Valentino Jimenez Mendoza",
    banco: "BBVA",
    concepto: "260802031234",
    venceEl: "2026-08-05T21:59:59Z",
  };

  it("lleva todo lo que hace falta para hacer la transferencia", () => {
    const html = renderInstruccionesTransferencia(datos);

    expect(html).toContain("ES33 9490 0934 2392 2994 3748");
    expect(html).toContain("Valentino Jimenez Mendoza");
    expect(html).toContain("BBVA");
    expect(html).toMatch(/12,50\s*€/);
  });

  /**
   * El concepto es lo único que permite casar el ingreso con el pedido: una
   * transferencia sin él llega al banco como un apunte anónimo. Por eso va dos
   * veces, una en la tabla de datos y otra en el aviso destacado.
   */
  it("repite el concepto para que no se pase por alto", () => {
    const html = renderInstruccionesTransferencia(datos);
    const veces = html.split("260802031234").length - 1;

    expect(veces).toBeGreaterThanOrEqual(3); // nº de pedido + concepto + aviso
    expect(html).toContain("No olvides el concepto");
  });

  it("dice hasta cuándo se guarda el pedido, en cristiano", () => {
    const html = renderInstruccionesTransferencia(datos);

    expect(html).toMatch(/5 de agosto de 2026/);
  });

  it("sin banco configurado no deja una fila vacía", () => {
    const html = renderInstruccionesTransferencia({ ...datos, banco: null });

    expect(html).not.toContain("Banco");
  });

  /** Un titular con `<` no puede romper la maquetación del correo. */
  it("escapa los datos de la cuenta", () => {
    const html = renderInstruccionesTransferencia({ ...datos, titular: 'Ana <b>"X"' });

    expect(html).toContain("Ana &lt;b&gt;&quot;X&quot;");
    expect(html).not.toContain("Ana <b>");
  });
});

/**
 * ⚠️⚠️ EL DESCUENTO EN EL RECIBO DEL CLIENTE (migración 083, pintado en la 084).
 *
 * Es el mismo agujero que el del envío de arriba, y se abrió otra vez cuando salió
 * la 083 — con el comentario del envío tres líneas más arriba explicando por qué no
 * se podía hacer eso. La diferencia es el signo, y hace que este se lea peor: al del
 * envío le faltaba un CARGO, y a este le falta un ABONO. El cliente ve que le cobran
 * de menos y no sabe por qué, y el descuento que le convenció de comprar no aparece
 * en su recibo.
 *
 * El caso real, medido contra producción: pedido 260824015658, con el código
 * VALENTINO al 20 %.
 *
 *     2 × Jugo Hit Mora   2,40   ← PVP
 *     1 × Pony Malta      1,50   ← PVP
 *     Envío               3,40
 *                        -----
 *     suma de lo escrito  7,30
 *     Total               6,52   ← el cobrado, con el descuento dentro
 *
 * 0,78 € de aire. Eso es lo que fijan estos tests.
 */
describe("el descuento en el recibo del cliente", () => {
  /**
   * ⚠️ La aguja es la CELDA y el SIGNO, no la palabra, por lo mismo que el envío:
   * «Descuento» a secas podría aparecer en cualquier rótulo futuro, y el importe sin
   * el «−» delante no distingue un abono de un cargo. Los cuatro tests de ausencia
   * se vieron ROJOS antes de escribir la plantilla.
   */
  const CELDA_DESCUENTO = ">Descuento";
  const CELDA_SUBTOTAL = ">Subtotal</td>";

  const conDescuento = () =>
    datosPedido({
      items: [
        { nombre_producto: "Jugo Hit Mora", cantidad: 2, precio_unitario: 1.2 },
        { nombre_producto: "Pony Malta", cantidad: 1, precio_unitario: 1.5 },
      ],
      costeEnvio: 3.4,
      descuento: 0.78,
      descuentoCodigo: "VALENTINO",
      total: 6.52,
    });

  it("pinta el descuento con su signo y su código", () => {
    const html = renderConfirmacionPedido(conDescuento());

    expect(html).toContain(CELDA_DESCUENTO);
    expect(html).toContain("VALENTINO");
    expect(html).toContain("−0,78");
  });

  /**
   * ⭐ ESTE ES EL TEST QUE IMPORTA, y no comprueba una fila: comprueba que el recibo
   * SUMA. Con las cuatro cifras escritas, subtotal − descuento + envío tiene que dar
   * el total. Si alguien vuelve a quitar una de las filas, esto se pone rojo aunque
   * la plantilla siga siendo válida y bonita.
   */
  it("lo escrito cuadra con el total cobrado", () => {
    const html = renderConfirmacionPedido(conDescuento());

    // Se leen del HTML, no de los datos de entrada: un test que compruebe la
    // aritmética sobre sus propias variables no comprueba la plantilla.
    expect(html).toContain(CELDA_SUBTOTAL);
    expect(html).toContain("3,90"); // subtotal a PVP: 2×1,20 + 1,50
    expect(html).toContain("−0,78"); // el abono
    expect(html).toContain("3,40"); // el porte
    expect(html).toContain("6,52"); // y el total: 3,90 − 0,78 + 3,40

    // La cuenta, hecha aquí para que quede escrita y no haya que fiarse del ojo.
    expect(Math.round((3.9 - 0.78 + 3.4) * 100) / 100).toBe(6.52);
  });

  /**
   * El subtotal solo cuando hay descuento: sin él repetiría el número que las
   * líneas ya suman, y una fila que dice lo mismo dos veces estorba.
   */
  it("sin descuento no aparece ni la fila del descuento ni la del subtotal", () => {
    const html = renderConfirmacionPedido(datosPedido({ costeEnvio: 3.4, total: 8.4 }));

    expect(html).not.toContain(CELDA_DESCUENTO);
    expect(html).not.toContain(CELDA_SUBTOTAL);
  });

  it("un descuento a cero no pinta nada", () => {
    const html = renderConfirmacionPedido(datosPedido({ descuento: 0, total: 5 }));

    expect(html).not.toContain(CELDA_DESCUENTO);
  });

  /** Los pedidos anteriores a la 083 no traen el campo. No se inventa una fila. */
  it("un descuento nulo tampoco", () => {
    const html = renderConfirmacionPedido(datosPedido({ descuento: null, total: 5 }));

    expect(html).not.toContain(CELDA_DESCUENTO);
  });

  /** Sin código, el abono se sigue pintando: es peor callarlo que no poder nombrarlo. */
  it("sin código pinta el descuento igual", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ descuento: 1, descuentoCodigo: null, total: 4 }),
    );

    expect(html).toContain(CELDA_DESCUENTO);
    expect(html).toContain("−1,00");
  });

  /** Un código con `<` no puede romper la maquetación ni inyectar nada. */
  it("escapa el código del descuento", () => {
    const html = renderConfirmacionPedido(
      datosPedido({ descuento: 1, descuentoCodigo: '<b>"X"', total: 4 }),
    );

    expect(html).toContain("&lt;b&gt;&quot;X&quot;");
    expect(html).not.toContain("<b>&quot;X");
  });

  /**
   * El de reembolso reutiliza esta plantilla, y es el que se lee con la calculadora
   * en la mano para comprobar si lo devuelto es lo que toca.
   */
  it("en el correo de reembolso el desglose también cuadra", () => {
    const html = renderConfirmacionPedido({
      ...conDescuento(),
      esReembolso: true,
      importeReembolsado: 6.52,
    });

    expect(html).toContain(CELDA_DESCUENTO);
    expect(html).toContain("−0,78");
    expect(html).toContain("3,40");
  });

  /**
   * ⚠️ Y EL CORREO DEL CAMBIO DE ESTADO, que es el que más se abre —«tu pedido va de
   * camino»— y el que peor estaba: no es que la llamada se olvidara de pasar las
   * cifras, es que la plantilla NO TENÍA los campos, así que no había forma.
   */
  it("el correo del cambio de estado enseña las dos cifras", () => {
    const html = renderCambioEstado(
      datosEstado("ENVIADO", {
        items: [
          { nombre_producto: "Jugo Hit Mora", cantidad: 2, precio_unitario: 1.2 },
          { nombre_producto: "Pony Malta", cantidad: 1, precio_unitario: 1.5 },
        ],
        costeEnvio: 3.4,
        descuento: 0.78,
        descuentoCodigo: "VALENTINO",
        total: 6.52,
      }),
    );

    expect(html).not.toBeNull();
    expect(html!.html).toContain(CELDA_DESCUENTO);
    expect(html!.html).toContain("−0,78");
    expect(html!.html).toContain("3,40");
    expect(html!.html).toContain("6,52");
  });

  it("y sin descuento ni envío sigue saliendo como antes de la 084", () => {
    const html = renderCambioEstado(datosEstado("ENVIADO"));

    expect(html).not.toBeNull();
    expect(html!.html).not.toContain(CELDA_DESCUENTO);
    expect(html!.html).not.toContain(CELDA_SUBTOTAL);
  });
});
