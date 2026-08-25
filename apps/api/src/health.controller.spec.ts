/**
 * ⚠️ La huella del despliegue de la API.
 *
 * Lo que se fija aquí es poco pero es lo que se rompe solo: que `status` siga siendo
 * `"ok"` —lo lee el health check de Render, y cambiarlo tumbaría el servicio— y que el
 * commit salga recortado a 7 para poder compararlo de un vistazo con la huella de la
 * web, que usa la misma longitud.
 *
 * ⚠️⚠️ El módulo lee `RENDER_GIT_COMMIT` **al importarse**, no en cada petición: es una
 * constante de arranque. Por eso cada caso hace `resetModules` y vuelve a requerirlo;
 * poner la variable después del import no tendría ningún efecto y el test pasaría sin
 * comprobar nada.
 */
describe("la huella del despliegue en /health", () => {
  const original = process.env.RENDER_GIT_COMMIT;

  afterEach(() => {
    if (original === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = original;
  });

  function cargar(commit?: string) {
    if (commit === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = commit;

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HealthController } = require("./health.controller") as typeof import("./health.controller");
    return new HealthController().check();
  }

  it("dice el commit desplegado, recortado a 7 como la web", () => {
    const r = cargar("7b5d230f1e2a3b4c5d6e7f8091a2b3c4d5e6f708");

    expect(r.commit).toBe("7b5d230");
    expect(r.commit).toHaveLength(7);
  });

  /** En local no existe la variable, y «local» también es la verdad. */
  it("sin la variable dice «local»", () => {
    expect(cargar(undefined).commit).toBe("local");
  });

  /**
   * ⚠️ Esto es lo que de verdad protege algo: Render decide si el servicio está sano
   * por el 200, pero el cuerpo lo lee quien lo lea. Cambiar `status` sería una rotura
   * silenciosa para cualquiera que dependa de él.
   */
  it("sigue diciendo status ok", () => {
    expect(cargar("abc1234").status).toBe("ok");
    expect(cargar(undefined).status).toBe("ok");
  });
});
