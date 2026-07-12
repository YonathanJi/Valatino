-- 021: Número de pedido legible — AAMMDD + código método de pago + 4 dígitos aleatorios
-- Ej.: 260712016478 → 26-07-12, stripe (01), sufijo 6478
-- Códigos: 01 stripe, 02 paypal, 00 desconocido (reservados 03+ para futuros métodos)

alter table public.pedidos
  add column if not exists numero_pedido varchar(12);

-- Backfill de pedidos existentes a partir de su fecha de creación (hora de Madrid)
do $$
declare
  fila record;
  candidato varchar(12);
  intentos int;
begin
  for fila in
    select id, created_at, metodo_pago
    from public.pedidos
    where numero_pedido is null
  loop
    intentos := 0;
    loop
      candidato :=
        to_char(fila.created_at at time zone 'Europe/Madrid', 'YYMMDD')
        || case fila.metodo_pago
             when 'stripe' then '01'
             when 'paypal' then '02'
             else '00'
           end
        || lpad(floor(random() * 10000)::text, 4, '0');

      exit when not exists (
        select 1 from public.pedidos where numero_pedido = candidato
      );

      intentos := intentos + 1;
      if intentos > 20 then
        raise exception 'No se pudo generar numero_pedido único para %', fila.id;
      end if;
    end loop;

    update public.pedidos set numero_pedido = candidato where id = fila.id;
  end loop;
end $$;

alter table public.pedidos
  alter column numero_pedido set not null;

create unique index if not exists pedidos_numero_pedido_key
  on public.pedidos (numero_pedido);
