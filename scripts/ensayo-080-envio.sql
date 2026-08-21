-- ============================================================
-- Ensayo de la 080 de punta a punta, CONTRA EL REMOTO Y REVERTIDO.
--
-- Se corre con:  node scripts/aplicar-sql.mjs --dry <este fichero>
--
-- ⚠️ Va SIEMPRE en --dry. No hay nada aquí que deba quedarse: crea un carrito,
-- una venta, su factura y su devolución, y lo deshace todo. Si se corriera con
-- --go, dejaría una venta falsa en el libro de facturas y quemaría dos
-- correlativos de serie, que no se pueden reutilizar.
--
-- Lo que comprueba, en orden:
--   A · la tarifa: el umbral y el coste
--   B · la venta: total = artículos + envío, y el desglose cuadrado
--   C · la factura: la línea de envío UNA POR TIPO, y que cuadra con lo cobrado
--   D · la devolución íntegra: la rectificativa vuelve a CERO EXACTO
--
-- ⚠️⚠️ EL DETALLE QUE HACE QUE ESTO FUNCIONE, Y QUE SIN ÉL DARÍA UN FALSO
-- NEGATIVO: la factura y la rectificativa las emiten TRIGGERS DE CONSTRAINT
-- DIFERIDOS (`trg_pedido_simplificada` y `trg_reembolso_rectificativa`, los dos
-- `deferrable initially deferred`). O sea que corren AL COMMIT — y en un ensayo
-- revertido el commit no llega nunca.
--
-- Sin forzarlos, los bloques C y D saldrían VACÍOS y se leería como «no se emite
-- la factura», que es justo lo contrario de la verdad. Se fuerzan con
-- `set constraints all immediate`, que dispara lo diferido que esté pendiente en
-- ese punto. Comprobado en pg_trigger: los dos son `tginitdeferred`.
-- ============================================================

-- ── Preparación ──────────────────────────────────────────────────────────────
-- Se toca `ajustes_tienda` dentro de la transacción: al revertir vuelve sola.
update ajustes_tienda set envio_coste = 4.95, envio_gratis_desde = 40.00 where id;

-- ── A · La tarifa ────────────────────────────────────────────────────────────
select 'A · tarifa' as bloque,
       coste_envio_de(9.00)::text   as bajo_umbral_cobra,
       coste_envio_de(39.99)::text  as justo_debajo_cobra,
       coste_envio_de(40.00)::text  as justo_en_umbral_gratis,
       coste_envio_de(55.00)::text  as por_encima_gratis,
       coste_envio_de(0)::text      as carrito_vacio_no_paga,
       coste_envio_de(null)::text   as nulo_no_paga;

-- ── Montaje de un carrito MIXTO, que es el caso que importa ──────────────────
-- Dos tipos de IVA distintos: es donde el reparto del porte tiene que repartir.
do $ensayo$
declare
  v_sesion  uuid := '11111111-1111-4111-8111-111111111111';
  v_carrito uuid;
  v_p10     uuid;
  v_p21     uuid;
  v_pedido  uuid;
begin
  select id into v_p10 from productos where iva_pct = 10 and activo order by precio limit 1;
  select id into v_p21 from productos where iva_pct = 21 and activo order by precio limit 1;

  if v_p10 is null or v_p21 is null then
    raise exception 'El ensayo necesita un producto al 10 %% y otro al 21 %%';
  end if;

  insert into carritos (session_id) values (v_sesion) returning id into v_carrito;

  insert into carrito_items (carrito_id, producto_id, cantidad, precio_unitario)
  select v_carrito, p.id, 2, p.precio from productos p where p.id = v_p10
  union all
  select v_carrito, p.id, 1, p.precio from productos p where p.id = v_p21;

  -- Las reservas que `confirmar_venta` consume. Sin ellas la venta se crea igual
  -- (el update de stock no encuentra nada), pero se montan para que el ensayo se
  -- parezca a lo que pasa de verdad.
  insert into stock_reservas (producto_id, session_id, cantidad, expires_at)
  values (v_p10, v_sesion, 2, now() + interval '15 min'),
         (v_p21, v_sesion, 1, now() + interval '15 min');

  -- El snapshot del porte, igual que lo escribe la API al crear el pago.
  insert into checkout_datos (session_id, email, coste_envio)
  values (v_sesion, 'ensayo080@valatino.es', 4.95);

  v_pedido := confirmar_venta(
    p_session_id          => v_sesion,
    p_usuario_autenticado => null,
    p_user_id             => null,
    p_metodo_pago         => 'stripe',
    p_referencia_pago     => 'pi_ensayo_080',
    p_email_cliente       => 'ensayo080@valatino.es',
    p_envio               => jsonb_build_object(
                               'nombre_destinatario', 'Ensayo 080',
                               'linea1', 'Calle del Arco, 9',
                               'ciudad', 'Mejorada del Campo',
                               'codigo_postal', '28840',
                               'provincia', 'Madrid',
                               'pais', 'ES')
  );

  -- Se guarda para los SELECT de abajo, que van fuera del bloque.
  create temporary table _ensayo (pedido_id uuid) on commit drop;
  insert into _ensayo values (v_pedido);
end;
$ensayo$;

-- ⬇️ Dispara el trigger diferido de la factura simplificada. Ver la cabecera.
set constraints all immediate;

