-- ============================================================
-- 070 — Cuántos documentos hay DE VERDAD detrás de cada bloque
--
-- Lo levantó Jonathan mirando la pantalla, y es un fallo de la 068:
--
-- El desglose deducible salía «4 % → 1 factura · 10 % → 2 · 21 % → 2», y la
-- fila Total dejaba esa columna EN BLANCO. Así que nada contradecía la lectura
-- natural: 1 + 2 + 2 = **5 facturas**. Y facturas hay **DOS**.
--
-- El motivo es que una factura con tres tipos de IVA cuenta en las tres filas:
--   202521188 → 10 % (10 líneas) y 21 % (1)
--   202521893 →  4 % (1)        · 10 % (9) y 21 % (2)
-- La columna `documentos` es correcta fila a fila y **NO ES ADITIVA**. Eso no
-- se puede dejar a que el lector lo deduzca.
--
-- ⚠️ Y no es cosmético: quien presenta un 303 tiene que poder decir cuántas
-- facturas respaldan una cifra. Decir cinco cuando son dos es exactamente el
-- tipo de error silencioso que este informe existe para evitar — el mismo
-- espíritu que «la media nunca se lee sola, al lado va la tasa de respuesta»
-- de la calificación de compra.
--
-- Pasa igual en los otros dos bloques y por eso se arreglan los tres: un pedido
-- con productos al 10 y al 21 cuenta en dos filas del devengado, y un reembolso
-- que devuelve artículos de dos tipos cuenta en dos del rectificado.
--
-- LO ÚNICO QUE CAMBIA de la 068 son tres `count(distinct …)` y tres claves en
-- `totales`. La función sigue siendo de solo lectura y no toca ninguna tabla.
-- ============================================================

