/**
 * Primer runner de tests de la web.
 *
 * Hasta ahora la web no tenía ninguno —el hueco más grande del proyecto, con la
 * API por 299 tests— y la primera vez que hizo falta de verdad fue al generalizar
 * el agrupado de variantes: es lógica pura que ya funcionaba en producción y que
 * ven los clientes, así que refactorizarla a ciegas era el mal negocio.
 *
 * De momento cubre **lógica pura** (`lib/`), que es donde está el criterio del
 * negocio y donde un test vale más por línea. Para probar componentes habría que
 * añadir `jsdom` y `@testing-library/react`; no se hace hasta que se necesite.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Mismos alias que el tsconfig, o los imports de los tests no resuelven.
  moduleNameMapper: {
    "^@components/(.*)$": "<rootDir>/components/$1",
    "^@lib/(.*)$": "<rootDir>/lib/$1",
  },
  testMatch: ["<rootDir>/lib/**/*.spec.ts", "<rootDir>/components/**/*.spec.ts"],
};
