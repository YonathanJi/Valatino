import type { IvaPorcentaje } from "@valatino/types";

/**
 * Cómo se llama cada tipo, para que quien rellena el catálogo no tenga que
 * saberse los porcentajes de memoria.
 *
 * Los nombres son los oficiales del impuesto, no inventados: el 21 % es el tipo
 * **general** —el que se aplica salvo que la ley diga otra cosa—, y el 10 % y el
 * 4 % son las excepciones. Por eso elegir mal hacia abajo es lo que duele: se
 * declara menos IVA del que se debe.
 */
export const ETIQUETA_IVA: Record<IvaPorcentaje, string> = {
  21: "general",
  10: "reducido",
  4: "superreducido",
};

/**
 * Ejemplos de la propia tienda, que enseñan más que la definición.
 *
 * Ojo al 21 % de los refrescos: Pony Malta y Jugo Hit **no** van al 10 % de los
 * alimentos porque son bebidas con azúcares añadidos, que salieron del tipo
 * reducido en 2021. Es el error fácil de este catálogo.
 */
export const EJEMPLO_IVA: Record<IvaPorcentaje, string> = {
  21: "refrescos y bebidas azucaradas",
  10: "la mayoría de alimentos",
  4: "pan, leche, huevos, queso, fruta y verdura",
};
