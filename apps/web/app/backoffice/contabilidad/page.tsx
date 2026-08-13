import { redirect } from "next/navigation";

// El módulo Contabilidad aterriza en su submódulo Liquidación de IVA, igual que
// TI aterriza en Usuarios.
//
// ⭐ Ya hay dos submódulos —el 303 y las facturas emitidas (072-073)— así que
// este redirect ha tenido que ELEGIR, que era justo lo que anticipaba cuando
// había uno solo. Elige el 303 y no las facturas por lo que se hace con cada
// uno: la liquidación se consulta, y las facturas se emiten solas. Se entra aquí
// a mirar cuánto sale a pagar, no a facturar a mano.
//
// Sigue siendo un redirect y NO una página índice que liste los submódulos: con
// dos, esa página seguiría siendo un clic de más para llegar al mismo sitio, y el
// menú lateral ya los enseña. El guardia del módulo vive en el layout, así que
// actúa igual antes de redirigir.
export default function ContabilidadPage() {
  redirect("/backoffice/contabilidad/iva");
}
