import { formatEUR } from "@lib/utils";
import {
  estadoEnvio,
  faltaParaEnvioGratis,
  envioGratisPorCodigo,
  type DatosEnvio,
} from "@lib/tienda/envio";

/**
 * Subtotal, envío y total. Un solo componente para el carrito y el checkout.
 *
 * ⚠️ Va compartido a propósito. Antes cada pantalla pintaba su propia línea de
 * «Total» y las dos decían lo mismo porque solo había un número; en cuanto hay
 * tres, dos copias son dos oportunidades de que una se olvide del envío y enseñe
 * un total que no es el que se cobra. El importe que se cobra es `total`, y sale
 * de un sitio.
 */
export function ResumenImportes({
  subtotal,
  costeEnvio,
  envioGratisDesde,
  envioDescontado,
  descuento = 0,
  codigoDescuento = null,
  total,
}: DatosEnvio & {
  total: number;
  /** El descuento del cupón, en positivo. Se RESTA (083). */
  descuento?: number;
  /** El código aplicado, para decir de dónde viene el descuento. */
  codigoDescuento?: string | null;
}) {
  const datos = { subtotal, costeEnvio, envioGratisDesde, envioDescontado };
  const estado = estadoEnvio(datos);
  const falta = faltaParaEnvioGratis(datos);
  const porCodigo = envioGratisPorCodigo(datos);

  return (
    <div className="border-t pt-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{formatEUR(subtotal)}</span>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Envío</span>
        {estado === "gratis" ? (
          /* El «Gratis» se dice porque el porte es 0, no porque se haya deducido
             del umbral. Ver el test que lo fija en envio.spec.ts. */
          <span className="font-medium text-emerald-600 dark:text-emerald-500">
            Gratis
            {/* ⚠️ Y se dice DE DÓNDE viene, porque son dos cosas distintas: pasar del
                umbral es un logro del carrito y el código es un logro del cliente.
                `envioGratisPorCodigo` lo decide con lo que dice la API, nunca
                comparando el subtotal con el umbral. */}
            {porCodigo && envioDescontado ? (
              <span className="ml-1 font-normal text-xs text-muted-foreground">
                (te ahorras {formatEUR(envioDescontado)})
              </span>
            ) : null}
          </span>
        ) : (
          <span>{formatEUR(costeEnvio)}</span>
        )}
      </div>

      {/* El empujón, y solo cuando hay algo que ofrecer. `aria-live` porque el
          texto cambia al añadir o quitar unidades sin que la página navegue: sin
          esto, quien use lector de pantalla no se enteraría de que ya lo tiene. */}
      {estado === "con_umbral" && falta !== null && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Te faltan <span className="font-medium text-foreground">{formatEUR(falta)}</span> para
          el envío gratis
        </p>
      )}

      {/*
        ⚠️ La fila del descuento va DESPUÉS del envío y antes del total, igual que en
        la factura: el cliente ve el camino hasta lo que paga. Y solo aparece cuando
        hay algo que restar — un «Descuento 0,00 €» sería ruido.
      */}
      {descuento > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Descuento
            {codigoDescuento ? (
              <span className="ml-1 font-mono text-xs">{codigoDescuento}</span>
            ) : null}
          </span>
          <span className="font-medium text-emerald-600 dark:text-emerald-500">
            −{formatEUR(descuento)}
          </span>
        </div>
      )}

      <div className="flex justify-between font-bold text-lg pt-2 border-t">
        <span>Total</span>
        <span className="text-primary">{formatEUR(total)}</span>
      </div>
    </div>
  );
}
