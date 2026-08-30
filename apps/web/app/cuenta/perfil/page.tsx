"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  codigoPostalValido,
  formatearTelefono,
  normalizarTelefono,
  provinciaPorCP,
  telefonoValido,
  type PedidoDeCliente,
  type PaginatedResponse,
} from "@valatino/types";
import { useMunicipios } from "@lib/hooks/useMunicipios";
import { EstadoPedido } from "@components/storefront/EstadoPedido";

const ESTADOS_PAGADOS = ["PROCESANDO", "ENVIADO", "ENTREGADO"];
const ESTADOS_EN_CURSO = ["PROCESANDO", "ENVIADO"];

interface Direccion {
  id: string;
  nombre_destinatario: string;
  linea1: string;
  linea2?: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  telefono: string | null;
  es_predeterminada: boolean;
}

const emptyDireccion = () => ({
  nombre_destinatario: "",
  linea1: "",
  linea2: "",
  ciudad: "",
  codigo_postal: "",
  provincia: "",
  telefono: "",
});

export default function PerfilPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string; created_at?: string } | null>(null);
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeCliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDireccion());
  const [saving, setSaving] = useState(false);

  const provinciaDelForm = provinciaPorCP(form.codigo_postal);
  const { municipios, cargando: cargandoMunicipios } = useMunicipios(form.codigo_postal);

  /** Cambiar de provincia invalida la localidad elegida, así que se limpia. */
  const cambiarCP = (cp: string) => {
    const provinciaNueva = provinciaPorCP(cp);
    setForm((prev) => ({
      ...prev,
      codigo_postal: cp,
      provincia: provinciaNueva ?? "",
      ciudad: provinciaNueva === provinciaDelForm ? prev.ciudad : "",
    }));
  };

  const loadDirecciones = async () => {
    try {
      setDirecciones(await apiFetch<Direccion[]>("/direcciones"));
    } catch {
      // sin sesión: el init ya redirige a /login
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      if (!supabaseUser) {
        router.push("/login");
        return;
      }
      setUser(supabaseUser);
      // Solo clientes llegan aquí: el layout de /cuenta redirige al staff
      // a /backoffice/perfil (áreas separadas).
      await loadDirecciones();
      try {
        const json = await apiFetch<PaginatedResponse<PedidoDeCliente>>("/pedidos?limit=50");
        setPedidos(json.data ?? []);
      } catch {
        // sin pedidos o API inalcanzable: el resumen se muestra a cero
      }
      setIsLoading(false);
    };
    void init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const body = {
      ...form,
      linea2: form.linea2 || undefined,
      telefono: normalizarTelefono(form.telefono),
    };

    try {
      await apiFetch(editingId ? `/direcciones/${editingId}` : "/direcciones", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });

      toast.success(editingId ? "Dirección actualizada" : "Dirección creada");
      setShowForm(false);
      setEditingId(null);
      setForm(emptyDireccion());
      void loadDirecciones();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la dirección");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/direcciones/${id}`, { method: "DELETE" });
      setDirecciones((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dirección eliminada");
    } catch {
      toast.error("No se pudo eliminar la dirección");
    }
  };

  const startEdit = (d: Direccion) => {
    setForm({
      nombre_destinatario: d.nombre_destinatario,
      linea1: d.linea1,
      linea2: d.linea2 ?? "",
      ciudad: d.ciudad,
      codigo_postal: d.codigo_postal,
      provincia: d.provincia,
      telefono: d.telefono ?? "",
    });
    setEditingId(d.id);
    setShowForm(true);
  };

  if (isLoading) {
    return (
      <main className="space-y-8 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
        ))}
      </main>
    );
  }

  const numPedidos = pedidos.length;
  // Descontando lo devuelto. Un pedido REEMBOLSADO del todo ya queda fuera por
  // su estado, pero una devolución PARCIAL no cambia el estado —sigue en
  // ENVIADO— y sumaría el importe entero: el cliente vería «te devolvimos
  // 2,50 €» en Mis pedidos y un total gastado que no se ha enterado.
  const totalGastado = pedidos
    .filter((p) => ESTADOS_PAGADOS.includes(p.estado))
    .reduce((s, p) => s + Math.max(Number(p.total) - Number(p.total_reembolsado ?? 0), 0), 0);
  const enCurso = pedidos.filter((p) => ESTADOS_EN_CURSO.includes(p.estado)).length;
  const ultimoPedido =
    [...pedidos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0] ?? null;
  const clienteDesde = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    : null;
  // No guardamos nombre de perfil: se toma de la dirección predeterminada (o
  // la primera) y, si aún no hay direcciones guardadas, de lo que el cliente
  // escribió en su último pedido. Si nada de eso existe, saludo genérico.
  const nombre =
    direcciones.find((d) => d.es_predeterminada)?.nombre_destinatario ??
    direcciones[0]?.nombre_destinatario ??
    ultimoPedido?.envio_nombre ??
    null;

  // Dirección que el cliente puso en su último pedido (snapshot), por si aún no
  // la tiene guardada: se muestra y se puede guardar con un clic.
  const dirUltimoPedido =
    ultimoPedido?.envio_nombre && ultimoPedido?.envio_linea1
      ? {
          nombre_destinatario: ultimoPedido.envio_nombre,
          linea1: ultimoPedido.envio_linea1,
          linea2: ultimoPedido.envio_linea2 ?? "",
          ciudad: ultimoPedido.envio_ciudad ?? "",
          codigo_postal: ultimoPedido.envio_codigo_postal ?? "",
          provincia: ultimoPedido.envio_provincia ?? "",
          telefono: ultimoPedido.envio_telefono ?? "",
        }
      : null;

  const guardarDireccionPedido = async () => {
    if (!dirUltimoPedido) return;
    try {
      await apiFetch("/direcciones", {
        method: "POST",
        body: JSON.stringify({ ...dirUltimoPedido, linea2: dirUltimoPedido.linea2 || undefined }),
      });
      toast.success("Dirección guardada en tu perfil");
      void loadDirecciones();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la dirección");
    }
  };

  return (
    <main className="space-y-8">
      {/* Saludo */}
      <section className="space-y-1">
        <h1 className="text-2xl font-bold">{nombre ? `Hola, ${nombre} 👋` : "Hola 👋"}</h1>
        {clienteDesde && (
          <p className="text-sm text-muted-foreground">Cliente desde {clienteDesde}</p>
        )}
      </section>

      {/* Resumen */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pedidos</p>
          <p className="text-2xl font-bold tabular-nums">{numPedidos}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total gastado</p>
          <p className="text-2xl font-bold tabular-nums">{formatEUR(totalGastado)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">En curso</p>
          <p className="text-2xl font-bold tabular-nums">{enCurso}</p>
        </div>
      </section>

      {/* Último pedido */}
      {ultimoPedido && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Último pedido</h2>
          <Link
            href="/cuenta/pedidos"
            className="block rounded-xl border bg-card p-4 hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-mono text-muted-foreground">
                #{ultimoPedido.numero_pedido ?? ultimoPedido.id.slice(0, 8).toUpperCase()}
              </p>
              <EstadoPedido estado={ultimoPedido.estado} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="font-bold">{formatEUR(Number(ultimoPedido.total))}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(ultimoPedido.created_at).toLocaleDateString("es-ES")}
              </p>
            </div>
          </Link>
        </section>
      )}

      {/* Accesos rápidos */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/"
          className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          🛍️ Seguir comprando
        </Link>
        <Link
          href="/cuenta/pedidos"
          className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          📦 Mis pedidos
        </Link>
        {/*
          Los favoritos viven aquí, al lado de lo demás de la persona. Es lo que
          sustituye al corazón de la barra, que desde el 30/08 solo sale a quien NO
          ha iniciado sesión.
        */}
        <Link
          href="/favoritos"
          className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          ❤️ Favoritos
        </Link>
        {/*
          ⚠️⚠️ ESTO ERA UN `mailto:` CON LA DIRECCIÓN ESCRITA A MANO, y era la
          TERCERA copia del correo de contacto: ni la del panel ni la que estaba mal,
          una distinta —`valatino@hotmail.com`— que nadie sabía que existía. El 30/08
          se corrigió el correo en TI → Ajustes y esta página siguió mandando a la
          suya, porque no lee de ningún sitio.
          ⭐ Se arregla quitando la copia, no actualizándola: se enlaza a `/contacto`,
          que lee la dirección y el WhatsApp del panel. Un dato que no está escrito
          aquí no se puede quedar viejo.
        */}
        <Link
          href="/contacto"
          className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted transition-colors"
        >
          ✉️ Contacto
        </Link>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Direcciones de envío</h2>
          {!showForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setForm(emptyDireccion());
                setEditingId(null);
                setShowForm(true);
              }}
            >
              + Nueva dirección
            </Button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 mb-4 space-y-4">
            <h3 className="font-medium">
              {editingId ? "Editar dirección" : "Nueva dirección"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nombre">Nombre del destinatario</Label>
                <Input
                  id="nombre"
                  required
                  value={form.nombre_destinatario}
                  onChange={(e) => setForm({ ...form, nombre_destinatario: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="linea1">Dirección</Label>
                <Input
                  id="linea1"
                  required
                  value={form.linea1}
                  onChange={(e) => setForm({ ...form, linea1: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="linea2">Piso / Apartamento (opcional)</Label>
                <Input
                  id="linea2"
                  value={form.linea2}
                  onChange={(e) => setForm({ ...form, linea2: e.target.value })}
                />
              </div>
              {/* El CP manda: la provincia se deduce de sus dos primeros
                  dígitos y la localidad se elige entre los municipios de esa
                  provincia. Mismo criterio que el checkout. */}
              <div className="space-y-1">
                <Label htmlFor="cp">Código postal</Label>
                <Input
                  id="cp"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="28001"
                  required
                  value={form.codigo_postal}
                  onChange={(e) => cambiarCP(e.target.value)}
                />
                {form.codigo_postal !== "" && !codigoPostalValido(form.codigo_postal) && (
                  <p className="text-xs text-destructive">
                    Cinco dígitos de un código postal español.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  value={provinciaDelForm ?? ""}
                  placeholder="—"
                  readOnly
                  tabIndex={-1}
                  className="bg-muted/50 text-muted-foreground"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="ciudad">Localidad</Label>
                <select
                  id="ciudad"
                  required
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                  disabled={!provinciaDelForm || cargandoMunicipios}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">
                    {!provinciaDelForm
                      ? "Escribe primero el código postal"
                      : cargandoMunicipios
                        ? "Cargando…"
                        : `Elige tu localidad (${municipios.length})`}
                  </option>
                  {municipios.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="telefono">Teléfono de contacto</Label>
                <Input
                  id="telefono"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="600 11 22 33"
                  maxLength={20}
                  required
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                />
                {form.telefono !== "" && !telefonoValido(form.telefono) ? (
                  <p className="text-xs text-destructive">
                    Introduce un teléfono español de 9 dígitos (móvil o fijo).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Para avisarte de la entrega de los pedidos que envíes aquí.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyDireccion());
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !telefonoValido(form.telefono) ||
                  !codigoPostalValido(form.codigo_postal) ||
                  form.ciudad === ""
                }
              >
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Guardar"}
              </Button>
            </div>
          </form>
        )}

        {direcciones.length === 0 ? (
          dirUltimoPedido && !showForm ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Esta es la dirección de tu último pedido. Guárdala para usarla más rápido la próxima vez.
              </p>
              <div className="space-y-1">
                <p className="font-medium">{dirUltimoPedido.nombre_destinatario}</p>
                <p className="text-sm text-muted-foreground">
                  {dirUltimoPedido.linea1}
                  {dirUltimoPedido.linea2 ? `, ${dirUltimoPedido.linea2}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {dirUltimoPedido.codigo_postal} {dirUltimoPedido.ciudad}
                  {dirUltimoPedido.provincia ? `, ${dirUltimoPedido.provincia}` : ""}
                </p>
              </div>
              <Button size="sm" onClick={() => void guardarDireccionPedido()}>
                Guardar en mis direcciones
              </Button>
            </div>
          ) : (
            !showForm && (
              <p className="text-sm text-muted-foreground">
                No tienes direcciones guardadas todavía.
              </p>
            )
          )
        ) : (
          <div className="space-y-3">
            {direcciones.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <p className="font-medium truncate">{d.nombre_destinatario}</p>
                  <p className="text-sm text-muted-foreground">
                    {d.linea1}
                    {d.linea2 ? `, ${d.linea2}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {d.codigo_postal} {d.ciudad}, {d.provincia}
                  </p>
                  {d.telefono ? (
                    <p className="text-sm text-muted-foreground">
                      Tel. {formatearTelefono(d.telefono)}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700">
                      Sin teléfono — hará falta al pagar
                    </p>
                  )}
                  {d.es_predeterminada && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Predeterminada
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(d)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(d.id)}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