-- ── B · La venta ─────────────────────────────────────────────────────────────
select 'B · venta' as bloque,
       p.numero_pedido,
       (select sum(pi.precio_unitario * pi.cantidad) from pedido_items pi where pi.pedido_id = p.id)::text as articulos,
       p.coste_envio::text as envio,
       p.total::text,
       -- El invariante: el total es artículos + envío, al céntimo.
       (p.total = (select sum(pi.precio_unitario * pi.cantidad) from pedido_items pi where pi.pedido_id = p.id) + p.coste_envio) as total_cuadra,
       -- Y el desglose suma exactamente lo cobrado (si no, confirmar_venta habría abortado).
       (select sum(iv.base + iv.cuota) from pedido_iva iv where iv.pedido_id = p.id)::text as desglose_suma,
       ((select sum(iv.base + iv.cuota) from pedido_iva iv where iv.pedido_id = p.id) = p.total) as desglose_cuadra
from pedidos p join _ensayo e on e.pedido_id = p.id;

-- El reparto del porte, tipo a tipo, y que suma el porte entero.
select 'B · reparto' as bloque,
       r.iva_pct::text, r.articulos::text, r.envio::text
from _ensayo e cross join reparto_envio_pedido(e.pedido_id) r
order by r.iva_pct;

select 'B · reparto suma' as bloque,
       sum(r.envio)::text as suma_envio,
       (sum(r.envio) = (select p.coste_envio from pedidos p join _ensayo x on x.pedido_id = p.id)) as exacto
from _ensayo e cross join reparto_envio_pedido(e.pedido_id) r;

-- ── C · La factura ───────────────────────────────────────────────────────────
-- La emite el trigger de la 072 al crearse la venta devengada. Aquí solo se mira.
select 'C · factura' as bloque,
       f.numero, f.tipo::text, f.base_total::text, f.cuota_total::text, f.total::text,
       (f.total = p.total) as cuadra_con_lo_cobrado,
       jsonb_array_length(f.lineas) as n_lineas
from facturas_emitidas f
join _ensayo e on e.pedido_id = f.pedido_id
join pedidos p on p.id = f.pedido_id;

-- Las líneas, con el envío separado. Cada una tiene que llevar su iva_pct: es lo
-- que el PDF imprime y lo que pide el art. 6.1.f RD 1619/2012.
select 'C · lineas' as bloque,
       l->>'nombre' as nombre,
       l->>'iva_pct' as iva_pct,
       l->>'importe' as importe,
       coalesce(l->>'concepto', 'articulo') as concepto,
       (l ? 'iva_pct') as declara_tipo
from facturas_emitidas f
join _ensayo e on e.pedido_id = f.pedido_id
cross join lateral jsonb_array_elements(f.lineas) l
order by coalesce(l->>'concepto','articulo'), l->>'iva_pct';

-- ── D · La devolución íntegra ────────────────────────────────────────────────
-- Devuelve el pedido entero. El porte se devuelve con él (art. 107 RDL 1/2007),
-- y la rectificativa tiene que volver a CERO EXACTO contra lo declarado.
do $devolucion$
declare
  v_pedido uuid;
begin
  select pedido_id into v_pedido from _ensayo;
  perform reembolsar_pedido_total(v_pedido, null, 're_ensayo_080');
end;
$devolucion$;

-- ⬇️ Dispara el trigger diferido de la rectificativa. Ver la cabecera.
set constraints all immediate;

select 'D · marca del porte' as bloque,
       p.envio_devuelto_en_refund,
       p.envio_devuelto_el::text,
       p.estado::text
from pedidos p join _ensayo e on e.pedido_id = p.id;

-- ⭐⭐ EL NÚMERO QUE IMPORTA. Lo declarado menos lo rectificado, por tipo. Tiene
-- que ser 0,00 / 0,00 en TODOS los tipos: si sobra o falta un céntimo, el 303
-- quedaría con una venta devuelta que no vuelve a cero.
select 'D · vuelta a cero' as bloque,
       iv.iva_pct::text,
       iv.base::text  as declarado_base,
       iv.cuota::text as declarado_cuota,
       coalesce(rect.base, 0)::text  as rectificado_base,
       coalesce(rect.cuota, 0)::text as rectificado_cuota,
       (iv.base  + coalesce(rect.base, 0))::text  as neto_base,
       (iv.cuota + coalesce(rect.cuota, 0))::text as neto_cuota,
       (iv.base + coalesce(rect.base,0) = 0 and iv.cuota + coalesce(rect.cuota,0) = 0) as vuelve_a_cero
from _ensayo e
join pedido_iva iv on iv.pedido_id = e.pedido_id
left join (
  select (d->>'iva_pct')::numeric as iva_pct,
         sum((d->>'base')::numeric)  as base,
         sum((d->>'cuota')::numeric) as cuota
  from facturas_emitidas f
  join _ensayo x on x.pedido_id = f.pedido_id
  cross join lateral jsonb_array_elements(f.desglose) d
  where f.tipo = 'rectificativa'
  group by (d->>'iva_pct')::numeric
) rect on rect.iva_pct = iv.iva_pct
order by iv.iva_pct;

-- La rectificativa lleva su línea de envío en negativo.
select 'D · lineas rectificativa' as bloque,
       f.numero,
       l->>'nombre' as nombre,
       l->>'iva_pct' as iva_pct,
       l->>'importe' as importe
from facturas_emitidas f
join _ensayo e on e.pedido_id = f.pedido_id
cross join lateral jsonb_array_elements(f.lineas) l
where f.tipo = 'rectificativa'
order by f.numero, coalesce(l->>'concepto','articulo'), l->>'iva_pct';

-- Y que no se anotó ninguna anomalía por el camino.
select 'D · eventos' as bloque, ev.evento, count(*)::text as veces
from factura_eventos ev
join facturas_emitidas f on f.id = ev.factura_id
join _ensayo e on e.pedido_id = f.pedido_id
group by ev.evento
union all
select 'D · eventos sin factura', ev.evento, count(*)::text
from factura_eventos ev
where ev.factura_id is null
  and ev.created_at > now() - interval '2 min'
group by ev.evento;
