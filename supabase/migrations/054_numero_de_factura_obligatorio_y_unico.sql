-- ============================================================
-- 054 — El número de factura de compra es obligatorio y único
--
-- Pedido por Jonathan al registrar la segunda compra. Hasta ahora
-- `numero_factura` era opcional y sin restricción, así que se podía registrar
-- la misma compra dos veces sin que nada avisara.
--
-- ⚠️ LO QUE ESTO PROTEGE DE VERDAD no es la estética del dato: **registrar dos
-- veces la misma factura duplica el stock**. `registrar_factura_compra`
-- incrementa `stock_disponible` por cada línea, así que un doble envío —un
-- doble clic, un reintento, o alguien que no recuerda si ya la subió— mete
-- unidades que no existen en el almacén, y eso no se descubre hasta que falta
-- mercancía para servir un pedido. El número único es el único dato que
-- identifica una compra de forma estable.
--
-- ⚠️ DECISIÓN CONSCIENTE: la unicidad es **global**, no por proveedor. En
-- contabilidad un número de factura es único **por emisor**, así que dos
-- proveedores distintos pueden emitir legítimamente el mismo número y aquí el
-- segundo sería rechazado. Se acepta a sabiendas: hoy hay un proveedor, y la
-- protección contra el doble registro vale más que ese caso. Si algún día
-- estorba, lo correcto es un único sobre `(proveedor_id, upper(numero_factura))`
-- — pero ojo, `proveedor_id` es NULLABLE y en un índice único los NULL son
-- distintos entre sí, así que las facturas sin proveedor dejarían de estar
-- protegidas. Habría que exigir el proveedor antes de hacer ese cambio.
--
-- La unicidad va sobre `upper(numero_factura)`: «f-2026-1» y «F-2026-1» son la
-- misma factura, y dejar que entren las dos sería no haber puesto nada.
-- ============================================================

-- Normalizar lo que ya hay antes de restringir: un espacio de sobra convertiría
-- dos veces el mismo número en dos números distintos.
update facturas_compra
set numero_factura = trim(numero_factura)
where numero_factura is distinct from trim(numero_factura);

-- Comprobar ANTES de alterar: si hubiera filas sin número o repetidas, el
-- `alter` fallaría con un error de Postgres que no dice qué arreglar.
do $$
declare
  v_sin int;
  v_dup int;
begin
  select count(*) into v_sin from facturas_compra
  where numero_factura is null or trim(numero_factura) = '';

  if v_sin > 0 then
    raise exception
      'Hay % factura(s) de compra sin número. Rellénalas antes de aplicar esta migración.', v_sin;
  end if;

  select count(*) into v_dup from (
    select upper(numero_factura)
    from facturas_compra
    group by upper(numero_factura)
    having count(*) > 1
  ) d;

  if v_dup > 0 then
    raise exception
      'Hay % número(s) de factura repetidos. Resuélvelos antes de aplicar esta migración.', v_dup;
  end if;
end $$;

alter table facturas_compra
  alter column numero_factura set not null;

create unique index if not exists facturas_compra_numero_unico
  on facturas_compra (upper(numero_factura));

comment on column facturas_compra.numero_factura is
  'Número de la factura del proveedor. Obligatorio y único (sin distinguir mayúsculas): es lo que impide registrar la misma compra dos veces y duplicar el stock.';
