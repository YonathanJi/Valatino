import { BadRequestException } from "@nestjs/common";
import { provinciaPorCP } from "@valatino/types";
import { municipioCanonico } from "./municipios";

/**
 * Resuelve la pareja (código postal, municipio) a lo que se va a guardar: el
 * municipio con su **nombre oficial** del INE y la provincia **derivada del CP**.
 *
 * La provincia que llegue del cliente se ignora. Es un dato deducible —los dos
 * primeros dígitos del CP son su código de provincia— y dejar que la escriba
 * quien rellena el formulario es lo que llenó la columna de «españa».
 *
 * ⚠️⚠️ VIVÍA SUELTA DENTRO DE `direcciones.service.ts`, Y ESO TUVO UN COSTE REAL.
 * La tienda validaba así sus direcciones de envío desde la 041, pero **los datos
 * fiscales no pasaban por aquí**: ni el emisor de TI → Ajustes ni el receptor de
 * una factura completa. El resultado se vio en producción el 2026-08-14, dos
 * veces y con el mismo origen:
 *
 *   - el domicilio del negocio se guardó con la población «españa», y salió
 *     impreso en la primera factura real (`Calle del Arco, 9 · 28840 españa`);
 *   - el receptor de `VALF202600100` quedó como «Mejorada del campo», con
 *     minúscula, mientras el pedido de la misma venta guardaba la forma oficial.
 *
 * Lo más cabreante es que `municipioCanonico("28001", "españa")` **ya devolvía
 * `null`**: la comprobación que lo habría cazado existía, estaba probada, y la
 * ruta de las facturas no la llamaba. Por eso ahora está aquí y no dentro de un
 * servicio: un documento contable no puede validar menos que una etiqueta de
 * envío.
 *
 * Lanza `BadRequestException` a propósito, aunque esto viva en `common/datos`:
 * los tres llamadores son rutas HTTP y lo único que cambiaría al devolver un
 * resultado en vez de lanzar es que cada uno tendría que acordarse de mirarlo.
 */
export function ubicacionParaGuardar(codigoPostal: string, ciudad: string) {
  const provincia = provinciaPorCP(codigoPostal);
  if (!provincia) {
    throw new BadRequestException("El código postal no es válido");
  }

  const municipio = municipioCanonico(codigoPostal, ciudad);
  if (!municipio) {
    throw new BadRequestException(
      `«${ciudad}» no es un municipio de ${provincia}, que es la provincia del código postal ${codigoPostal}`,
    );
  }

  return { ciudad: municipio, codigo_postal: codigoPostal.trim(), provincia };
}
