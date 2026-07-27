"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { UsersRound, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { PageHeader } from "@components/backoffice/PageHeader";
import { EstadoBadge } from "@components/backoffice/EstadoBadge";
import { formatEUR } from "@lib/utils";
import { usePuede } from "@components/backoffice/PermisosProvider";
import type { ClienteDetalle } from "@valatino/types";

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—";

export function ClienteDetallePanel() {
  const puedeEditar = usePuede("clientes", "edicion");
  const puedeEliminar = usePuede("clientes", "total");

  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const [form, setForm] = useState({ nombre: "", telefono: "", documento: "" });

  const cargar = async () => {
    try {
      const d = await apiFetch<ClienteDetalle>(`/admin/clientes/${id}`);
      setDetalle(d);
      setForm({
        nombre: d.cliente.nombre ?? "",
        telefono: d.cliente.telefono ?? "",
        documento: d.cliente.documento ?? "",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el cliente");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [id]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await apiFetch(`/admin/clientes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: form.nombre.trim() || undefined,
          telefono: form.telefono,
          documento: form.documento,
        }),
      });
      toast.success("Datos del cliente actualizados");
      void cargar();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    const nPedidos = detalle?.pedidos.length ?? 0;
    const aviso =
      `¿Eliminar la cuenta de ${detalle?.cliente.email}?\n\n` +
      (nPedidos > 0
        ? `Sus ${nPedidos} pedido(s) SE CONSERVAN para la contabilidad, pero dejarán de estar asociados a una cuenta.\n\n`
        : "") +
      "Perderá el acceso y sus direcciones guardadas se borrarán. Si vuelve a registrarse con el mismo correo, recuperará su historial.";

    if (!window.confirm(aviso)) return;

    setEliminando(true);
    try {
      const r = await apiFetch<{ pedidos_conservados: number }>(`/admin/clientes/${id}`, {
        method: "DELETE",
      });
      toast.success(
        r.pedidos_conservados > 0
          ? `Cuenta eliminada. Se conservan ${r.pedidos_conservados} pedido(s).`
          : "Cuenta eliminada",
      );
      router.push("/backoffice/clientes");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar la cuenta");
      setEliminando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!detalle) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">Cliente no encontrado.</div>
    );
  }

  const { cliente, pedidos, direcciones } = detalle;
  const inputCls = "w-full rounded-lg border bg-background px-3 py-2 text-sm";

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <PageHeader
        icon={UsersRound}
        back={{ href: "/backoffice/clientes", label: "Clientes" }}
        title={cliente.nombre ?? cliente.email}
        description={`${cliente.email} · cliente desde ${fmtFecha(cliente.cliente_desde)}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pedidos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{cliente.pedidos}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total gastado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEUR(Number(cliente.total_gastado))}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border bg-card p-4 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Último pedido</p>
          <p className="mt-1 text-sm font-medium">{fmtFecha(cliente.ultimo_pedido)}</p>
        </div>
      </div>

      {/* Datos de contacto */}
      {!puedeEditar && (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          Tienes acceso de solo lectura a este módulo: puedes consultar la ficha, pero no
          modificarla.
        </p>
      )}

      <form onSubmit={guardar} className="space-y-4 rounded-xl border bg-card p-6">
        <div>
          <h2 className="font-semibold">Datos de contacto</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            El correo no se puede cambiar: es su usuario de acceso y con él se vinculan sus pedidos.
          </p>
        </div>

        {/* Bloqueado de una pieza con solo lectura: dejar teclear un cambio que
            no se puede guardar es peor que no ofrecerlo. */}
        <fieldset disabled={!puedeEditar} className="space-y-4 disabled:opacity-70">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nombre</span>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                minLength={2}
                maxLength={200}
                placeholder="Nombre y apellidos"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Correo</span>
              <input value={cliente.email} disabled className={`${inputCls} opacity-60`} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Teléfono</span>
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                maxLength={30}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Documento (DNI/NIE)</span>
              <Input
                value={form.documento}
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
                maxLength={40}
              />
            </label>
          </div>

          {puedeEditar && (
            <div className="flex justify-end">
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
        </fieldset>
      </form>

      {/* Pedidos */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Pedidos ({pedidos.length})</h2>
        </div>
        {pedidos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Este cliente todavía no ha comprado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Nº pedido</th>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{p.numero_pedido}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("es-ES")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatEUR(Number(p.total))}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direcciones */}
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Direcciones guardadas ({direcciones.length})</h2>
        </div>
        {direcciones.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Sin direcciones guardadas. Las de sus pedidos quedan en cada pedido.
          </div>
        ) : (
          <ul className="divide-y">
            {direcciones.map((d) => (
              <li key={d.id} className="p-4 text-sm">
                <p className="font-medium">
                  {d.nombre_destinatario}
                  {d.es_predeterminada && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Predeterminada
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {d.linea1}
                  {d.linea2 ? `, ${d.linea2}` : ""} · {d.codigo_postal} {d.ciudad}, {d.provincia}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeEliminar && (
        <div className="rounded-xl border border-red-200 bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-red-700">Eliminar cuenta</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pedidos.length > 0
                  ? `Sus ${pedidos.length} pedido(s) se conservan para la contabilidad; solo se borra el acceso.`
                  : "Se borra su acceso y sus direcciones guardadas."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void eliminar()}
              disabled={eliminando}
              className="shrink-0 border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {eliminando ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
