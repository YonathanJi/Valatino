-- ============================================================
-- 081 — La identidad pública de la tienda y sus canales de contacto
--
-- ⚠️⚠️ HOY LA TIENDA NO TIENE DUEÑO CONOCIDO, Y ESO ES DOS PROBLEMAS A LA VEZ.
--
-- El **legal**: el art. 10 de la LSSI-CE (Ley 34/2002) obliga a quien vende por
-- internet a publicar su nombre o razón social, su NIF y su domicilio «de forma
-- permanente, fácil, directa y gratuita». Comprobado el 2026-08-22: ninguno de
-- los tres aparece en toda la parte pública de la web. El pie dice «© 2026
-- Valatino» y dos enlaces.
--
-- El **comercial, que es el que cuesta dinero hoy**: un desconocido que se
-- plantea dejar su tarjeta busca justo eso —quién vende y cómo preguntarle— y no
-- encuentra nada. Una tienda sin dueño identificable es el perfil exacto de una
-- estafa de dropshipping, y a esta le sobra trazabilidad fiscal por dentro para
-- parecerlo por fuera.
--
-- ── §0.1 · ⚠️⚠️ EL CONTACTO QUE SE PUBLICA HOY NO RECIBE NADA ────────────────
--
-- La política de privacidad manda ejercer los derechos del RGPD escribiendo a
-- `soporte@valatino.es`. Y **`valatino.es` NO TIENE REGISTROS MX** (comprobado
-- con `nslookup -type=MX`, y ya está documentado en `email.service.ts` y en
-- ESTADO.md): ese buzón no existe, así que toda solicitud de acceso, supresión o
-- portabilidad **rebota**.
--
-- Es una obligación legal enrutada a la nada, y es invisible porque nadie prueba
-- el correo ENTRANTE — solo el saliente, que sí funciona vía SendGrid.
--
-- Por eso los canales son un dato editable y no una constante: hay que poder
-- poner **una dirección que de verdad reciba** hoy mismo, sin desplegar, y
-- cambiarla el día que `valatino.es` tenga buzón propio.
--
-- ── §0.2 · POR QUÉ ESTO VA EN `ajustes_tienda` Y NO EN EL CÓDIGO ─────────────
--
-- Misma razón que el IBAN (046) y que los datos fiscales (071): es un dato del
-- negocio que quien lleva la tienda tiene que poder cambiar sin tocar código ni
-- Render. Un teléfono de atención en una constante de TypeScript es un despliegue
-- cada vez que cambia.
--
-- ⭐ Y la identidad NO se duplica: se reutilizan las columnas `emisor_*` que ya
-- puso la 071. Son el mismo dato —quién vende— y tenerlo dos veces sería la vía
-- de que la factura diga un NIF y el aviso legal diga otro.
--
-- ── §0.3 · ⚠️ ESTO PUBLICA EL NIF Y EL DOMICILIO DE UNA PERSONA FÍSICA ───────
--
-- Hay que decirlo claro porque no tiene vuelta atrás fácil: quien emite es una
-- autónoma, así que su NIF y su domicilio pasan a estar en una página web
-- indexable. **La LSSI lo exige** y son los mismos datos que ya van impresos en
-- cada factura, así que no es información nueva para quien compra — pero sí es
-- nueva para un buscador.
--
-- Si algún día se quiere separar el domicilio fiscal del domicilio publicado
-- (p. ej. al contratar un domicilio social), lo que hay que añadir es una columna
-- `publica_direccion` que caiga a la fiscal cuando esté vacía. Hoy no se añade
-- porque sería una casilla más que rellenar para no cambiar nada.
--
-- ── §0.4 · LA FRONTERA DE LO PÚBLICO VIVE EN LA BASE, NO EN UN `select` ──────
--
-- `identidad_publica()` (§2) devuelve EXACTAMENTE lo que puede salir a internet.
-- Podría haberse hecho con un `select` de columnas en el servicio de la API, y se
-- ha hecho aquí a propósito: `ajustes_tienda` guarda también el IBAN de cobro y
-- el titular de la cuenta, y un `select *` escrito con prisa en un endpoint
-- público los pondría en la web. Con la función, esa equivocación no compila:
-- el endpoint no tiene otra cosa que devolver.
--
-- Es el mismo criterio que el mapeo campo a campo del detalle de pedido: «lo que
-- no está aquí no sale».
-- ============================================================

-- ── §1 · Los canales de contacto ─────────────────────────────────────────────

alter table public.ajustes_tienda
  add column if not exists contacto_email    text,
  add column if not exists contacto_whatsapp text,
  add column if not exists contacto_telefono text;

comment on column public.ajustes_tienda.contacto_email is
  'La dirección que DE VERDAD recibe correo, para atención al cliente y para los derechos del RGPD. NO tiene por qué ser del dominio: valatino.es no tiene MX y ahí no llega nada.';
comment on column public.ajustes_tienda.contacto_whatsapp is
  'Teléfono de WhatsApp en formato internacional sin signos (p. ej. 34600111222). Se usa para construir el enlace wa.me.';
