-- ─────────────────────────────────────────────────────────────────────────────
-- 086 · El producto destacado del catálogo (12/09/2026)
--
-- Ensayo:  node scripts/aplicar-sql.mjs --dry supabase/migrations/086_producto_destacado.sql
-- De veras: node scripts/aplicar-sql.mjs --go  supabase/migrations/086_producto_destacado.sql
--
-- ── QUÉ AÑADE Y POR QUÉ ──
--
-- Lo pidió Jonathan el 12/09: en el móvil el catálogo va de dos en dos y, cada seis
-- tarjetas, quiere que aparezca un producto a lo ancho. Rompe la monotonía de una
-- lista larga y da un sitio donde empujar lo que interese esa semana.
--
-- Una sola columna, `destacado`, que es lo que hace falta y nada más:
--
--   · **`boolean` y no un número de orden.** Un `destacado_orden int` permitiría
--     decidir cuál sale primero, pero eso es una pantalla más en el panel y una
--     pregunta más que responder cada vez que se marca uno. El orden que hay —el del
--     catálogo— ya es un orden, y si algún día hace falta gobernarlo se añade
--     entonces. Ver la nota del ORDEN, abajo.
--   · **`NOT NULL DEFAULT false`**, así que los 30 productos de hoy quedan sin
--     destacar y la tienda no cambia hasta que alguien marque uno. Una migración que
--     no altera lo que se ve es una migración que se puede aplicar sin mirar el reloj.
--
-- ⚠️ SIN LÍMITE DE CUÁNTOS. Se coloca uno cada seis tarjetas mientras haya; marcar
-- cinco no rompe nada, solo llena el catálogo de tarjetas grandes. Un CHECK que
-- impidiera el tercero obligaría a un error en el panel para un caso que se ve de un
-- vistazo mirando la tienda — y quien marca los productos es quien la mira.
--
-- ⚠️ NO LLEVA ÍNDICE, y es a propósito: el catálogo entero se pide de una vez (30
-- filas) y el reparto se hace en la web. Un índice sobre un booleano de una tabla de
-- 30 filas es coste de escritura sin ninguna lectura que lo aproveche. El día que
-- esto se consulte con `where destacado` sobre miles de productos, se añade.
-- ─────────────────────────────────────────────────────────────────────────────

alter table productos
  add column if not exists destacado boolean not null default false;

comment on column productos.destacado is
  'Si el producto se pinta a lo ancho en el catálogo del móvil. Se coloca uno cada seis tarjetas; ver lib/productos/destacados.ts en la web.';

-- ── Guardas autoverificantes ─────────────────────────────────────────────────
--
-- ⚠️ Van DESPUÉS del cambio y en la misma transacción: si alguna no se cumple, la
-- migración entera se deshace. Es la costumbre desde la 084.
do $$
declare
  v_tipo    text;
  v_nulos   boolean;
  v_defecto text;
  v_marcados int;
begin
  select data_type, is_nullable = 'YES', column_default
    into v_tipo, v_nulos, v_defecto
  from information_schema.columns
  where table_name = 'productos' and column_name = 'destacado';

  if v_tipo is null then
    raise exception 'La columna destacado no se creó.';
  end if;
  if v_tipo <> 'boolean' then
    raise exception 'destacado es % y debería ser boolean.', v_tipo;
  end if;
  if v_nulos then
    raise exception 'destacado admite NULL, y no debe: sería un tercer estado sin significado.';
  end if;
  if v_defecto is null or v_defecto not like 'false%' then
    raise exception 'destacado no tiene DEFAULT false (tiene %).', coalesce(v_defecto, 'ninguno');
  end if;

  -- ⭐ Lo que de verdad importa comprobar: que esta migración NO cambia la tienda.
  -- Si algún producto quedara marcado, el catálogo cambiaría de aspecto al aplicarla
  -- y nadie habría pedido ese cambio todavía.
  select count(*) into v_marcados from productos where destacado;
  if v_marcados <> 0 then
    raise exception 'Hay % productos ya destacados; se esperaba ninguno.', v_marcados;
  end if;
end $$;

-- Cómo queda, para verlo al aplicar.
select
  count(*) as productos,
  count(*) filter (where destacado) as destacados,
  count(*) filter (where activo) as activos
from productos;
