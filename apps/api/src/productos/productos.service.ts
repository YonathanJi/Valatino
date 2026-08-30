import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { esMensajeParaElUsuario } from "../common/errores/rpc";
import { TOPE_FAVORITOS } from "@valatino/types";
import type { Producto, PaginatedResponse, ResultadoDesempaquetado } from "@valatino/types";
import type { DesempaquetarDto } from "./dto/producto.dto";

const BUCKET_PRODUCTOS = "productos";

/** Extensión por mimetype admitido para imágenes de producto */
export const EXTENSION_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface QueryProductosDto {
  page?: number;
  limit?: number;
  categoria?: string;
  q?: string;
  soloActivos?: boolean;
  /**
   * Pedir productos CONCRETOS por su id. Lo usa la página de favoritos para
   * resolver la lista que tiene guardada.
   *
   * ⚠️ Va en el catálogo público y no en `/favoritos` a propósito: un INVITADO
   * tiene sus favoritos en `localStorage` y no puede llamar a una ruta con sesión,
   * pero necesita pintar lo mismo. Con esto, invitado y cliente con sesión usan el
   * MISMO camino para pasar de ids a productos, y no hay dos formas de pintar la
   * misma página.
   */
  ids?: string[];
}

/** Prefijo de las URLs públicas de nuestro bucket; lo demás no es nuestro. */
const PREFIJO_PUBLICO = `/storage/v1/object/public/${BUCKET_PRODUCTOS}/`;

