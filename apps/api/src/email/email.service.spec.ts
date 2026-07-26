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
