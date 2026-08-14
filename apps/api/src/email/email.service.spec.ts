import { EmailService } from "./email.service";
import { EventosPedidoService } from "./../eventos/eventos-pedido.service";

interface EventoAnotado {
  pedidoId: string;
  tipo: string;
  detalle?: string | null;
}

/**
 * El servicio construye su transporter en el constructor a partir del entorno.
 * Se le inyecta uno falso después para poder decidir si el envío sale bien.
 */
function montar(opciones: { envioFalla?: boolean; sinSmtp?: boolean } = {}) {
  const anotados: EventoAnotado[] = [];
  const eventos = {
    registrar: async (e: EventoAnotado) => {
      anotados.push(e);
    },
  } as unknown as EventosPedidoService;

  const servicio = new EmailService(eventos);

  const transporter = opciones.sinSmtp
    ? null
    : {
        sendMail: async () => {
          if (opciones.envioFalla) throw new Error("SMTP caído");
          return { messageId: "1" };
        },
      };

  // El transporter es privado y de solo lectura; en la prueba se sustituye.
  Object.defineProperty(servicio, "transporter", { value: transporter, writable: true });

  return { servicio, anotados };
}

const datosPedido = {
  pedidoId: "ped-1",
  numeroPedido: "260726010001",
  email: "cliente@ejemplo.com",
  nombre: "Ana Pérez",
  items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
  total: 5,
  metodoPago: "stripe" as const,
  direccionEnvio: {
    nombre_destinatario: "Ana Pérez",
    linea1: "Calle Falsa 1",
    linea2: null,
    ciudad: "Madrid",
    codigo_postal: "28001",
    provincia: "Madrid",
    pais: "ES",
  },
  estado: "PROCESANDO",
  fecha: "26 de julio de 2026",
};

describe("EmailService — anotación en el historial del pedido", () => {
  it("anota el correo de confirmación con su asunto", async () => {
    const { servicio, anotados } = montar();

    await servicio.enviarConfirmacionPedido(datosPedido as never);

    expect(anotados).toEqual([
      {
        pedidoId: "ped-1",
        tipo: "email",
        detalle: "Confirmación de tu pedido #260726010001",
        origen: "sistema",
      },
    ]);
  });

  it("anota el aviso de cambio de estado", async () => {
    const { servicio, anotados } = montar();

    await servicio.enviarCambioEstado({ ...datosPedido, estado: "ENVIADO" } as never);

    expect(anotados).toHaveLength(1);
    expect(anotados[0]).toMatchObject({ tipo: "email", pedidoId: "ped-1" });
  });

  /**
   * Anunciar en el historial un correo que nunca llegó es peor que no anotarlo:
   * nadie iría a comprobar por qué el cliente no lo recibió.
   */
  it("NO anota nada si el envío falla", async () => {
    const { servicio, anotados } = montar({ envioFalla: true });

    await servicio.enviarConfirmacionPedido(datosPedido as never);

    expect(anotados).toHaveLength(0);
  });

  it("NO anota nada si no hay SMTP configurado", async () => {
    const { servicio, anotados } = montar({ sinSmtp: true });

    await servicio.enviarConfirmacionPedido(datosPedido as never);

    expect(anotados).toHaveLength(0);
  });

  it("un estado sin texto definido no envía ni anota", async () => {
    const { servicio, anotados } = montar();

    await servicio.enviarCambioEstado({ ...datosPedido, estado: "PENDIENTE_PAGO" } as never);

    expect(anotados).toHaveLength(0);
  });
});

/**
 * El correo de la factura, que se comporta distinto de todos los demás a
 * propósito. Ver el comentario de `enviarFactura`.
 */
