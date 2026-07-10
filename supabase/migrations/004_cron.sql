-- Migration: 004_cron.sql
-- Configura el job pg_cron para liberar reservas de stock expiradas

-- El job se ejecuta cada minuto (TTL de reservas = 15 minutos)
-- Libera stock_disponible y elimina registros expirados en una transacción atómica

SELECT cron.schedule(
  'liberar-reservas-expiradas',
  '* * * * *',
  $cron$
    DO $body$
    DECLARE
      reserva RECORD;
    BEGIN
      FOR reserva IN
        SELECT id, producto_id, cantidad
        FROM stock_reservas
        WHERE expires_at < NOW()
        FOR UPDATE SKIP LOCKED
      LOOP
        -- Devolver unidades al stock disponible
        UPDATE productos
        SET
          stock_disponible = stock_disponible + reserva.cantidad,
          stock_reservado  = GREATEST(0, stock_reservado - reserva.cantidad),
          updated_at       = NOW()
        WHERE id = reserva.producto_id;

        -- Eliminar la reserva expirada
        DELETE FROM stock_reservas WHERE id = reserva.id;
      END LOOP;
    END;
    $body$ LANGUAGE plpgsql;
  $cron$
);