@Injectable()
export class ProductosService {
  private readonly logger = new Logger(ProductosService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  async findAll(query: QueryProductosDto): Promise<PaginatedResponse<Producto>> {
    /**
     * ⚠️⚠️ `undefined` Y `[]` NO SON LO MISMO, y confundirlos aquí sería grave: «no
     * filtres por ids» y «filtra por esta lista, que ha quedado vacía» darían el
     * MISMO resultado, o sea que pedir productos concretos y que ninguno sea válido
     * devolvería **el catálogo entero**. Pedir tres cosas y recibir treinta no es un
     * error visible: es una página de favoritos que enseña la tienda entera.
     */
    const porIds = query.ids !== undefined;

    // Lista presente pero vacía: no hay nada que devolver, y se dice sin consultar.
    if (porIds && query.ids?.length === 0) {
      return { data: [], total: 0, page: 1, limit: 0 };
    }

    const page = porIds ? 1 : Math.max(1, query.page ?? 1);

    /**
     * ⚠️ Preguntando POR IDS el tope sube, y no es un capricho: quien pregunta ya
     * sabe cuáles quiere —son sus favoritos, una lista que ya tiene entera— así que
     * paginar aquí le obligaría a trocearla y a juntar los trozos. El techo es el
     * mismo que el de favoritos, así que una llamada siempre basta.
     *
     * Sin ids se queda en 50, que es el tope de siempre del catálogo.
     */
    const limit = porIds
      ? Math.min(TOPE_FAVORITOS, query.ids?.length ?? 0)
      : Math.min(50, Math.max(1, query.limit ?? 20));

    const offset = (page - 1) * limit;

    let qb = this.supabase
      .from("productos")
      .select("*", { count: "exact" });

    if (query.soloActivos !== false) {
      qb = qb.eq("activo", true);
    }

    if (query.categoria) {
      qb = qb.eq("categoria", query.categoria);
    }

    if (query.q) {
      qb = qb.ilike("nombre", `%${query.q}%`);
    }

    if (porIds) {
      qb = qb.in("id", query.ids as string[]);
    }

    const { data, error, count } = await qb
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException("No se pudo cargar el catálogo");

    return {
      data: (data as Producto[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("id", id)
      .eq("activo", true)
      .single();

    if (error || !data) throw new NotFoundException(`Producto ${id} no encontrado`);
    return data as Producto;
  }

  async findBySlug(slug: string): Promise<Producto> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("slug", slug)
      .eq("activo", true)
      .single();

    if (error || !data) throw new NotFoundException(`Producto '${slug}' no encontrado`);
    return data as Producto;
  }

  /**
   * Sube una imagen de producto al bucket público y devuelve su URL pública
   * (la que se guarda en `productos.imagenes` y consume el storefront).
   */
  async subirImagen(imagen: Buffer, mimetype: string): Promise<{ url: string }> {
    const ext = EXTENSION_POR_MIME[mimetype];
    if (!ext) throw new BadRequestException("Formato de imagen no admitido");

    const path = `${randomUUID()}.${ext}`;

    const { error } = await this.supabase.storage
      .from(BUCKET_PRODUCTOS)
      .upload(path, imagen, { contentType: mimetype });

    if (error) {
      throw new InternalServerErrorException("No se pudo subir la imagen");
    }

    const { data } = this.supabase.storage.from(BUCKET_PRODUCTOS).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  /** Slug URL-safe a partir del nombre (sin tildes, kebab-case) */
  private generarSlug(nombre: string): string {
    return nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async create(dto: Partial<Producto>): Promise<Producto> {
    // El storefront enlaza las fichas por slug: si no llega uno, se genera
    // del nombre (con reintento sufijado ante colisión).
    const slugAuto = !dto.slug;
    let slug = dto.slug ?? this.generarSlug(dto.nombre ?? "");

    for (let intento = 0; intento < 3; intento++) {
      const { data, error } = await this.supabase
        .from("productos")
        .insert({ ...dto, slug })
        .select()
        .single();

      if (data) return data as Producto;

      if (error?.code === "23505" && error.message.includes("slug")) {
        if (!slugAuto) {
          throw new BadRequestException("Ya existe un producto con ese slug");
        }
        slug = `${this.generarSlug(dto.nombre ?? "")}-${Math.floor(Math.random() * 1000)}`;
        continue;
      }

      throw new InternalServerErrorException("No se pudo crear el producto");
    }

    throw new InternalServerErrorException("No se pudo generar un slug único");
  }

  /**
   * Al cambiar `imagenes`, las que se quiten se borran también del bucket.
   *
   * Sin esto, reemplazar la foto de un producto dejaba la anterior en el bucket
   * para siempre. Y el bucket es **público**: un fichero suelto sigue siendo
   * descargable por su URL aunque ya no esté en ningún producto, así que quitar
   * del catálogo una imagen equivocada no la retiraba de internet. El espacio
   * es lo de menos.
   */
  async update(id: string, dto: Partial<Producto>): Promise<Producto> {
    // Las anteriores solo se leen si el dto trae `imagenes`: una edición que no
    // toca las fotos —precio, stock, nombre— no debe borrar ninguna.
    const anteriores = dto.imagenes !== undefined ? await this.imagenesActuales(id) : [];

    const { data, error } = await this.supabase
      .from("productos")
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Producto ${id} no encontrado`);

    // Después de que la escritura haya ido bien, nunca antes: si el update
    // falla, las imágenes de las que se venía siguen siendo las buenas.
    const vigentes = (data as Producto).imagenes ?? [];
    await this.borrarDelBucket(anteriores.filter((url) => !vigentes.includes(url)));

    return data as Producto;
  }

  private async imagenesActuales(id: string): Promise<string[]> {
    const { data } = await this.supabase
      .from("productos")
      .select("imagenes")
      .eq("id", id)
      .maybeSingle();

    return (data as { imagenes: string[] | null } | null)?.imagenes ?? [];
  }

  /**
   * Borra del bucket las URLs que sean nuestras; las de otros orígenes se
   * ignoran.
   *
   * No lanza: el producto ya se guardó, y no poder limpiar un fichero no es
   * motivo para devolver error en una operación que sí funcionó. Queda en el
   * log para poder recogerlo a mano, porque un huérfano en un bucket público
   * sigue siendo descargable y conviene saber que está ahí.
   */
  private async borrarDelBucket(urls: string[]): Promise<void> {
    const paths = urls
      .filter((url) => url.includes(PREFIJO_PUBLICO))
      .map((url) => url.slice(url.indexOf(PREFIJO_PUBLICO) + PREFIJO_PUBLICO.length));

    if (paths.length === 0) return;

    const { error } = await this.supabase.storage.from(BUCKET_PRODUCTOS).remove(paths);

    if (error) {
      this.logger.error(
        `No se pudieron borrar del bucket ${paths.length} fichero(s) [${paths.join(", ")}]: ${error.message}`,
      );
    }
  }

  /**
   * Elimina un producto sin histórico. Si tiene pedidos, facturas, carritos o
   * reservas asociados, la FK lo impide (23503) → 409 sugiriendo desactivarlo
   * (el histórico nunca se rompe). Si se borra, su imagen del bucket también.
   */
  async remove(id: string): Promise<void> {
    const { data: prod } = await this.supabase
      .from("productos")
      .select("imagenes")
      .eq("id", id)
      .maybeSingle();

    if (!prod) throw new NotFoundException(`Producto ${id} no encontrado`);

    const { error } = await this.supabase.from("productos").delete().eq("id", id);

    if (error) {
      if (error.code === "23503") {
        throw new ConflictException(
          "No se puede eliminar: el producto tiene pedidos, facturas o carritos asociados. Desactívalo para ocultarlo del catálogo.",
        );
      }
      throw new InternalServerErrorException("No se pudo eliminar el producto");
    }

    await this.borrarDelBucket((prod as { imagenes: string[] | null }).imagenes ?? []);
  }

  /**
   * Abre bultos de un producto y suma sus unidades a otro, en una transacción.
   *
   * La RPC hace las dos mitades o ninguna, bloquea las dos filas en orden de id
   * (para que dos desempaquetados cruzados no se enreden) y comprueba que haya
   * bultos **sin reservar**. Aquí no se replica ninguna de esas reglas: si se
   * copian, se acaban desincronizando.
   */
  async desempaquetar(dto: DesempaquetarDto, actor: string): Promise<ResultadoDesempaquetado> {
    const { data, error } = await this.supabase.rpc("desempaquetar_producto", {
      p_origen_id: dto.origen_id,
      p_destino_id: dto.destino_id,
      p_bultos: dto.bultos,
      p_unidades_por_bulto: dto.unidades_por_bulto,
      p_actor: actor,
    });

    if (error) {
      this.logger.error(`Error al desempaquetar: ${error.message}`);
      // Los mensajes de la RPC son accionables ("solo hay 3 de «X» sin
      // reservar"), así que se devuelven tal cual. Los de Postgres NO: ahí
      // dentro van nombres de tablas y restricciones.
      if (!esMensajeParaElUsuario(error)) {
        throw new BadRequestException("No se ha podido desempaquetar el producto");
      }
      throw new BadRequestException(error.message);
    }

    return data as ResultadoDesempaquetado;
  }

  /**
   * El motivo y quién lo hizo van a la RPC, que los apunta en `ajustes_stock`
   * **en la misma transacción** que el movimiento (migración 063). Escribir el
   * libro aparte lo dejaría a medias en cuanto algo fallara, y un libro con
   * huecos es peor que no tenerlo porque parece completo.
   */
  async ajustarStock(
    id: string,
    cantidad: number,
    motivo?: string,
    nota?: string,
    actorId?: string,
  ): Promise<{ stock_disponible: number }> {
    const { data, error } = await this.supabase.rpc("ajustar_stock", {
      p_producto_id: id,
      p_cantidad: cantidad,
      p_motivo: motivo ?? "sin_indicar",
      p_nota: nota ?? null,
      p_actor_id: actorId ?? null,
    });

    if (error) {
      // La RPC lanza excepciones con mensajes claros (producto no existe,
      // stock quedaría negativo, etc.). Lo que no venga de ahí es del motor y
      // no sale de aquí.
      this.logger.error(`Error al ajustar el stock de ${id}: ${error.message}`);
      if (!esMensajeParaElUsuario(error)) {
        throw new BadRequestException("No se ha podido ajustar el stock");
      }
      throw new BadRequestException(error.message);
    }
    return { stock_disponible: data as number };
  }
}
