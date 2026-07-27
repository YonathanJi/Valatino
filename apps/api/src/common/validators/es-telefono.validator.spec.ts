import { validate } from "class-validator";
import { IsOptional, IsString } from "class-validator";
import { normalizarTelefono, telefonoValido, formatearTelefono } from "@valatino/types";
import { EsTelefono } from "./es-telefono.validator";

class ConTelefono {
  @IsOptional()
  @IsString()
  @EsTelefono()
  telefono?: string;
}

async function errores(valor: unknown): Promise<string[]> {
  const dto = new ConTelefono();
  (dto as { telefono?: unknown }).telefono = valor;
  const res = await validate(dto);
  return res.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe("normalizarTelefono", () => {
  it("deja 9 dígitos con los formatos que la gente teclea", () => {
    for (const escrito of [
      "600112233",
      "600 11 22 33",
      "600-11-22-33",
      "600.11.22.33",
      "+34600112233",
      "+34 600 11 22 33",
      "0034600112233",
      "(600) 112233",
    ]) {
      expect(normalizarTelefono(escrito)).toBe("600112233");
    }
  });

  it("no confunde un fijo de 9 dígitos que empieza por 34 con un prefijo", () => {
    // 34 al principio es Lleida/Tarragona; solo se quita si sobran dígitos.
    expect(normalizarTelefono("934112233")).toBe("934112233");
    expect(normalizarTelefono("+34934112233")).toBe("934112233");
  });
});

describe("telefonoValido", () => {
  it("acepta móviles y fijos españoles", () => {
    for (const ok of ["600112233", "711112233", "812345678", "934112233", "+34 600 11 22 33"]) {
      expect(telefonoValido(ok)).toBe(true);
    }
  });

  it("rechaza lo que no es un teléfono español", () => {
    for (const mal of [
      "12345678",      // 8 dígitos
      "6001122334",    // 10 dígitos
      "500112233",     // no empieza por 6/7/8/9
      "abcdefghi",
      "",
      "+1 202 555 0134", // internacional: la tienda solo envía a España
    ]) {
      expect(telefonoValido(mal)).toBe(false);
    }
  });
});

describe("formatearTelefono", () => {
  it("agrupa para leerlo", () => {
    expect(formatearTelefono("600112233")).toBe("600 11 22 33");
  });

  it("devuelve el valor tal cual si no es un teléfono válido, en vez de mentir", () => {
    expect(formatearTelefono("no-es-un-telefono")).toBe("no-es-un-telefono");
    expect(formatearTelefono(null)).toBe("");
    expect(formatearTelefono(undefined)).toBe("");
  });
});

describe("@EsTelefono", () => {
  it("no se queja de un número válido, ni con prefijo ni con espacios", async () => {
    expect(await errores("600112233")).toHaveLength(0);
    expect(await errores("+34 600 11 22 33")).toHaveLength(0);
  });

  it("deja pasar la cadena vacía: significa «borrar el teléfono»", async () => {
    expect(await errores("")).toHaveLength(0);
  });

  it("deja pasar undefined, para que @IsOptional siga decidiendo", async () => {
    const dto = new ConTelefono();
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rechaza un número mal formado con un mensaje que dice qué se espera", async () => {
    const msgs = await errores("12345");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("teléfono español válido");
  });

  it("rechaza un valor que no es cadena", async () => {
    expect((await errores(600112233)).length).toBeGreaterThan(0);
  });
});