describe("EmailService — la factura al cliente", () => {
  const datosFactura = {
    email: "cliente@ejemplo.com",
    numero: "VALF202600100",
    tipo: "completa" as const,
    total: 3.02,
    numeroPedido: "260814015565",
    pedidoId: "ped-1",
    actorId: "usuario-7",
    pdf: Buffer.from("%PDF-falso"),
    nombreArchivo: "VALF202600100.pdf",
  };

  it("adjunta el PDF con su tipo MIME y su nombre", async () => {
    const { servicio } = montar();
    const enviados: Array<Record<string, unknown>> = [];
    Object.defineProperty(servicio, "transporter", {
      value: {
        sendMail: async (m: Record<string, unknown>) => {
          enviados.push(m);
          return { messageId: "1" };
        },
      },
      writable: true,
    });

    await servicio.enviarFactura(datosFactura);

    const adjuntos = enviados[0]!["attachments"] as Array<Record<string, unknown>>;
    expect(adjuntos).toHaveLength(1);
    expect(adjuntos[0]).toMatchObject({
      filename: "VALF202600100.pdf",
      // Sin esto, algunos clientes se guían por la extensión y el móvil ofrece
      // «descargar» en vez de abrir.
      contentType: "application/pdf",
    });
  });

  it("el número va en el asunto, que es como se busca una factura años después", async () => {
    const { servicio } = montar();
    const enviados: Array<Record<string, unknown>> = [];
    Object.defineProperty(servicio, "transporter", {
      value: {
        sendMail: async (m: Record<string, unknown>) => {
          enviados.push(m);
          return { messageId: "1" };
        },
      },
      writable: true,
    });

    await servicio.enviarFactura(datosFactura);

    expect(enviados[0]!["subject"]).toContain("VALF202600100");
  });

  /**
   * ⚠️⚠️ ESTE TEST CUBRE UN HUECO QUE SE DEJÓ Y QUE ERA INVISIBLE: la primera
   * versión anotaba el envío en `factura_eventos` —el rastro del documento— pero
   * NO en la línea de tiempo del pedido, que es donde alguien mira «¿qué le hemos
   * mandado a este cliente?». El dato existía en la base y no se veía en ninguna
   * pantalla. Lo señaló Jonathan al probarlo.
   */
  it("aparece en la línea de tiempo del pedido, con QUIÉN lo mandó", async () => {
    const { servicio, anotados } = montar();

    await servicio.enviarFactura(datosFactura);

    expect(anotados).toHaveLength(1);
    expect(anotados[0]).toMatchObject({
      pedidoId: "ped-1",
      tipo: "email",
      detalle: "Factura VALF202600100",
    });
    // El actor es lo que distingue «se mandó» de «alguien decidió mandarlo».
    expect((anotados[0] as unknown as { actorId?: string }).actorId).toBe("usuario-7");
    // Y con actor NO se marca como origen «sistema»: lo pulsó una persona.
    expect((anotados[0] as unknown as { origen?: string }).origen).toBeUndefined();
  });

  /**
   * ⚠️⚠️ EL COMPORTAMIENTO QUE LO DISTINGUE DE TODOS LOS DEMÁS CORREOS. Los otros
   * se tragan el fallo de SMTP a propósito: salen detrás de algo que ya ocurrió y
   * un servidor de correo caído no puede tumbar una venta. Este lo dispara una
   * persona esperando la respuesta, así que tiene que LANZAR — un `false`
   * silencioso pintaría «enviada» sobre un correo que no salió y nadie volvería a
   * intentarlo.
   */
  it("LANZA si el SMTP falla, al contrario que los demás correos", async () => {
    const { servicio, anotados } = montar({ envioFalla: true });

    await expect(servicio.enviarFactura(datosFactura)).rejects.toThrow(/no se pudo enviar/i);
    // Y no anota nada: un apunte de algo que no ocurrió es peor que ninguno.
    expect(anotados).toHaveLength(0);
  });

  it("LANZA si no hay SMTP configurado, en vez de callarse", async () => {
    const { servicio, anotados } = montar({ sinSmtp: true });

    await expect(servicio.enviarFactura(datosFactura)).rejects.toThrow(/no está configurado/i);
    expect(anotados).toHaveLength(0);
  });
});
