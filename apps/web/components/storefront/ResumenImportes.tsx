import { formatEUR } from "@lib/utils";
import { estadoEnvio, faltaParaEnvioGratis, type DatosEnvio } from "@lib/tienda/envio";

/**
 * Subtotal, envío y total. Un solo componente para el carrito y el checkout.
 *
 * ⚠️ Va compartido a propósito. Antes cada pantalla pintaba su propia línea de
 * «Total» y las dos decían lo mismo porque solo había un número; en cuanto hay
 * tres, dos copias son dos oportunidades de que una se olvide del envío y enseñe
 * un total que no es el que se cobra. El importe que se cobra es `total`, y sale
 * de un sitio.
 */
export function ResumenImportes({ subtotal, costeEnvio, envioGratisDesde, total }: DatosEnvio & { total: number }) {
  const estado = estadoEnvio({ subtotal, costeEnvio, envioGratisDesde });
  const falta = faltaParaEnvioGratis({ subtotal, costeEnvio, envioGratisDesde });

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
          <span className="font-medium text-emerald-600 dark:text-emerald-500">Gratis</span>
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

      <div className="flex justify-between font-bold text-lg pt-2 border-t">
        <span>Total</span>
        <span className="text-primary">{formatEUR(total)}</span>
      </div>
    </div>
  );
}