comment on column public.ajustes_tienda.contacto_telefono is
  'Teléfono de voz, si se atiende. Opcional: publicar uno que nadie coge es peor que no publicarlo.';

/**
 * ⚠️ El WhatsApp se guarda SOLO en dígitos y con prefijo de país, porque es lo
 * que exige `wa.me/<numero>`: un `+34 600 11 12 22` en ese enlace da un error de
 * WhatsApp que el cliente lee como «este número no existe».
 *
 * La API lo normaliza antes de guardar (quita espacios, guiones y el `+`); esto
 * es el cinturón por si algún día se escribe por otra puerta. Entre 8 y 15
 * dígitos es el rango de la E.164.
 */
alter table public.ajustes_tienda drop constraint if exists ajustes_contacto_whatsapp_forma;
alter table public.ajustes_tienda add constraint ajustes_contacto_whatsapp_forma
  check (contacto_whatsapp is null or contacto_whatsapp ~ '^[1-9][0-9]{7,14}$');

-- La forma del correo, no su existencia. Que exista no lo puede saber un CHECK;
-- lo sabrá Jonathan cuando se escriba a sí mismo, que es la prueba que hay que
-- hacer y que nadie hizo con `soporte@valatino.es`.
alter table public.ajustes_tienda drop constraint if exists ajustes_contacto_email_forma;
alter table public.ajustes_tienda add constraint ajustes_contacto_email_forma
  check (contacto_email is null or contacto_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$');

-- ── §2 · ⭐ LO QUE PUEDE SALIR A INTERNET, Y NADA MÁS ────────────────────────
--
-- Ver §0.4. Esta función ES la frontera: el endpoint público no tiene acceso a
-- otra cosa.
--
-- ⚠️ Devuelve siempre un objeto, nunca NULL, y `identificada` dice si los datos
-- de la LSSI están completos. No se copia el criterio de `emisor_fiscal()` —que
-- devuelve NULL si falta algo— porque aquí NULL no serviría: la página de aviso
-- legal tiene que poder decir «falta configurar esto» en vez de romperse, y el
-- pie tiene que poder pintar el contacto aunque la identidad esté a medias.

create or replace function public.identidad_publica()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    -- Identidad del prestador del servicio (art. 10 LSSI-CE). Son las MISMAS
    -- columnas que firman las facturas: un solo dato, no dos que puedan diferir.
    'nombre',        a.emisor_nombre,
    'nif',           a.emisor_nif,
    'direccion',     a.emisor_direccion,
    'codigo_postal', a.emisor_codigo_postal,
    'ciudad',        a.emisor_ciudad,
    'provincia',     a.emisor_provincia,
    'pais',          a.emisor_pais,
    -- Canales
    'email',         a.contacto_email,
    'whatsapp',      a.contacto_whatsapp,
    'telefono',      a.contacto_telefono,
    -- ¿Está completa la identidad que exige la LSSI? Los tres imprescindibles.
    'identificada',  (a.emisor_nombre is not null
                      and a.emisor_nif is not null
                      and a.emisor_direccion is not null),
    -- ¿Hay ALGÚN canal por el que preguntar antes de comprar?
    'contactable',   (a.contacto_email is not null
                      or a.contacto_whatsapp is not null
                      or a.contacto_telefono is not null)
  )
  from public.ajustes_tienda a
  where a.id;
$$;

comment on function public.identidad_publica() is
  'La identidad del vendedor y sus canales de contacto, para el aviso legal y la página de contacto. ES LA FRONTERA DE LO PÚBLICO: devuelve exactamente lo que puede salir a internet, y por eso el endpoint público llama a esto y no lee ajustes_tienda (que guarda también el IBAN de cobro).';

/**
 * ⚠️⚠️ AQUÍ SÍ SE CONCEDE A `anon`, Y ES DELIBERADO. Todas las demás funciones de
 * este esquema revocan a `anon` y `authenticated` porque exponen dinero o datos
 * de clientes. Esta es la excepción y tiene que serlo: la LSSI exige que estos
 * datos sean de acceso «permanente, fácil, directo y gratuito», o sea
 * literalmente accesibles sin identificarse.
 *
 * Lo que la hace segura no es quién la llama, es QUÉ DEVUELVE (§0.4).
 */
grant execute on function public.identidad_publica() to anon, authenticated;

-- ── §3 · Sembrar el contacto que YA funciona ─────────────────────────────────
--
-- ⚠️ Aquí sí se siembra, al contrario que en la 071 con el NIF, y la diferencia
-- importa: un NIF no me lo puedo inventar, pero `valatino@hotmail.com` **ya está
-- en el código** —`carrito.service.ts` lo publica como el correo para pedidos
-- grandes— así que ya es un canal de atención al cliente de facto. Ponerlo aquí
-- no inventa nada: recoge lo que ya se está haciendo, y evita que la tienda se
-- quede otra vez sin ningún contacto que funcione mientras alguien rellena el
-- panel.
--
-- Se pone SOLO si está vacío, para no pisar nada que se haya configurado ya.
update public.ajustes_tienda
set contacto_email = 'valatino@hotmail.com'
where id and contacto_email is null;
