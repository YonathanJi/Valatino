"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Direccion {
  id: string;
  nombre_destinatario: string;
  linea1: string;
  linea2?: string;
  ciudad: string;
  codigo_postal: string;
  provincia: string;
  es_predeterminada: boolean;
}

const emptyDireccion = (): Omit<Direccion, "id" | "es_predeterminada"> => ({
  nombre_destinatario: "",
  linea1: "",
  linea2: "",
  ciudad: "",
  codigo_postal: "",
  provincia: "",
});

export default function PerfilPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDireccion());
  const [saving, setSaving] = useState(false);

  const loadSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return null;
    }
    return session;
  };

  const loadDirecciones = async () => {
    const session = await loadSession();
    if (!session) return;

    const res = await fetch(`${API_URL}/direcciones`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: "include",
    });
    if (res.ok) {
      setDirecciones((await res.json()) as Direccion[]);
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
      await loadDirecciones();
      setIsLoading(false);
    };
    void init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const session = await loadSession();
    if (!session) { setSaving(false); return; }

    const body = {
      ...form,
      linea2: form.linea2 || undefined,
    };

    try {
      const url = editingId
        ? `${API_URL}/direcciones/${editingId}`
        : `${API_URL}/direcciones`;
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(editingId ? "Dirección actualizada" : "Dirección creada");
        setShowForm(false);
        setEditingId(null);
        setForm(emptyDireccion());
        void loadDirecciones();
      } else {
        throw new Error("Error al guardar");
      }
    } catch {
      toast.error("No se pudo guardar la dirección");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const session = await loadSession();
    if (!session) return;

    const res = await fetch(`${API_URL}/direcciones/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: "include",
    });

    if (res.ok) {
      setDirecciones((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dirección eliminada");
    } else {
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

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold mb-4">Mi perfil</h1>
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <p className="text-sm text-muted-foreground">Correo electrónico</p>
          <p className="font-medium">{user?.email}</p>
        </div>
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
              <div className="space-y-1">
                <Label htmlFor="ciudad">Ciudad</Label>
                <Input
                  id="ciudad"
                  required
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp">Código postal</Label>
                <Input
                  id="cp"
                  required
                  value={form.codigo_postal}
                  onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  required
                  value={form.provincia}
                  onChange={(e) => setForm({ ...form, provincia: e.target.value })}
                />
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
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Guardar"}
              </Button>
            </div>
          </form>
        )}

        {direcciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes direcciones guardadas todavía.
          </p>
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
