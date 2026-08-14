-- ============================================================
-- 075 — El aviso del 303 que pasó de incompleto a FALSO
--
-- ⚠️⚠️ EL PROBLEMA, Y POR QUÉ ERA URGENTE: la 068 puso un aviso incondicional que
-- decía «todavía no existe la serie de facturas a clientes (Capa 2, pendiente de
-- confirmar Verifactu)». Cuando se escribió era verdad. Desde la 072 la serie
-- existe, se emite sola en cada venta y hay libro con su cadena de huellas.
--
-- Un aviso incompleto es un aviso mejorable. Un aviso FALSO en un informe que se
-- presenta a Hacienda es peor que no tener aviso: quien lo lea deja de creerse
-- los demás. Eso es lo que se arregla aquí, y es lo único de este sistema que
-- hoy afirmaba algo que no es cierto.
--
-- ⭐⭐ Y LA TRAMPA DE ARREGLARLO MAL: borrar el aviso a secas. Con la tabla de
-- facturas vacía, el informe se quedaría CALLADO — y callar cuando no hay ni una
-- factura para ventas que sí declaran su IVA es tranquilidad falsa, que es
-- exactamente el fallo que se está corrigiendo, con el signo cambiado. El aviso
-- no se borra: se convierte en uno que CUENTA lo que falta y se calla solo cuando
-- de verdad no falta nada.
--
-- Hoy mismo se puede comprobar que no calla de más: hay 2 ventas devengadas y 0
-- facturas (la 074 borró las de prueba al cambiarles el formato), así que tiene
-- que gritar 2.
--
-- ── Y de paso, la otra mitad de la verdad ────────────────────────────────────
-- ESTADO.md documentaba que el libro y el 303 discrepan cuando hay una devolución
-- sin rectificativa: el libro dice que se facturaron 5,10 € y el 303 ya lo neteó.
-- «Los dos tienen razón por separado y no cuadran entre sí.»
--
-- Eso estaba escrito en un fichero markdown que el informe no lee. Se añade como
-- segundo aviso, porque la diferencia entre «lo sabemos» y «lo sabe quien firma»
-- es justo lo que estos avisos existen para cubrir. Se callará solo el día que la
-- rectificativa exista — no hay que acordarse de quitarlo.
--
-- ⚠️ Esto NO implementa la rectificativa. Solo hace que el informe declare que
-- falta, con cuántas y cuáles.
--
-- Respecto a la 070 cambia UN bloque de avisos y nada más. Los tres importes, los
-- recuentos de documentos y los otros seis avisos van palabra por palabra.
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
  -- tramo: ver la cabecera de la 070.
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

  -- ── ⭐ AQUÍ ESTABA EL AVISO FALSO (la 068 y la 070 lo ponían siempre) ────────
  --
  -- Lo que decía: «todavía no existe la serie de facturas a clientes». Existe
  -- desde la 072. Lo que dice ahora: cuántas ventas de este periodo declaran su
  -- IVA aquí sin tener documento que lo soporte.
  --
  -- ⚠️⚠️ EL PREDICADO ES EL MISMO QUE USA `emitir_facturas_pendientes` (073), y
  -- tiene que serlo: sin ningún documento simplificado ni completo de esa venta.
  -- Si el aviso contara una cosa y el botón «emitir las que faltan» emitiera
  -- otra, el panel se contradiría a sí mismo — el informe diría «faltan 3» y el
  -- botón emitiría 2, sin que nadie pudiera saber cuál de los dos miente.
  --
  -- No se mira `vigente`: una simplificada sustituida NO cuenta en el libro, pero
  -- su venta SÍ tiene documento (la completa que la sustituyó). Filtrar por
  -- vigencia haría que cada canje inventara una venta sin facturar.
  select count(*), string_agg(p.numero_pedido, ', ' order by p.numero_pedido)
  into v_cuantos, v_refs
  from public.pedidos p
  where p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
    and not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id = p.id and f.tipo in ('simplificada', 'completa')
    );

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'venta_sin_factura',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' venta(s) devengadas sin factura',
      'detalle', 'Estas ventas declaran su IVA en esta liquidación y no tienen documento en '
                 'el libro de facturas expedidas, que es con lo que se soporta un 303. Cada '
                 'venta emite su simplificada sola, así que esto solo pasa con las anteriores '
                 'a que el emisor estuviera configurado. Se arregla en Contabilidad → '
                 'Facturas, con «emitir las que faltan».',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- ── Devoluciones sin rectificativa: el libro y esta liquidación discrepan ───
  --
  -- Mismo criterio de documento y de periodo que el bloque `rectificado` de
  -- arriba: un reembolso es una rectificativa, y la fecha que manda es la de la
  -- devolución. `cuantos` cuenta REEMBOLSOS y `referencias` lista los pedidos
  -- afectados, así que pueden no coincidir en número — un pedido admite varias
  -- devoluciones parciales sucesivas, y cada una necesita la suya.
  select count(distinct rl.refund_id), string_agg(distinct p.numero_pedido, ', ')
  into v_cuantos, v_refs
  from public.reembolso_lineas rl
  join public.pedidos p on p.id = rl.pedido_id
  where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
    and not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id  = rl.pedido_id
        and f.tipo       = 'rectificativa'
        and f.refund_id  = rl.refund_id
    );

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'devolucion_sin_rectificativa',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' devolución(es) sin factura rectificativa',
      'detalle', 'Esta liquidación YA descuenta su IVA (bloque rectificado), pero el libro de '
                 'facturas expedidas sigue diciendo que se facturó el importe entero. Los dos '
                 'tienen razón por separado y no cuadran entre sí: la rectificativa es el '
                 'documento que los reconcilia y todavía no se emite. La diferencia es esta, '
                 'y está contada.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

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
      -- De la 070. Van en `totales` y no dentro de cada bloque para no cambiarle
      -- la forma al array de tramos, que ya consume la pantalla.
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
  'Desde la 075 los avisos de facturación son CONDICIONALES y se callan solos: '
  '`venta_sin_factura` cuenta las ventas sin documento (mismo predicado que '
  '`emitir_facturas_pendientes`) y `devolucion_sin_rectificativa` declara la '
  'discrepancia entre el libro y esta liquidación. Solo lee; no acumula.';

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
