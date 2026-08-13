"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR } from "@lib/utils";
import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { usePuede } from "@components/backoffice/PermisosProvider";
import { ProductoBorradorModal } from "@components/backoffice/ProductoBorradorModal";
import type {
  FacturaCompra,
  IvaPorcentaje,
  PaginatedResponse,
  Producto,
  Proveedor,
} from "@valatino/types";

interface Linea {
  productoId: string;
  cantidad: number;
  costoUnitario: number;
  ivaPct: number;
}

const IVA_OPCIONES = [4, 10, 21] as const;
const LINEA_NUEVA: Linea = { productoId: "", cantidad: 1, costoUnitario: NaN, ivaPct: 10 };

/**
 * Valor centinela de la última opción del desplegable de productos: no es un
 * producto, es «crear uno nuevo». No puede colisionar con un id porque los ids
 * son UUID.
 */
const OPCION_PRODUCTO_NUEVO = "__nuevo__";

/**
 * Hoy en el calendario ESPAÑOL, en `YYYY-MM-DD`, para topar el selector de
 * fecha. Con la zona explícita y no la del navegador: la API valida contra
 * Europe/Madrid, y un portátil con la zona mal puesta ofrecería un día que el
 * servidor va a rechazar sin que se entienda por qué.
 */
function hoyEnEspana(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function NuevaCompraPage() {
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [numeroFactura, setNumeroFactura] = useState("");
  // Vacía a propósito, sin poner hoy por defecto: la fecha va a un libro
  // oficial y un valor prerrellenado se acepta sin mirarlo. La de la factura
  // casi nunca es la de hoy.
  const [fechaFactura, setFechaFactura] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_NUEVA }]);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Índice de la línea que abrió el modal de producto nuevo, para poder dejar el
   * producto creado ya seleccionado en ELLA y no en otra.
   */
  const [lineaCreandoProducto, setLineaCreandoProducto] = useState<number | null>(null);

  // Crear un producto es `catalogo:edicion` en la API. Quien registre compras sin
  // ese permiso no debe ver el botón: la regla del panel es que lo que no se
  // puede hacer, no se pinta.
  const puedeCrearProducto = usePuede("catalogo", "edicion");

  // Proveedor: autocompletado sobre la lista completa (se filtra al teclear)
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [proveedor, setProveedor] = useState<Proveedor | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, provs] = await Promise.all([
          apiFetch<PaginatedResponse<Producto>>("/productos?limit=100&soloActivos=false"),
          apiFetch<Proveedor[]>("/admin/proveedores"),
        ]);
        setProductos(prods.data ?? []);
        setProveedores(provs ?? []);
      } catch {
        // el layout ya protege la ruta
      }
    };
    void load();
  }, []);

  const sugerencias = useMemo(() => {
    const q = busqueda.trim();
    if (!q || proveedor) return [];
    const qCif = q.toUpperCase().replace(/[\s-]+/g, "");
    const qNombre = q.toLowerCase();
    return proveedores
      .filter((p) => p.cif.includes(qCif) || p.nombre.toLowerCase().includes(qNombre))
      .slice(0, 6);
  }, [busqueda, proveedor, proveedores]);

  const totales = useMemo(() => {
    let unidades = 0;
    let base = 0;
    let iva = 0;
    for (const l of lineas) {
      if (l.cantidad > 0) unidades += l.cantidad;
      if (l.cantidad > 0 && l.costoUnitario >= 0 && !Number.isNaN(l.costoUnitario)) {
        base += l.cantidad * l.costoUnitario;
        iva += (l.cantidad * l.costoUnitario * l.ivaPct) / 100;
      }
    }
    return { unidades, base, iva, conIva: base + iva };
  }, [lineas]);

  const setLinea = (idx: number, cambio: Partial<Linea>) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...cambio } : l)));

  const quitarLinea = (idx: number) =>
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const lineasValidas = lineas.filter(
    (l) => l.productoId && l.cantidad > 0 && !Number.isNaN(l.costoUnitario) && l.costoUnitario >= 0,
  );
  const puedeEnviar =
    Boolean(pdf) &&
    numeroFactura.trim() !== "" &&
    fechaFactura !== "" &&
    lineasValidas.length === lineas.length &&
    !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdf || !numeroFactura.trim() || !fechaFactura || lineasValidas.length === 0) return;

    setIsSaving(true);
    try {
      const form = new FormData();
      form.append("pdf", pdf);
      form.append("numeroFactura", numeroFactura.trim());
      form.append("fechaFactura", fechaFactura);
      if (proveedor) form.append("proveedorId", proveedor.id);
      if (notas.trim()) form.append("notas", notas.trim());
      form.append(
        "items",
        JSON.stringify(
          lineasValidas.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
            costoUnitario: Math.round(l.costoUnitario * 10000) / 10000,
            ivaPct: l.ivaPct,
          })),
        ),
      );

      const compra = await apiFetch<FacturaCompra>("/admin/compras", {
        method: "POST",
        body: form,
      });

      toast.success(`Compra registrada: +${compra.total_unidades} unidades al inventario`);
      router.push(`/backoffice/compras/${compra.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al registrar la compra");
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <PageHeader
        icon={ShoppingBag}
        back={{ href: "/backoffice/compras", label: "Compras" }}
        title="Registrar compra de mercancía"
        description="Sube el PDF de la factura, indica qué contiene y el inventario sumará esas unidades"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Proveedor */}
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Proveedor</h2>

          {proveedor ? (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white text-xs">
                  ✓
                </span>
                <div>
                  <p className="font-semibold">{proveedor.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{proveedor.cif}</p>
                  {(proveedor.telefono || proveedor.email) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[proveedor.telefono, proveedor.email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {proveedor.direccion && (
                    <p className="text-xs text-muted-foreground mt-0.5">{proveedor.direccion}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProveedor(null);
                  setBusqueda("");
                }}
                aria-label="Quitar proveedor"
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                ✕ Cambiar
              </button>
            </div>
          ) : (
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder="Busca por CIF o nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
              />
              {sugerencias.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-md overflow-hidden">
                  {sugerencias.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProveedor(p);
                        setBusqueda("");
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                    >
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground font-mono">{p.cif}</span>
                    </button>
                  ))}
                </div>
              )}
              {busqueda.trim() && sugerencias.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Ningún proveedor coincide.{" "}
                  <Link
                    href="/backoffice/compras/proveedores"
                    className="text-primary hover:underline"
                  >
                    Créalo en Proveedores
                  </Link>
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Opcional: escribe el CIF o el nombre y selecciona el proveedor de la lista.
          </p>
        </div>

        {/* Datos de la factura */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold">Factura de la compra</h2>
          <div className="space-y-1.5">
            <label htmlFor="pdf" className="text-sm font-medium">
              PDF de la factura <span className="text-destructive">*</span>
            </label>
            <input
              id="pdf"
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/80 cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">Máximo 10 MB</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="numero-factura" className="text-sm font-medium">
                Nº de factura <span className="text-destructive">*</span>
              </label>
              <input
                id="numero-factura"
                type="text"
                placeholder="Ej. 202521188"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                maxLength={100}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
              />
              <p className="text-xs text-muted-foreground">
                No puede repetirse: es lo que evita registrar la misma compra dos veces y duplicar
                el stock.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fecha-factura" className="text-sm font-medium">
                Fecha de la factura <span className="text-destructive">*</span>
              </label>
              <input
                id="fecha-factura"
                type="date"
                value={fechaFactura}
                onChange={(e) => setFechaFactura(e.target.value)}
                // Una factura del futuro es un error de tecleo. El tope está
                // también en la base, que es la que lo garantiza.
                max={hoyEnEspana()}
                required
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                La que trae el PDF, no la de hoy. Es un dato obligatorio del libro de facturas
                recibidas.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="notas-compra" className="text-sm font-medium">
              Notas
            </label>
            <input
              id="notas-compra"
              type="text"
              placeholder="Opcional"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={2000}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        {/* Contenido */}
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Contenido de la compra</h2>
            <span className="text-sm text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{totales.unidades}</span>{" "}
              uds · Base{" "}
              <span className="font-mono font-medium text-foreground">
                {formatEUR(totales.base)}
              </span>{" "}
              · IVA{" "}
              <span className="font-mono font-medium text-foreground">
                {formatEUR(totales.iva)}
              </span>{" "}
              · Total{" "}
              <span className="font-mono font-semibold text-foreground">
                {formatEUR(totales.conIva)}
              </span>
            </span>
          </div>

          <div className="hidden sm:grid sm:grid-cols-[1fr_5rem_8rem_5rem_6.5rem_2rem] gap-2 text-xs text-muted-foreground px-1">
            <span>Producto</span>
            <span className="text-right">Cantidad</span>
            <span className="text-right">Costo unidad € (sin IVA)</span>
            <span className="text-right">IVA %</span>
            <span className="text-right">Subtotal sin IVA</span>
            <span />
          </div>

          <div className="space-y-2">
            {lineas.map((linea, idx) => {
              const subtotal =
                linea.cantidad > 0 && !Number.isNaN(linea.costoUnitario) && linea.costoUnitario >= 0
                  ? linea.cantidad * linea.costoUnitario
                  : null;
              return (
                <div
                  key={idx}
                  className="grid grid-cols-2 sm:grid-cols-[1fr_5rem_8rem_5rem_6.5rem_2rem] gap-2 items-center"
                >
                  <select
                    value={linea.productoId}
                    onChange={(e) => {
                      // La última opción no es un producto, es una acción: abre el
                      // modal y deja el desplegable como estaba. Al no guardar
                      // nunca el centinela en el estado, cancelar no deja la
                      // línea en un valor que no existe.
                      if (e.target.value === OPCION_PRODUCTO_NUEVO) {
                        setLineaCreandoProducto(idx);
                        return;
                      }
                      setLinea(idx, { productoId: e.target.value });
                    }}
                    required
                    className="col-span-2 sm:col-span-1 rounded-lg border px-3 py-2 text-sm bg-background"
                  >
                    <option value="" disabled>
                      Selecciona un producto…
                    </option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.activo ? "" : " · borrador"}
                      </option>
                    ))}
                    {puedeCrearProducto && (
                      <option value={OPCION_PRODUCTO_NUEVO}>＋ Producto nuevo…</option>
                    )}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={Number.isNaN(linea.cantidad) ? "" : linea.cantidad}
                    onChange={(e) => setLinea(idx, { cantidad: parseInt(e.target.value, 10) })}
                    required
                    aria-label="Cantidad"
                    className="rounded-lg border px-3 py-2 text-sm bg-background font-mono text-right"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="0,0000"
                    value={Number.isNaN(linea.costoUnitario) ? "" : linea.costoUnitario}
                    onChange={(e) => setLinea(idx, { costoUnitario: parseFloat(e.target.value) })}
                    required
                    aria-label="Costo por unidad en euros, sin IVA"
                    className="rounded-lg border px-3 py-2 text-sm bg-background font-mono text-right"
                  />
                  <select
                    value={linea.ivaPct}
                    onChange={(e) => setLinea(idx, { ivaPct: parseInt(e.target.value, 10) })}
                    aria-label="Tipo de IVA"
                    className="rounded-lg border px-2 py-2 text-sm bg-background font-mono text-right"
                  >
                    {IVA_OPCIONES.map((pct) => (
                      <option key={pct} value={pct}>
                        {pct}%
                      </option>
                    ))}
                  </select>
                  <span className="text-sm font-mono text-right text-muted-foreground">
                    {subtotal !== null ? formatEUR(subtotal) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarLinea(idx)}
                    disabled={lineas.length === 1}
                    aria-label="Quitar línea"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30 justify-self-center"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setLineas((prev) => [...prev, { ...LINEA_NUEVA }])}
            className="text-sm font-medium text-primary hover:underline"
          >
            ＋ Añadir línea
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!puedeEnviar}>
            {isSaving ? "Registrando…" : "Enviar y actualizar inventario"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Las unidades se sumarán al stock y el total se recalcula en la base de datos.
          </p>
        </div>
      </form>

      {lineaCreandoProducto !== null && (
        <ProductoBorradorModal
          onClose={() => setLineaCreandoProducto(null)}
          // El tipo que ya está puesto en ESA línea: es la misma mercancía.
          ivaInicial={lineas[lineaCreandoProducto].ivaPct as IvaPorcentaje}
          onCreado={(producto) => {
            // Se añade a la lista local en vez de recargar del servidor: recargar
            // aquí perdería lo que ya hay escrito en el formulario.
            setProductos((prev) => [...prev, producto]);
            setLinea(lineaCreandoProducto, { productoId: producto.id });
            setLineaCreandoProducto(null);
          }}
        />
      )}
    </div>
  );
}
