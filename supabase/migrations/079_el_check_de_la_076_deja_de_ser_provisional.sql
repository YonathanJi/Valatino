-- ============================================================
-- 079 — El CHECK de la 076 deja de ser provisional
--
-- Una línea, y lleva un día pendiente por un motivo que conviene no perder.
--
-- La 076 prohibió que una factura se emita a uno mismo (emisor y receptor con el
-- MISMO NIF), y tuvo que crear el CHECK **`NOT VALID`**: `VALF202600100` —la
-- primera factura completa real, del 2026-08-14— violaba la regla, y un CHECK
-- normal no se habría podido ni crear. Se eligió eso antes que borrar la factura
-- de Jonathan sin preguntarle.
--
-- ⚠️ Y `NOT VALID` no es «medio puesto»: **la regla ya se aplicaba a todo lo que
-- entrara desde entonces**. Lo único que Postgres se saltaba era comprobar las
-- filas que ya estaban. O sea que el suelo llevaba un día funcionando; lo que
-- faltaba era certificar el pasado.
--
-- ⭐ Y el dato de prueba no se quedó quieto mientras tanto, que es lo que hace que
-- esto merezca su propia migración en vez de un `alter` a mano: al devolver ese
-- pedido, las DOS rectificativas salieron **sin receptor**, y `factura_eventos`
-- lo dejó escrito dos veces (`rectificativa_sin_receptor_heredado`). La válvula
-- de la 077 hizo su trabajo —heredar el receptor habría abortado un reembolso ya
-- cobrado—, pero el precio fue emitir dos documentos peores. Un dato de prueba
-- malo no se queda en su sitio: contamina lo que se construye encima.
--
-- Hoy (2026-08-15) `limpiar_datos_de_prueba()` se llevó ese pedido y sus cuatro
-- facturas, así que ya no hay ninguna fila que viole la regla y se puede
-- convalidar. `VALIDATE CONSTRAINT` recorre la tabla una vez y **no bloquea
-- escrituras** (solo toma un `SHARE UPDATE EXCLUSIVE`), que además aquí es sobre
-- una tabla vacía.
--
-- ⚠️ Si alguien reconstruye la base desde cero, esto sigue siendo correcto: la 076
-- crea el CHECK `NOT VALID` sobre una tabla sin filas y esta lo convalida sin
-- tener nada que recorrer.
-- ============================================================

alter table public.facturas_emitidas
  validate constraint facturas_receptor_no_es_el_emisor;

-- La comprobación, no la fe: si por lo que sea no quedó convalidado, esto aborta
-- la migración en vez de dejar el repo diciendo que se cerró algo que sigue
-- abierto — que es exactamente el estado que esta migración viene a terminar.
do $comprobar$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.facturas_emitidas'::regclass
      and conname  = 'facturas_receptor_no_es_el_emisor'
      and convalidated
  ) then
    raise exception 'El CHECK facturas_receptor_no_es_el_emisor sigue sin convalidar';
  end if;
end
$comprobar$;
