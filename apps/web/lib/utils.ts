import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Deja escribir un importe como se escribe en España: **la coma vale igual que
 * el punto**.
 *
 * Va de la mano de una regla del panel: **para euros NO se usa
 * `<input type="number">`**. Ante una coma el navegador devuelve `value = ""`,
 * así que el campo se vacía solo y parece que no responde — que es exactamente
 * el fallo que se arregló en `ReembolsoModal`. Lo correcto es `type="text"` +
 * `inputMode="decimal"` y filtrar aquí al escribir.
 *
 * Se filtra al teclear y no al enviar: un separador, dígitos a los lados y como
 * mucho dos decimales, que es lo que hay en un euro.
 */
export function sanearImporte(valor: string): string {
  const limpio = valor.replace(/[^\d.,]/g, "");
  const sep = limpio.search(/[.,]/);
  if (sep === -1) return limpio.slice(0, 9);

  const entero = limpio.slice(0, sep).slice(0, 9);
  const decimales = limpio
    .slice(sep + 1)
    .replace(/[.,]/g, "")
    .slice(0, 2);
  // Se conserva el separador tal como lo escribió: quien teclea coma espera ver coma.
  return `${entero}${limpio[sep]}${decimales}`;
}
