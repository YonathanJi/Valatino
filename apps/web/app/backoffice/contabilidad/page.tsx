import { redirect } from "next/navigation";

// El módulo Contabilidad aterriza en su submódulo Liquidación de IVA, igual que
// TI aterriza en Usuarios. Hoy es el único que hay; cuando lleguen las facturas
// a clientes (Capa 2) serán otro submódulo y este redirect decidirá cuál es la
// puerta de entrada.
//
// Se hace con un redirect y NO con una página índice que liste los submódulos:
// con uno solo, esa página sería un menú de un elemento —un clic de más para
// llegar al mismo sitio—. El guardia del módulo vive en el layout, así que actúa
// igual antes de redirigir.
export default function ContabilidadPage() {
  redirect("/backoffice/contabilidad/iva");
}
