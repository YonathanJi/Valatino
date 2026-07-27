import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type {
  Calificacion,
  CalificacionConPedido,
  CalificacionesPanel,
  ResumenCalificaciones,
} from "@valatino/types";
import type { CalificarDto } from "./dto/calificar.dto";

/**
 * Días durante los que se puede corregir una calificación ya enviada.
 *
 * Un toque mal dado no debe quedar grabado para siempre, pero una opinión que se
 * puede reescribir un año después deja de ser una foto de la experiencia.
 */
const DIAS_PARA_CORREGIR = 7;

/** Ventana por defecto del resumen del panel. */
const DIAS_RESUMEN = 90;

/** Cuántas opiniones se traen al panel. Las 200 más recientes sobran para leer. */
const LIMITE_OPINIONES = 200;

@Injectable()
export class CalificacionesService {
  private readonly logger = new Logger(CalificacionesService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Pedido al que da acceso un token, o `null` si el token no existe.
   *
   * El token es la única credencial: quien compró como invitado no tiene sesión,
   * así que no hay usuario contra el que comprobar nada.
   */
  private async pedidoDelToken(
    token: string,
  ): Promise<{ id: string; estado: string } | null> {
    const { data } = await this.supabase
      .from("pedidos")
      .select("id, estado")
      .eq("token_calificacion", token)
      .maybeSingle();

    return (data as { id: string; estado: string } | null) ?? null;
  }

  /** Lo que ya opinó, para que el formulario aparezca relleno en vez de en blanco. */
  async porToken(token: string): Promise<Calificacion | null> {
    const pedido = await this.pedidoDelToken(token);
    if (!pedido) return null;

    const { data } = await this.supabase
      .from("pedido_calificaciones")
      .select("*")
      .eq("pedido_id", pedido.id)
      .maybeSingle();

    return (data as Calificacion | null) ?? null;
  }

  /**
   * Guarda (o corrige) la calificación de un pedido.
   *
   * Devuelve `null` si el token no existe, para que el controlador responda 404
   * sin distinguir «token inventado» de «token de otro pedido»: enumerar tokens
   * no debe dar información.
   */
  async calificar(token: string, dto: CalificarDto): Promise<Calificacion | null> {
    const pedido = await this.pedidoDelToken(token);
    if (!pedido) return null;

    const existente = await this.supabase
      .from("pedido_calificaciones")
      .select("created_at")
      .eq("pedido_id", pedido.id)
      .maybeSingle();

    const creadaEn = (existente.data as { created_at: string } | null)?.created_at;
    if (creadaEn) {
      const dias = (Date.now() - new Date(creadaEn).getTime()) / 86_400_000;
      if (dias > DIAS_PARA_CORREGIR) {
        throw new ForbiddenException(
          "El plazo para cambiar esta opinión ya pasó. Gracias por habérnosla dejado.",
        );
      }
    }

    const comentario = dto.comentario?.trim();

    const { data, error } = await this.supabase
      .from("pedido_calificaciones")
      .upsert(
        {
          pedido_id: pedido.id,
          esfuerzo: dto.esfuerzo,
          satisfaccion: dto.satisfaccion,
          comentario: comentario || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pedido_id" },
      )
      .select()
      .single();

    if (error) {
      this.logger.error(`Error al guardar la calificación del pedido ${pedido.id}: ${error.message}`);
      throw new InternalServerErrorException("No se pudo guardar tu opinión");
    }

    return data as Calificacion;
  }

  /** La opinión de un pedido concreto, para su ficha en el panel. */
  async porPedido(pedidoId: string): Promise<Calificacion | null> {
    const { data } = await this.supabase
      .from("pedido_calificaciones")
      .select("*")
      .eq("pedido_id", pedidoId)
      .maybeSingle();

    return (data as Calificacion | null) ?? null;
  }

  /**
   * Resumen y opiniones para el panel.
   *
   * El resumen sale de una RPC porque la tasa de respuesta necesita contar TODOS
   * los pedidos calificables del periodo: traérselos para contarlos en Node
   * chocaría con el límite de 1000 filas de PostgREST sin avisar.
   */
  async panel(dias = DIAS_RESUMEN): Promise<CalificacionesPanel> {
    const [resumen, opiniones] = await Promise.all([
      this.resumen(dias),
      this.opiniones(),
    ]);

    return { resumen, opiniones };
  }

  private async resumen(dias: number): Promise<ResumenCalificaciones> {
    const { data, error } = await this.supabase.rpc("resumen_calificaciones", {
      p_dias: dias,
    });

    if (error) {
      this.logger.error(`Error al resumir calificaciones: ${error.message}`);
      throw new InternalServerErrorException("No se pudieron cargar las calificaciones");
    }

    const fila = ((data ?? []) as ResumenCalificaciones[])[0];

    // Sin pedidos en la ventana la RPC no devuelve fila; el panel tiene que
    // poder pintar ceros en vez de romperse el primer día.
    return (
      fila ?? {
        respuestas: 0,
        pedidos_calificables: 0,
        esfuerzo_medio: null,
        satisfaccion_medio: null,
        faciles: 0,
        regulares: 0,
        dificiles: 0,
        detractores: 0,
      }
    );
  }

  /**
   * Las opiniones más recientes con los datos del pedido al que pertenecen.
   *
   * Ordenadas por fecha y no por nota: la pantalla ya permite filtrar por
   * satisfacción, y el orden cronológico es el que deja ver una racha.
   */
  private async opiniones(): Promise<CalificacionConPedido[]> {
    const { data, error } = await this.supabase
      .from("pedido_calificaciones")
      .select("*, pedidos(numero_pedido, total, envio_nombre, email_cliente)")
      .order("created_at", { ascending: false })
      .limit(LIMITE_OPINIONES);

    if (error) {
      this.logger.error(`Error al listar calificaciones: ${error.message}`);
      throw new InternalServerErrorException("No se pudieron cargar las calificaciones");
    }

    type Fila = Calificacion & {
      pedidos: {
        numero_pedido: string | null;
        total: string | number;
        envio_nombre: string | null;
        email_cliente: string | null;
      } | null;
    };

    return ((data ?? []) as Fila[]).map(({ pedidos, ...c }) => ({
      ...c,
      numero_pedido: pedidos?.numero_pedido ?? null,
      total: Number(pedidos?.total ?? 0),
      envio_nombre: pedidos?.envio_nombre ?? null,
      email_cliente: pedidos?.email_cliente ?? null,
    }));
  }
}
