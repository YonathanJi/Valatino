-- ============================================================
-- 050 — La línea de tiempo puede contar por qué, no solo qué
--
-- Pedido por Jonathan: al abrir un pedido, el historial debería decir «se creó
-- el pedido tal… después el cliente decidió pagarlo por Bizum y se creó el
-- pedido tal».
--
-- Faltaba dónde escribirlo. `pedido_eventos.tipo` solo admitía 'estado', 'pago',
-- 'reembolso' y 'email', y esto no es ninguna de las cuatro: es una nota sobre
-- lo que le pasó al pedido. Sin ella, quien abría el cancelado veía un
-- «Pendiente de pago → Cancelado» sin ningún motivo, y el sitio donde estaba la
-- explicación —el enlace entre los dos pedidos— no se leía desde ahí.
-- ============================================================

alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check
  check (tipo in ('estado', 'pago', 'reembolso', 'email', 'nota'));
