import { validate } from "class-validator";
import { nifValido, normalizarNif } from "@valatino/types";
import { EsNif } from "./es-nif.validator";

class ConNif {
  @EsNif()
  nif!: string;
}

async function errores(nif: string): Promise<number> {
  const dto = new ConNif();
  dto.nif = nif;
  return (await validate(dto)).length;
}

/**
 * Los dígitos de control están calculados a mano, no copiados de una lista, y
 * cada caso dice de dónde sale su letra. Un test de esto que solo compruebe
 * «true/false» no protege de nada: si el algoritmo se rompiera al revés —dando
 * por bueno cualquier NIF— seguiría pasando.
 */
describe("nifValido", () => {
  describe("DNI: letra = TRWAGMYFPDXBNJZSQVHLCKE[n % 23]", () => {
    // 12345678 % 23 = 14 → índice 14 de la tabla = Z
    it.each([
      ["12345678Z", true],
      ["12345678A", false],
      ["00000000T", true], // 0 % 23 = 0 → T
      ["00000001R", true], // 1 % 23 = 1 → R
    ])("%s → %s", async (nif, esperado) => {
      expect(nifValido(nif)).toBe(esperado);
      expect(await errores(nif)).toBe(esperado ? 0 : 1);
    });
  });

  describe("NIE: X→0, Y→1, Z→2 y a partir de ahí es un DNI", () => {
    // X1234567 → 01234567 % 23 = 19 → índice 19 = L
    it.each([
      ["X1234567L", true],
      ["X1234567X", false],
      // Y1234567 → 11234567 % 23 = 10 → índice 10 = X.
      // ⚠️ Aquí me equivoqué a mano y puse P; el test cazó la cuenta, no el
      // código. Que las letras esperadas estén calculadas en el comentario es
      // lo que permitió ver de qué lado estaba el error.
      ["Y1234567X", true],
      ["Y1234567P", false],
    ])("%s → %s", (nif, esperado) => {
      expect(nifValido(nif)).toBe(esperado);
    });
  });

  describe("CIF", () => {
    /**
     * A58818501: la inicial A obliga a control en CIFRA.
     *   pares (8+1+5) = 14
     *   impares doblados y con sus dígitos sumados: 5→1, 8→7, 8→7, 0→0 = 15
     *   suma 29 → (10 − 9) % 10 = 1 → control «1» ✅
     */
    it("acepta A58818501, con el control calculado a mano", () => {
      expect(nifValido("A58818501")).toBe(true);
    });

    /**
     * B12345678 tiene FORMA válida y dígito MALO, y es justo el caso que la BD
     * no puede cazar: su CHECK solo mira la forma.
     *   pares (2+4+6) = 12 · impares 1→2, 3→6, 5→1, 7→5 = 14
     *   suma 26 → (10 − 6) % 10 = 4, así que el control tenía que ser «4»
     */
    it("rechaza B12345678 por el dígito, aunque la forma sea buena", () => {
      expect(nifValido("B12345678")).toBe(false);
      expect(nifValido("B12345674")).toBe(true);
    });

    it("una inicial de sociedad (B) no admite control en letra", () => {
      // El resto para B1234567 es 4 → cifra «4» sí, letra «D» no.
      expect(nifValido("B1234567D")).toBe(false);
    });

    it("una inicial de organismo (P) exige control en letra", () => {
      // P1234567: mismo resto 4 → letra «D» (índice 4 de JABCDEFGHI) sí, cifra no.
      expect(nifValido("P1234567D")).toBe(true);
      expect(nifValido("P12345674")).toBe(false);
    });
  });

  describe("forma", () => {
    it.each([
      "",
      "1234X",
      "1234567Z",
      "123456789",
      "ÑÑ1234567",
      "I1234567J", // la I no es inicial válida de CIF
      "12345678", // sin letra
    ])("rechaza «%s»", (nif) => {
      expect(nifValido(nif)).toBe(false);
    });

    /**
     * ⚠️ La minúscula SÍ se acepta aquí y la BD la rechaza, y no es una
     * discrepancia: `normalizarNif` la sube antes, y el servicio guarda lo
     * normalizado. Obligar al usuario a pulsar mayúsculas sería exigirle que
     * sepa cómo se guarda el dato.
     */
    it("acepta minúsculas y separadores porque los normaliza", () => {
      expect(nifValido("12345678z")).toBe(true);
      expect(nifValido(" 12345678-Z ")).toBe(true);
      expect(normalizarNif(" a58818501 ")).toBe("A58818501");
    });
  });

  it("la cadena vacía pasa el decorador: el guardia de verdad es emisor_fiscal()", async () => {
    expect(await errores("")).toBe(0);
  });
});
