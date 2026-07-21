import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import type { FacturaCompra, PaginatedResponse } from "@valatino/types";
import type { CompraItemInput } from "./dto/compra.dto";

// El bucket y las tablas conservan el nombre 'facturas'/'facturas_compra':
// una compra de mercancía se documenta con su factura.
const BUCKET_FACTURAS = "facturas";

@Injectable()
export class ComprasService {
  private readonly logger = new Logger(ComprasService.name);

  constructor(@Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Sube el PDF de la factura al bucket privado y registra la compra con sus
   * líneas vía RPC transaccional (compra + items + incremento de stock, todo
   * o nada). Si la RPC falla, el PDF subido se elimina para no dejar huérfanos.
   */
  async crear(params: {
    pdf: Buffer;
    numeroFactura?: string;
    proveedorId?: string;
    notas?: string;
    items: CompraItemInput[];
    creadoPor: string;
  }): Promise<FacturaCompra> {
    const pdfPath = `${new Date().getFullYear()}/${randomUUID()}.pdf`;

    const { error: uploadError } = await this.supabase.storage
      .from(BUCKET_FACTURAS)
      .upload(pdfPath, params.pdf, { contentType: "application/pdf" });

    if (uploadError) {
      this.logger.error(`Error al subir PDF de compra: ${uploadError.message}`);
      throw new UnprocessableEntityException("No se pudo guardar el PDF de la factura");
    }

    const { data: compraId, error: rpcError } = await this.supabase.rpc(
      "registrar_factura_compra",
      {
        p_pdf_path: pdfPath,
        p_items: params.items.map((i) => ({
          producto_id: i.productoId,
          cantidad: i.cantidad,
          costo_unitario: i.costoUnitario,
          iva_pct: i.ivaPct,
        })),
        p_numero_factura: params.numeroFactura ?? null,
        p_proveedor_id: params.proveedorId ?? null,
        p_notas: params.notas ?? null,
        p_creado_por: params.creadoPor,
      },
    );

    if (rpcError) {
      await this.supabase.storage.from(BUCKET_FACTURAS).remove([pdfPath]);
      this.logger.error(`Error al registrar compra de mercancía: ${rpcError.message}`);
      // Mensajes de la RPC (producto no encontrado, cantidad inválida) son accionables
      throw new BadRequestException(rpcError.message);
    }

    return this.findOne(compraId as string);
  }

  async findAll(page: number, limit: number): Promise<PaginatedResponse<FacturaCompra>> {
    const desde = (page - 1) * limit;

    const { data, count, error } = await this.supabase
      .from("facturas_compra")
      .select(
        "id, numero_factura, proveedor, proveedor_id, notas, pdf_path, total_unidades, total, total_iva, total_con_iva, creado_por, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(desde, desde + limit - 1);

    if (error) {
      this.logger.error(`Error al listar compras: ${error.message}`);
      throw new UnprocessableEntityException("Error al listar las compras");
    }

    return {
      data: (data as FacturaCompra[]) ?? [],
      total: count ?? 0,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<FacturaCompra> {
    const { data, error } = await this.supabase
      .from("facturas_compra")
      .select(
        `
        id, numero_factura, proveedor, proveedor_id, notas, pdf_path, total_unidades, total, total_iva, total_con_iva, creado_por, created_at,
        items:factura_compra_items ( id, factura_id, producto_id, nombre_producto, cantidad, costo_unitario, iva_pct )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error al leer compra ${id}: ${error.message}`);
      throw new UnprocessableEntityException("Error al leer la compra");
    }
    if (!data) throw new NotFoundException("Compra no encontrada");

    return data as unknown as FacturaCompra;
  }

  /** URL firmada (1 h) para consultar el PDF de la factura del bucket privado. */
  async getPdfUrl(id: string): Promise<{ url: string }> {
    const { data: compra } = await this.supabase
      .from("facturas_compra")
      .select("pdf_path")
      .eq("id", id)
      .maybeSingle();

    if (!compra) throw new NotFoundException("Compra no encontrada");

    const { data, error } = await this.supabase.storage
      .from(BUCKET_FACTURAS)
      .createSignedUrl((compra as { pdf_path: string }).pdf_path, 3600);

    if (error || !data?.signedUrl) {
      this.logger.error(`Error al firmar URL del PDF de ${id}: ${error?.message}`);
      throw new UnprocessableEntityException("No se pudo generar el enlace del PDF");
    }

    return { url: data.signedUrl };
  }
}