create or replace function public.liquidacion_iva(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_devengado    jsonb;
  v_rectificado  jsonb;
  v_deducible    jsonb;
  v_avisos       jsonb := '[]'::jsonb;
  v_arranque     timestamptz;
  v_d_base       numeric(12,2) := 0;
  v_d_cuota      numeric(12,2) := 0;
  v_r_base       numeric(12,2) := 0;
  v_r_cuota      numeric(12,2) := 0;
  v_c_base       numeric(12,2) := 0;
  v_c_cuota      numeric(12,2) := 0;
  -- Documentos DISTINTOS por bloque. No es la suma de los `documentos` de cada
  -- tramo: ver la cabecera de esta migración.
  v_d_docs       integer := 0;
  v_r_docs       integer := 0;
  v_c_docs       integer := 0;
  v_cuantos      integer;
  v_refs         text;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'El periodo necesita fecha de inicio y de fin';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio';
  end if;

  select arranque_fiscal_el into v_arranque from public.ajustes_tienda where id;

  -- ── Devengado: lo repercutido en las ventas del periodo ──────────────────
  --
  -- El filtro es `devengado_el`, NO `created_at`. Y no hace falta filtrar por
  -- estado: un pedido tiene fecha de devengo si y solo si el cobro ocurrió, así
  -- que los PENDIENTE_PAGO y los cancelados antes de cobrar quedan fuera solos.
  with venta as (
    select pv.iva_pct, pv.base, pv.cuota, pv.pedido_id
    from public.pedido_iva pv
    join public.pedidos p on p.id = pv.pedido_id
    where p.devengado_el is not null
      and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_devengado, v_d_base, v_d_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct pedido_id) as documentos
    from venta group by iva_pct
  ) t;

  -- Los pedidos distintos que aportan algo. El join con `pedido_iva` no es
  -- decorativo: deja fuera un pedido sin líneas, que no aporta ningún tramo y
  -- por tanto no debe contarse como documento del periodo.
  select count(distinct p.id) into v_d_docs
  from public.pedidos p
  join public.pedido_iva pv on pv.pedido_id = p.id
  where p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta;

  -- ── Rectificado: las devoluciones del periodo ───────────────────────────
  --
  -- Por la fecha en que se DEVOLVIÓ, no la de la venta: una devolución de enero
  -- sobre una venta de diciembre no puede reabrir un trimestre ya presentado.
  --
  -- El tipo sale de `pedido_items.iva_pct`, el snapshot de lo que se aplicó al
  -- vender (062), nunca del catálogo. `importe` es CON IVA, así que la base se
  -- deriva dividiendo y la cuota se saca RESTANDO.
  with devolucion as (
    select rl.refund_id, i.iva_pct, sum(rl.importe) as con_iva
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
    group by rl.refund_id, i.iva_pct
  ),
  por_documento as (
    select
      refund_id,
      iva_pct,
      round(con_iva / (1 + iva_pct / 100), 2) as base,
      con_iva - round(con_iva / (1 + iva_pct / 100), 2) as cuota
    from devolucion
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_rectificado, v_r_base, v_r_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct refund_id) as documentos
    from por_documento group by iva_pct
  ) t;

  -- Un reembolso = una rectificativa, así que el documento es el `refund_id`.
  select count(distinct rl.refund_id) into v_r_docs
  from public.reembolso_lineas rl
  join public.pedido_items i on i.id = rl.pedido_item_id
  where public.dia_fiscal(rl.created_at) between p_desde and p_hasta;

  -- ── Deducible: lo soportado en las compras del periodo ──────────────────
  --
  -- ⚠️ POR `created_at`, LA FECHA DE REGISTRO, NO POR LA DE LA FACTURA. El IVA
  -- soportado se deduce en el periodo en que la factura queda ANOTADA en el
  -- libro registro; usar la de expedición reabriría trimestres ya presentados
  -- cada vez que llega una factura con retraso. Pendiente de confirmar con la
  -- gestoría (apuntado en ESTADO.md junto a Verifactu).
  --
  -- Aquí los costes son SIN IVA (la 029 guarda `costo_unitario` neto), al
  -- contrario que los precios de venta, así que la cuota se MULTIPLICA.
  with compra as (
    select fci.factura_id, fci.iva_pct,
           sum(fci.cantidad * fci.costo_unitario) as base_bruta
    from public.factura_compra_items fci
    join public.facturas_compra f on f.id = fci.factura_id
    where fci.iva_pct is not null
      and fci.costo_unitario is not null
      and public.dia_fiscal(f.created_at) between p_desde and p_hasta
    group by fci.factura_id, fci.iva_pct
  ),
  por_documento as (
    select factura_id, iva_pct,
           round(base_bruta, 2) as base,
           round(base_bruta * iva_pct / 100, 2) as cuota
    from compra
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_deducible, v_c_base, v_c_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct factura_id) as documentos
    from por_documento group by iva_pct
  ) t;

  -- ⚠️ Los MISMOS filtros que el bloque de arriba, y eso hay que mantenerlo: si
  -- aquí se contaran también las facturas cuyas líneas no tienen tipo de IVA, el
  -- recuento diría 3 facturas para una base que solo sale de 2. Un total que no
  -- casa con lo que hay encima es peor que no ponerlo.
  select count(distinct fci.factura_id) into v_c_docs
  from public.factura_compra_items fci
  join public.facturas_compra f on f.id = fci.factura_id
  where fci.iva_pct is not null
    and fci.costo_unitario is not null
    and public.dia_fiscal(f.created_at) between p_desde and p_hasta;

  -- ── Los avisos ─────────────────────────────────────────────────────────
  --
  -- ⚠️⚠️ NO son decoración, son la mitad del valor del informe. Un número solo
  -- sirve si se sabe qué NO está contando.

  v_avisos := v_avisos || jsonb_build_object(
    'clase', 'sin_facturas_emitidas',
    'gravedad', 'aviso',
    'titulo', 'Liquidado desde los pedidos, no desde facturas emitidas',
    'detalle', 'Todavía no existe la serie de facturas a clientes (Capa 2, pendiente de '
               'confirmar Verifactu). El IVA y los importes son los mismos, pero un 303 se '
               'soporta con el libro de facturas expedidas. Consúltalo con la gestoría antes '
               'de presentar.',
    'cuantos', 0,
    'referencias', '[]'::jsonb
  );

  if v_arranque is null then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'sin_arranque_fiscal',
      'gravedad', 'grave',
      'titulo', 'La tienda sigue en modo pruebas',
      'detalle', 'No se ha marcado el arranque fiscal (TI → Ajustes), así que estas ventas '
                 'son de prueba y pueden borrarse. Nada de esto se presenta.',
      'cuantos', 0, 'referencias', '[]'::jsonb
    );
  elsif public.dia_fiscal(v_arranque) > p_desde then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'periodo_antes_del_arranque',
      'gravedad', 'grave',
      'titulo', 'El periodo empieza antes del arranque fiscal',
      'detalle', 'El arranque fiscal es el ' || to_char(public.dia_fiscal(v_arranque), 'DD/MM/YYYY') ||
                 '. Lo anterior a esa fecha son datos de prueba y no debería declararse.',
      'cuantos', 0, 'referencias', '[]'::jsonb
    );
  end if;

  select count(*), string_agg(numero_factura, ', ' order by numero_factura)
  into v_cuantos, v_refs
  from public.facturas_compra
  where fecha_factura is null
    and public.dia_fiscal(created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_sin_fecha_factura',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' factura(s) de compra sin fecha de expedición',
      'detalle', 'El libro registro de facturas recibidas exige la fecha que puso el '
                 'proveedor. Su IVA SÍ se está deduciendo (el periodo lo decide la fecha de '
                 'registro), pero falta el dato: cógelo del PDF y complétalo en Compras.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  select count(distinct f.id), string_agg(distinct f.numero_factura, ', ')
  into v_cuantos, v_refs
  from public.facturas_compra f
  join public.factura_compra_items fci on fci.factura_id = f.id
  where (fci.iva_pct is null or fci.costo_unitario is null)
    and public.dia_fiscal(f.created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_sin_iva_por_linea',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' factura(s) de compra con líneas sin tipo de IVA',
      'detalle', 'Son anteriores a que las compras guardaran el IVA por línea. Ese IVA '
                 'soportado NO se está deduciendo, así que el resultado sale más alto de lo '
                 'que debería.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  select count(*), string_agg(numero_factura, ', ' order by numero_factura)
  into v_cuantos, v_refs
  from (
    select f.id, f.numero_factura, f.total_iva,
           sum(round(g.base_bruta * g.iva_pct / 100, 2)) as por_tipo
    from public.facturas_compra f
    join (
      select factura_id, iva_pct, sum(cantidad * costo_unitario) as base_bruta
      from public.factura_compra_items
      where iva_pct is not null and costo_unitario is not null
      group by factura_id, iva_pct
    ) g on g.factura_id = f.id
    where public.dia_fiscal(f.created_at) between p_desde and p_hasta
      and f.total_iva is not null
    group by f.id, f.numero_factura, f.total_iva
  ) d
  where abs(d.por_tipo - d.total_iva) > 0.005;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_descuadre_por_tipo',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' factura(s) con céntimos de diferencia al desglosar por tipo',
      'detalle', 'El IVA total de la factura se redondeó de una vez y aquí se redondea por '
                 'tipo, que es como se declara. La diferencia es de céntimos y el desglose '
                 'por tipo es el bueno, pero conviene mirarlo.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  select count(*), string_agg(numero_pedido, ', ' order by numero_pedido)
  into v_cuantos, v_refs
  from public.pedidos p
  where p.estado = 'CANCELADO'
    and p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
    and not exists (select 1 from public.reembolso_lineas rl where rl.pedido_id = p.id);

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'cancelado_ya_cobrado_sin_devolucion',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' pedido(s) cancelados después de cobrar, sin devolución',
      'detalle', 'Su IVA está declarado como devengado —la venta ocurrió— y no consta que se '
                 'haya devuelto el dinero. O se devuelve (y rectifica), o alguien tiene que '
                 'explicar por qué se cobró y se canceló.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  select count(distinct rl.pedido_id), string_agg(distinct p.numero_pedido, ', ')
  into v_cuantos, v_refs
  from public.reembolso_lineas rl
  join public.pedidos p on p.id = rl.pedido_id
  where rl.refund_id like 'retro:%'
    and public.dia_fiscal(rl.created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'devolucion_reconstruida',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' devolución(es) reconstruidas, no registradas en su momento',
      'detalle', 'Se devolvió el dinero antes de que la aplicación apuntara qué artículos. El '
                 'desglose se ha deducido de las líneas del pedido y del precio al que se '
                 'vendieron; es correcto salvo que la devolución fuera parcial y solo se '
                 'anotara el importe.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'zona', 'Europe/Madrid',
    'arranque_fiscal_el', v_arranque,
    'devengado', v_devengado,
    'rectificado', v_rectificado,
    'deducible', v_deducible,
    'totales', jsonb_build_object(
      'devengado_base', v_d_base,
      'devengado_cuota', v_d_cuota,
      -- Lo nuevo de la 070. Van en `totales` y no dentro de cada bloque para no
      -- cambiarle la forma al array de tramos, que ya consume la pantalla.
      'devengado_documentos', v_d_docs,
      'rectificado_base', v_r_base,
      'rectificado_cuota', v_r_cuota,
      'rectificado_documentos', v_r_docs,
      -- Lo repercutido de verdad: las ventas menos lo devuelto.
      'repercutido_base', v_d_base - v_r_base,
      'repercutido_cuota', v_d_cuota - v_r_cuota,
      'deducible_base', v_c_base,
      'deducible_cuota', v_c_cuota,
      'deducible_documentos', v_c_docs,
      -- Positivo = a ingresar. Negativo = a compensar en el periodo siguiente.
      'resultado', (v_d_cuota - v_r_cuota) - v_c_cuota
    ),
    'avisos', v_avisos
  );
end;
$$;

comment on function public.liquidacion_iva(date, date) is
  'Modelo 303 de un periodo: devengado por tipo, rectificado por devoluciones, '
  'deducible de compras, el resultado y los avisos de lo que NO está contando. '
  'Desde la 070 devuelve también los DOCUMENTOS DISTINTOS de cada bloque, que no '
  'son la suma de los de cada tramo. Solo lee; no acumula. Ver la 068 y la 070.';

-- La regla de la 062: revocar a los tres y COMPROBARLO. `create or replace` no
-- restablece los grants, pero no se da por hecho.
revoke execute on function public.liquidacion_iva(date, date) from public, anon, authenticated;

do $comprobar$
begin
  if has_function_privilege('anon', 'public.liquidacion_iva(date, date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liquidacion_iva(date, date)', 'EXECUTE') then
    raise exception 'liquidacion_iva sigue siendo ejecutable desde internet';
  end if;
end
$comprobar$;
