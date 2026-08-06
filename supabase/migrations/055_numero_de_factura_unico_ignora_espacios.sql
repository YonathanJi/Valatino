-- ============================================================
-- 055 — Corrección de la 054: el único del número de factura ignora espacios
--
-- La 054 dejó el índice sobre `upper(numero_factura)` y recortó las filas que ya
-- existían, pero **no las nuevas**. Probado contra el remoto en una transacción
-- revertida: `'202521188'` se rechazaba, pero **`'202521188 '` con un espacio al
-- final entraba** como una factura distinta — exactamente el duplicado que la
-- 054 venía a impedir, y con él el stock duplicado.
--
-- ⚠️ LA LECCIÓN: la API ya recortaba el valor, así que por el formulario esto no
-- podía pasar. Pero **una restricción que depende de que la aplicación limpie el
-- dato no es una restricción**: cualquier otro camino —un script, el editor SQL,
-- un endpoint futuro— se la salta sin enterarse. La garantía tiene que estar en
-- la base de datos y valer por sí sola.
--
-- Se añade además un CHECK contra el número en blanco: `NOT NULL` acepta `''` y
-- `'   '`, y un número vacío no identifica nada.
-- ============================================================

-- Por si alguna fila entró con espacios entre la 054 y esta.
update facturas_compra
set numero_factura = trim(numero_factura)
where numero_factura is distinct from trim(numero_factura);

do $$
declare v_dup int; v_blanco int;
begin
  select count(*) into v_blanco from facturas_compra where trim(numero_factura) = '';
  if v_blanco > 0 then
    raise exception 'Hay % factura(s) con el número en blanco. Rellénalas antes.', v_blanco;
  end if;

  select count(*) into v_dup from (
    select upper(trim(numero_factura))
    from facturas_compra
    group by upper(trim(numero_factura))
    having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'Hay % número(s) repetidos al ignorar espacios. Resuélvelos antes.', v_dup;
  end if;
end $$;

drop index if exists facturas_compra_numero_unico;

create unique index facturas_compra_numero_unico
  on facturas_compra (upper(trim(numero_factura)));

alter table facturas_compra
  drop constraint if exists facturas_compra_numero_no_blanco;

alter table facturas_compra
  add constraint facturas_compra_numero_no_blanco
  check (trim(numero_factura) <> '');

comment on index facturas_compra_numero_unico is
  'Un número de factura identifica una compra. Ignora mayúsculas y espacios: «f-1», «F-1» y «F-1 » son la misma, y admitir las tres duplicaría el stock.';
