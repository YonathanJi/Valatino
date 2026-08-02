-- ============================================================
-- 048 — Qué método usó de verdad el cliente
--
-- Reportado por Jonathan: pagó con Bizum y el correo decía «Tarjeta (Stripe)».
--
-- `metodo_pago` guarda la PASARELA ('stripe', 'paypal', 'transferencia'), y eso
-- estaba bien mientras Stripe solo sirviera tarjetas. Desde que también sirve
-- Bizum, decir «Stripe» ya no describe cómo pagó nadie: Stripe es por dónde
-- pasó el dinero, no la forma de pagar. Y «Tarjeta (Stripe)» es directamente
-- falso cuando fue un Bizum.
--
-- Se añade el detalle en vez de ensanchar `metodo_pago` porque son dos cosas
-- distintas y las dos hacen falta: **la pasarela decide por dónde se reembolsa**
-- (`ReembolsosService` la mira para saber si puede cobrar en Stripe), y el
-- detalle es lo que se le cuenta al cliente. Mezclarlas obligaría a que el
-- reembolso supiera que 'bizum' también significa Stripe.
-- ============================================================

alter table public.pedidos
  add column if not exists metodo_detalle text;

comment on column public.pedidos.metodo_detalle is
  'Forma de pago concreta segun la pasarela (card, bizum, paypal...). NULL en los pedidos anteriores, que se muestran por su pasarela.';

-- La escribe la API al confirmar el pago, cuando ya sabe lo que dijo Stripe.
--
-- El `metodo_detalle is null` del WHERE no es una precaución vacía: el webhook
-- de Stripe se reintenta, y lo que consta es lo que se cobró la primera vez.
create or replace function public.anotar_metodo_detalle(
  p_pedido_id uuid,
  p_detalle   text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.pedidos
  set metodo_detalle = nullif(trim(p_detalle), '')
  where id = p_pedido_id
    and metodo_detalle is null;
$$;

revoke execute on function public.anotar_metodo_detalle(uuid, text)
  from public, anon, authenticated;
