"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UsersRound, Search, Pencil, Eye } from "lucide-react";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { PageHeader } from "@components/backoffice/PageHeader";
import { usePuede } from "@components/backoffice/PermisosProvider";
import { formatearTelefono } from "@valatino/types";
import type { Cliente } from "@valatino/types";

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ClientesPage() {
  // La ficha se consulta con lectura, así que el enlace se queda: lo que cambia
  // es el icono, porque un lápiz promete editar.
  const puedeEditar = usePuede("clientes", "edicion");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setClientes(await apiFetch<Cliente[]>("/admin/clientes"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudieron cargar los clientes");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.email, c.nombre, c.documento, c.telefono]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [busqueda, clientes]);

  const totales = useMemo(
    () => ({
      conCuenta: clientes.filter((c) => c.tiene_cuenta).length,
      sinCuenta: clientes.filter((c) => !c.tiene_cuenta).length,
      ingresos: clientes.reduce((s, c) => s + Number(c.total_gastado), 0),
    }),
    [clientes],
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={UsersRound}
        title="Clientes"
        description="Quién compra en la tienda, con su historial y sus datos de contacto"
      />

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Con cuenta</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totales.conCuenta}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Sin cuenta (invitados)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totales.sinCuenta}</p>
            </div>
            <div className="col-span-2 rounded-xl border bg-card p-4 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Facturado a clientes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatEUR(totales.ingresos)}
              </p>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por correo, nombre o documento…"
              aria-label="Buscar clientes"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="rounded-xl border bg-card">
            <div className="border-b p-4">
              <h2 className="font-semibold">
                {busqueda ? `${filtrados.length} de ${clientes.length}` : `${clientes.length}`}{" "}
                {clientes.length === 1 ? "cliente" : "clientes"}
              </h2>
            </div>

            {isLoading ? (
              <div className="space-y-3 p-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : filtrados.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {clientes.length === 0
                  ? "Todavía no hay clientes. Aparecerán solos con la primera compra."
                  : "Ningún cliente coincide con la búsqueda."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Cliente</th>
                      <th className="px-4 py-3 text-left font-medium">Contacto</th>
                      <th className="px-4 py-3 text-right font-medium">Pedidos</th>
                      <th className="px-4 py-3 text-right font-medium">Total gastado</th>
                      <th className="px-4 py-3 text-left font-medium">Último pedido</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c) => (
                      <tr key={c.user_id ?? c.email} className="border-b last:border-0 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium">{c.nombre ?? "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                          {!c.tiene_cuenta && (
                            <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              Sin cuenta
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <p>{formatearTelefono(c.telefono) || "—"}</p>
                          <p className="text-xs">{c.documento ?? "sin documento"}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{c.pedidos}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatEUR(Number(c.total_gastado))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {fmtFecha(c.ultimo_pedido)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.tiene_cuenta && c.user_id ? (
                            <Link
                              href={`/backoffice/clientes/${c.user_id}`}
                              title={puedeEditar ? "Ver / editar" : "Ver ficha"}
                              aria-label={`Ver ${c.nombre ?? c.email}`}
                              className="inline-flex rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {puedeEditar ? (
                                <Pencil className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Link>
                          ) : (
                            <span
                              className="text-xs text-muted-foreground"
                              title="Compró como invitado: no tiene cuenta que gestionar"
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            «Sin cuenta» es quien compró como invitado y no se registró: se identifica solo por su
            correo, así que no tiene ficha que editar. Si se registra con ese mismo correo, sus
            pedidos se le vinculan automáticamente.
          </p>
        </>
      )}
    </div>
  );
}
