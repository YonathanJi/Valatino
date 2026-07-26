"use client";

import { createContext, useContext, useMemo } from "react";
import { nivelAlcanza, nivelDe } from "@valatino/types";
import type { NivelPermiso, PermisoModulo, StaffModulo, UserRole } from "@valatino/types";

interface Contexto {
  userId: string;
  rol: UserRole;
  permisos: PermisoModulo[];
}

const PermisosContext = createContext<Contexto | null>(null);

/**
 * Pone los permisos del usuario a disposición de las pantallas cliente.
 *
 * Los resuelve el layout del backoffice en el servidor (staff_modulos, nunca
 * metadata) y bajan una sola vez. Antes cada pantalla se los buscaba a su
 * manera: unas preguntaban a la API «¿soy admin?» después de montar —con lo que
 * los botones aparecían de golpe al llegar la respuesta—, otras lo deducían
 * rebuscándose a sí mismas dentro de una lista.
 *
 * Esto solo decide qué se ENSEÑA. La API vuelve a comprobar el permiso en cada
 * petición, así que equivocarse aquí no abre nada.
 */
export function PermisosProvider({
  userId,
  rol,
  permisos,
  children,
}: Contexto & { children: React.ReactNode }) {
  const valor = useMemo(() => ({ userId, rol, permisos }), [userId, rol, permisos]);
  return <PermisosContext.Provider value={valor}>{children}</PermisosContext.Provider>;
}

function usarContexto(): Contexto {
  const ctx = useContext(PermisosContext);
  if (!ctx) {
    throw new Error("usePermisos solo funciona dentro del layout del backoffice");
  }
  return ctx;
}

export function usePermisos() {
  const { userId, rol } = usarContexto();
  return { userId, rol, esAdmin: rol === "admin" };
}

/** Nivel en un módulo; el admin es `total` en todo sin tener filas. */
export function useNivel(modulo: StaffModulo): NivelPermiso | null {
  const { rol, permisos } = usarContexto();
  if (rol === "admin") return "total";
  if (rol !== "asesor") return null;
  return nivelDe(permisos, modulo);
}

/** ¿Alcanza para esta acción? Para apagar botones que la API rechazaría. */
export function usePuede(modulo: StaffModulo, nivel: NivelPermiso): boolean {
  return nivelAlcanza(useNivel(modulo), nivel);
}
