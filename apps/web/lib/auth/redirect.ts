/**
 * Saneado de destinos de redirección tras autenticar.
 *
 * `redirectTo` llega por query string, así que es entrada del usuario. Filtrar
 * con `startsWith("/")` a secas no basta: "//evil.com" y "/\evil.com" empiezan
 * por "/" pero tanto `new URL()` como el router del navegador los interpretan
 * como URL protocol-relative — un redirect abierto a otro dominio ejecutado
 * justo después de iniciar sesión.
 */
export function destinoSeguro(redirectTo: string | null | undefined, porDefecto: string): string {
  if (!redirectTo) return porDefecto;
  if (!redirectTo.startsWith("/")) return porDefecto;
  if (redirectTo.startsWith("//") || redirectTo.startsWith("/\\")) return porDefecto;
  return redirectTo;
}
