import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { CarritoConItems, CarritoItemDetalle } from "@valatino/types";

/** Límite comercial por producto y carrito; pedidos mayores se atienden por email.
    El stock real nunca se comunica al cliente. */
const MAX_UNIDADES_POR_PRODUCTO = 30;
const EMAIL_PEDIDOS_GRANDES = "valatino@hotmail.com";
const MSG_LIMITE_UNIDADES = `Máximo ${MAX_UNIDADES_POR_PRODUCTO} unidades por producto. Si necesitas más, escríbenos a ${EMAIL_PEDIDOS_GRANDES}`;
const MSG_SIN_STOCK = "No hay unidades suficientes de este producto en este momento";

/**
 * Céntimos enteros, y hace falta de verdad.
 *
 * `0.1 + 0.2` en coma flotante es `0.30000000000000004`, y un carrito de tres
 * artículos a 0,95 € da `2.8499999999999996`. Ese número viaja a Stripe como
 * `Math.round(x * 100)` y ahí no molesta, pero también viaja al JSON del carrito,
 * donde el navegador lo imprimiría con su cola. Se corta en el único sitio que
 * suma dinero en este fichero.
 */
const redondear = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class CarritoService {
  private readonly logger = new Logger(CarritoService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async getOrCreate(sessionId: string, userId?: string): Promise<string> {
    const query = userId
      ? this.supabase.from("carritos").select("id").eq("user_id", userId).maybeSingle()
      : this.supabase.from("carritos").select("id").eq("session_id", sessionId).is("user_id", null).maybeSingle();

    const { data: existing } = await query;
    if (existing) return (existing as { id: string }).id;

    const { data: created, error } = await this.supabase
      .from("carritos")
      .insert({ session_id: sessionId, user_id: userId ?? null })
      .select("id")
      .single();

    if (created) return (created as { id: string }).id;

    // 23505: otra petición concurrente del mismo usuario ganó la carrera (hay
    // índice único parcial en carritos.user_id). Antes esto era un 500.
    if (error?.code === "23505" && userId) {
      const { data: ganador } = await this.supabase
        .from("carritos")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (ganador) return (ganador as { id: string }).id;
    }

    throw new InternalServerErrorException("No se pudo crear el carrito");
  }

  async getCarrito(sessionId: string, userId?: string): Promise<CarritoConItems> {
    const carritoId = await this.getOrCreate(sessionId, userId);

    // En paralelo: el código no depende de los artículos y el carrito es la pantalla
    // más pedida de la tienda. Encadenarlos añadiría un viaje a la base por vista.
    const [{ data: items, error }, codigoGuardado] = await Promise.all([
      this.supabase
        .from("carrito_items")
        .select("id, cantidad, precio_unitario, producto_id")
        .eq("carrito_id", carritoId),
      this.codigoDelCarrito(carritoId),
    ]);

    if (error) throw new InternalServerErrorException("No se pudo cargar el carrito");

    const itemsRaw = items as unknown as Array<{
      id: string;
      cantidad: number;
      precio_unitario: number;
      producto_id: string;
    }>;

    if (!itemsRaw || itemsRaw.length === 0) {
      // Un carrito vacío no paga porte. `coste_envio_de` también devolvería 0,
      // pero salir aquí ahorra dos viajes a la base en la pantalla que más se
      // pide: la del icono del carrito.
      //
      // ⚠️ Y tampoco se valida el código: sobre 0 € ningún código vale, y
      // `codigo_descuento_aplicable` lo rechazaría con un motivo que no viene a
      // cuento en un carrito vacío.
      return {
        id: carritoId,
        items: [],
        subtotal: 0,
        costeEnvio: 0,
        envioGratisDesde: await this.umbralEnvioGratis(),
        descuento: 0,
        codigoDescuento: null,
        envioDescontado: 0,
        avisoDescuento: null,
        total: 0,
      };
    }

    const productoIds = itemsRaw.map((i) => i.producto_id);

    const { data: productos } = await this.supabase
      .from("productos")
      .select("id, nombre, imagenes")
      .in("id", productoIds);

    const prodMap = new Map<string, { nombre: string; imagenes: string[] }>();
    for (const p of (productos as Array<{ id: string; nombre: string; imagenes: string[] }>) ?? []) {
      prodMap.set(p.id, { nombre: p.nombre, imagenes: p.imagenes });
    }

    const itemsDetalle: CarritoItemDetalle[] = [];
    for (const item of itemsRaw) {
      const prod = prodMap.get(item.producto_id);
      if (!prod) continue;

      itemsDetalle.push({
        id: item.id,
        productoId: item.producto_id,
        nombre: prod.nombre,
        imagenes: prod.imagenes,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precio_unitario),
        // ⚠️ Redondeado, igual que el subtotal del carrito. `0.62 * 3` en coma
        // flotante es `1.8599999999999999`, y ese número viajaba tal cual en el
        // JSON. `formatEUR` lo tapaba al pintarlo, así que no se veía — pero
        // desde que el carrito enseña una fila de «Subtotal» hay dos importes
        // que el cliente puede sumar, y un campo de dinero de una API que va a
        // un cobro no puede llevar cola binaria.
        subtotal: redondear(Number(item.precio_unitario) * item.cantidad),
      });
    }

    const subtotal = redondear(itemsDetalle.reduce((acc, i) => acc + i.subtotal, 0));

    /**
     * ⚠️⚠️ EL ENVÍO LO DECIDE LA BASE, NUNCA ESTE FICHERO. La tarifa vive en
     * `coste_envio_de` (migración 080 §1) porque este importe es el que se le
     * COBRA al cliente, y el que factura `confirmar_venta` sale de la misma
     * función. Aplicar aquí la regla en TypeScript —«si subtotal >= umbral,
     * gratis»— sería tenerla en dos sitios: el día que difirieran, se cobraría
     * un importe y se facturaría otro, y el guardia del desglose abortaría
     * DENTRO del webhook de un pago ya cobrado. Es la lección de la 074.
     *
     * ⚠️⚠️ Y DESDE LA 083, EL DESCUENTO TAMPOCO, por la misma razón y con más
     * motivo: lo que se le cobra al cliente es este `total`, y lo que factura
     * `confirmar_venta` sale del snapshot de ese mismo número.
     * `codigo_descuento_aplicable` (083 §5) es el único sitio que decide si un
     * código vale y cuánto descuenta.
     *
     * ⭐ Y EL CÓDIGO SE LE PASA CRUDO A `coste_envio_de`, sin comprobar antes si es
     * válido. Esa función ya se lo pregunta a la misma función que esto. Filtrarlo
     * aquí sería tomar la decisión dos veces, y el día que difirieran el carrito
     * enseñaría un porte y la venta cobraría otro.
     *
     * El umbral sí se lee suelto, y no es lo mismo: no decide nada, solo se
     * enseña. Y se mide sobre el subtotal BRUTO, igual que en la base (083 §0.5).
     */
    const [dto, costeEnvio, envioGratisDesde] = await Promise.all([
      this.descuentoDe(codigoGuardado, subtotal),
      this.costeEnvio(subtotal, codigoGuardado),
      this.umbralEnvioGratis(),
    ]);

    /**
     * Cuánto porte ahorra el código, para poder decírselo al cliente y para poder
     * medir la campaña después.
     *
     * ⚠️ Solo se pregunta cuando el código es de `envio_gratis` Y el porte quedó en
     * 0: es una RPC más en la pantalla más vista de la tienda, y en cualquier otro
     * caso la respuesta es 0 sin necesidad de preguntar. Si el carrito ya pasaba del
     * umbral, `sinCodigo` también sale 0 y el ahorro es 0 — que es la verdad: ahí el
     * código no está ahorrando nada.
     */
    const envioDescontado =
      dto.valido && dto.envioGratis && costeEnvio === 0
        ? await this.costeEnvio(subtotal, null)
        : 0;

    return {
      id: carritoId,
      items: itemsDetalle,
      subtotal,
      costeEnvio,
      envioGratisDesde,
      descuento: dto.descuento,
      codigoDescuento: dto.valido ? dto.codigo : null,
      envioDescontado,
      avisoDescuento: dto.valido ? null : dto.motivo,
      total: redondear(subtotal + costeEnvio - dto.descuento),
    };
  }

  /** El código guardado en el carrito, sin validar. `null` si no hay. */
  private async codigoDelCarrito(carritoId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("carritos")
      .select("codigo_descuento")
      .eq("id", carritoId)
      .maybeSingle();

    if (error || !data) return null;
    return (data as { codigo_descuento: string | null }).codigo_descuento;
  }

  /**
   * Qué hace un código sobre un subtotal, tal como lo dice la base.
   *
   * ⚠️ Un fallo aquí NO tumba el carrito y devuelve «sin descuento», pero SÍ deja
   * aviso: el signo del fallo es el contrario que en el porte. Quedarse sin
   * descuento le cobra al cliente MÁS de lo que esperaba, que es un motivo para no
   * comprar, no una pérdida para la tienda. Así que la tienda sigue en pie y el
   * cliente se entera de que su código no se está aplicando.
   */
  private async descuentoDe(
    codigo: string | null,
    subtotal: number,
  ): Promise<{
    valido: boolean;
    codigo: string | null;
    descuento: number;
    envioGratis: boolean;
    motivo: string | null;
  }> {
    if (!codigo?.trim())
      return { valido: false, codigo: null, descuento: 0, envioGratis: false, motivo: null };

    const { data, error } = await this.supabase.rpc("codigo_descuento_aplicable", {
      p_codigo: codigo,
      p_subtotal: subtotal,
    });

    if (error) {
      this.logger.error(
        `No se pudo validar el código «${codigo}» sobre ${subtotal} €, no se aplica: ${error.message}`,
      );
      return {
        valido: false,
        codigo: null,
        descuento: 0,
        envioGratis: false,
        motivo: "Ahora mismo no podemos comprobar tu código. Vuelve a intentarlo en un momento.",
      };
    }

    // `returns table` de una fila: PostgREST lo entrega como array.
    const fila = (Array.isArray(data) ? data[0] : data) as
      | {
          valido: boolean;
          motivo: string | null;
          descuento: string | number;
          envio_gratis: boolean;
        }
      | undefined;

    if (!fila)
      return { valido: false, codigo: null, descuento: 0, envioGratis: false, motivo: null };

    return {
      valido: fila.valido,
      codigo: codigo.trim().toUpperCase(),
      descuento: fila.valido ? redondear(Number(fila.descuento ?? 0)) : 0,
      envioGratis: Boolean(fila.envio_gratis),
      motivo: fila.motivo,
    };
  }

  /**
   * Aplica un código al carrito.
   *
   * ⚠️ SOLO SE GUARDA SI VALE. Guardar uno inválido dejaría el carrito con un aviso
   * permanente y al cliente sin saber si lo tiene puesto o no. Si no vale, se
   * rechaza con el motivo que redacta la base y el carrito no cambia.
   */
  async aplicarCodigo(codigo: string, sessionId: string, userId?: string): Promise<CarritoConItems> {
    const carrito = await this.getCarrito(sessionId, userId);

    if (carrito.items.length === 0) {
      throw new BadRequestException("Añade algo al carrito antes de usar un código");
    }

    const r = await this.descuentoDe(codigo, carrito.subtotal);
    if (!r.valido) {
      throw new BadRequestException(r.motivo ?? "Ese código no se puede aplicar");
    }

    const { error } = await this.supabase
      .from("carritos")
      .update({ codigo_descuento: codigo.trim(), updated_at: new Date().toISOString() })
      .eq("id", carrito.id);

    if (error) throw new InternalServerErrorException("No se pudo aplicar el código");

    return this.getCarrito(sessionId, userId);
  }

  /** Quita el código del carrito. Idempotente: quitar el que no hay no es un error. */
  async quitarCodigo(sessionId: string, userId?: string): Promise<CarritoConItems> {
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { error } = await this.supabase
      .from("carritos")
      .update({ codigo_descuento: null, updated_at: new Date().toISOString() })
      .eq("id", carritoId);

    if (error) throw new InternalServerErrorException("No se pudo quitar el código");

    return this.getCarrito(sessionId, userId);
  }

  /**
   * Los gastos de envío de un subtotal, según la tarifa de la tienda y el código
   * que lleve el carrito (un código de `envio_gratis` lo pone a 0).
   */
  private async costeEnvio(subtotal: number, codigo?: string | null): Promise<number> {
    const { data, error } = await this.supabase.rpc("coste_envio_de", {
      p_subtotal: subtotal,
      p_codigo: codigo ?? null,
    });

    /**
     * ⚠️ Un fallo aquí NO tumba el carrito, y devuelve 0 a propósito. El carrito
     * es la pantalla más vista de la tienda y el envío es un cargo ADICIONAL:
     * quedarse corto deja de cobrar un porte, y reventar deja a la tienda sin
     * carrito. De los dos fallos, el barato es el primero.
     *
     * Y no se queda en silencio: sale por el log como error, porque significa que
     * la tienda está regalando el envío sin saberlo.
     */
    if (error) {
      this.logger.error(
        `No se pudo calcular el coste de envío de ${subtotal} €, se cobra 0: ${error.message}`,
      );
      return 0;
    }

    return redondear(Number(data ?? 0));
  }

  /**
   * El umbral de envío gratis, solo para enseñarlo. `null` si no hay.
   *
   * Se lee de `ajustes_tienda` y no de la RPC porque no decide nada: es el dato
   * con el que el carrito dice «te faltan 3,40 € para el envío gratis».
   */
  private async umbralEnvioGratis(): Promise<number | null> {
    const { data, error } = await this.supabase
      .from("ajustes_tienda")
      .select("envio_gratis_desde")
      .maybeSingle();

    if (error || !data) return null;

    const umbral = (data as { envio_gratis_desde: string | number | null }).envio_gratis_desde;
    return umbral === null ? null : Number(umbral);
  }

  async addItem(
    sessionId: string,
    productoId: string,
    cantidad: number,
    userId?: string,
  ): Promise<CarritoConItems> {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException("La cantidad debe ser un entero mayor que cero");
    }
    if (cantidad > MAX_UNIDADES_POR_PRODUCTO) {
      throw new ConflictException(MSG_LIMITE_UNIDADES);
    }

    // Verificar stock
    const { data: producto, error: stockError } = await this.supabase
      .from("productos")
      .select("precio, stock_disponible")
      .eq("id", productoId)
      .eq("activo", true)
      .single();

    if (stockError || !producto) throw new NotFoundException("Producto no encontrado");

    const p = producto as { precio: number; stock_disponible: number };
    if (p.stock_disponible < cantidad) {
      throw new ConflictException(
        p.stock_disponible > 0 ? MSG_SIN_STOCK : "Este producto está agotado",
      );
    }

    const carritoId = await this.getOrCreate(sessionId, userId);

    // Upsert: incrementar cantidad si ya existe
    const { data: existing } = await this.supabase
      .from("carrito_items")
      .select("id, cantidad")
      .eq("carrito_id", carritoId)
      .eq("producto_id", productoId)
      .maybeSingle();

    if (existing) {
      const enCarrito = (existing as { id: string; cantidad: number }).cantidad;
      const nuevaCantidad = enCarrito + cantidad;
      if (nuevaCantidad > MAX_UNIDADES_POR_PRODUCTO) {
        throw new ConflictException(MSG_LIMITE_UNIDADES);
      }
      if (nuevaCantidad > p.stock_disponible) {
        throw new ConflictException(MSG_SIN_STOCK);
      }
      const { error: updateError } = await this.supabase
        .from("carrito_items")
        .update({ cantidad: nuevaCantidad })
        .eq("id", (existing as { id: string }).id)
        .eq("carrito_id", carritoId);

      if (updateError) throw new InternalServerErrorException("No se pudo actualizar el carrito");
    } else {
      const { error: insertError } = await this.supabase.from("carrito_items").insert({
        carrito_id: carritoId,
        producto_id: productoId,
        cantidad,
        precio_unitario: p.precio,
      });

      if (insertError) throw new InternalServerErrorException("No se pudo añadir el producto al carrito");
    }

    return this.getCarrito(sessionId, userId);
  }

  async updateItem(
    sessionId: string,
    itemId: string,
    cantidad: number,
    userId?: string,
  ): Promise<CarritoConItems> {
    if (cantidad <= 0) {
      return this.removeItem(sessionId, itemId, userId);
    }
    if (cantidad > MAX_UNIDADES_POR_PRODUCTO) {
      throw new ConflictException(MSG_LIMITE_UNIDADES);
    }

    // Verificar que el ítem pertenece al carrito del solicitante (anti-IDOR)
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { data: item } = await this.supabase
      .from("carrito_items")
      .select("producto_id")
      .eq("id", itemId)
      .eq("carrito_id", carritoId)
      .maybeSingle();

    if (!item) throw new NotFoundException("Ítem no encontrado en tu carrito");

    const { data: producto } = await this.supabase
      .from("productos")
      .select("stock_disponible")
      .eq("id", (item as { producto_id: string }).producto_id)
      .single();

    if (producto && (producto as { stock_disponible: number }).stock_disponible < cantidad) {
      throw new ConflictException(MSG_SIN_STOCK);
    }

    const { error: updateError } = await this.supabase
      .from("carrito_items")
      .update({ cantidad })
      .eq("id", itemId)
      .eq("carrito_id", carritoId);

    if (updateError) throw new InternalServerErrorException("No se pudo actualizar el ítem");

    return this.getCarrito(sessionId, userId);
  }

  async removeItem(
    sessionId: string,
    itemId: string,
    userId?: string,
  ): Promise<CarritoConItems> {
    // Acotar el borrado al carrito del solicitante (anti-IDOR)
    const carritoId = await this.getOrCreate(sessionId, userId);

    const { error } = await this.supabase
      .from("carrito_items")
      .delete()
      .eq("id", itemId)
      .eq("carrito_id", carritoId);

    if (error) throw new InternalServerErrorException("No se pudo eliminar el ítem");

    return this.getCarrito(sessionId, userId);
  }

  async fusionarCarrito(sessionId: string, userId: string): Promise<void> {
    // Buscar carrito anónimo
    const { data: carritoAnonimo } = await this.supabase
      .from("carritos")
      .select("id")
      .eq("session_id", sessionId)
      .is("user_id", null)
      .maybeSingle();

    if (!carritoAnonimo) return;

    const carritoAnonimoId = (carritoAnonimo as { id: string }).id;

    // Obtener o crear carrito autenticado
    const carritoAutenticadoId = await this.getOrCreate(sessionId, userId);

    if (carritoAnonimoId === carritoAutenticadoId) return;

    // Migrar ítems del carrito anónimo al autenticado
    const { data: itemsAnonimos } = await this.supabase
      .from("carrito_items")
      .select("*")
      .eq("carrito_id", carritoAnonimoId);

    for (const item of (itemsAnonimos as Array<{
      producto_id: string;
      cantidad: number;
      precio_unitario: number;
    }>) ?? []) {
      const { data: existing } = await this.supabase
        .from("carrito_items")
        .select("id, cantidad")
        .eq("carrito_id", carritoAutenticadoId)
        .eq("producto_id", item.producto_id)
        .maybeSingle();

      if (existing) {
        await this.supabase
          .from("carrito_items")
          .update({ cantidad: (existing as { cantidad: number }).cantidad + item.cantidad })
          .eq("id", (existing as { id: string }).id);
      } else {
        await this.supabase.from("carrito_items").insert({
          carrito_id: carritoAutenticadoId,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        });
      }
    }

    // Eliminar carrito anónimo
    await this.supabase.from("carritos").delete().eq("id", carritoAnonimoId);

    // Vincular el nuevo session_id al carrito autenticado
    await this.supabase
      .from("carritos")
      .update({ user_id: userId })
      .eq("id", carritoAutenticadoId);
  }
}
