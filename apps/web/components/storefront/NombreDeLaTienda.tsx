import { MARCA_PROPORCION, MARCA_TRAZOS, MARCA_VIEWBOX } from "@lib/marca/trazos.generado";

/**
 * El nombre de la tienda con **la V dibujada haciendo de inicial**: la marca del
 * favicon, y «alatino» en texto.
 *
 * Lo propuso Jonathan el 12/09 combinando dos ideas —poner el logo al lado del
 * nombre, y agrandar el nombre— en una mejor que las dos: que el logo **sea** la
 * primera letra. Así la cabecera y la pestaña enseñan exactamente la misma marca, que
 * es lo que hace que se reconozca.
 *
 * ── LO QUE HAY QUE SABER PARA TOCARLO ──
 *
 * ⚠️⚠️ LOS TRAZOS NO ESTÁN AQUÍ, se importan de `lib/marca/trazos.generado.ts`, que
 * escribe `scripts/generar-marca.mjs` — el mismo que dibuja el favicon. Copiarlos a
 * este fichero sería el mismo dato en dos sitios: el día que cambie el logo, cambiaría
 * la pestaña y la cabecera se quedaría con la V vieja **durante meses**, hasta que
 * alguien las mirase juntas. Es la piedra con la que este proyecto lleva tropezando
 * (`API_URL`, el título, el correo de contacto).
 *
 * ⚠️ La V se mide en `em` y no en píxeles: así crece y encoge **con el texto**, y el
 * día que se cambie el tamaño del nombre no hay que acordarse de nada. El 0,72 es la
 * altura de una mayúscula respecto al cuerpo de la letra en la tipografía del sitio;
 * con eso la V se apoya en la misma línea que la «a» de al lado en vez de flotar.
 *
 * ⚠️⚠️ ACCESIBILIDAD: el enlace lleva `aria-label="Valatino"` y el SVG va
 * `aria-hidden`, porque lo que un lector de pantalla tiene que anunciar es el nombre
 * de la tienda —no «imagen» y luego «alatino»—. Sin esto, quien navega por voz oiría
 * el sitio llamarse «alatino», que es exactamente el tipo de detalle que no se nota
 * hasta que alguien no puede usar la tienda.
 */
export function NombreDeLaTienda({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-baseline ${className}`}>
      <svg
        viewBox={MARCA_VIEWBOX}
        fill="currentColor"
        /**
         * ⚠️ `inline-block` dentro de un contenedor `items-baseline` apoya su borde
         * inferior en la línea base del texto, que es justo donde se apoya una letra.
         * Con `self-center` —que era lo primero que puse— la V quedaba centrada
         * respecto a la altura del renglón y flotaba medio píxel por encima de la
         * «a», que es el tipo de detalle que no se sabe nombrar pero se ve.
         */
        className="inline-block"
        style={{ height: "0.72em", width: `${(0.72 * MARCA_PROPORCION).toFixed(3)}em` }}
      >
        {MARCA_TRAZOS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {/*
        ⚠️⚠️ ESTE MARGEN NEGATIVO ES LO QUE HACE QUE «Valatino» SE LEA COMO UNA PALABRA
        y no como un logo seguido de un texto. Y hace falta más de lo que parece por la
        forma de la marca: **el trazo diagonal termina arriba**, así que en la mitad
        baja del SVG —justo a la altura donde empieza la «a»— hay espacio vacío. El
        `viewBox` es rectangular y no sabe de eso; el ojo sí, y ve un hueco.

        ⭐ Empezó en 0,04 em, que era lo que cerraba el margen del `viewBox` medido
        sobre el papel. Jonathan lo vio en pantalla: «creo que se puede juntar un
        poquito». Es la clase de ajuste que no sale de una fórmula — el hueco óptico
        depende de la silueta, no de la caja.
      */}
      <span className="-ml-[0.1em]">alatino</span>
    </span>
  );
}
