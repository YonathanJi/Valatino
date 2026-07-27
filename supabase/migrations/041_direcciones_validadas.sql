-- ============================================================
-- 041 — Direcciones validadas en la propia tabla
--
-- Los cuatro campos de la dirección eran texto libre y ya habían dejado
-- «españa» escrito como ciudad. El arreglo de fondo va en la API (código postal
-- de 5 dígitos con provincia real, y municipio del diccionario del INE), pero
-- una regla que solo vive en el código se salta con un UPDATE a mano — y esta
-- tabla es la que alimenta la analítica y las etiquetas de envío.
--
-- Qué se comprueba aquí y qué NO:
--
--  · `codigo_postal` — 5 dígitos y prefijo de provincia real (01–52). Es lo que
--    dejaba pasar «99999» cuando la única validación era MaxLength(10).
--  · `provincia` — una de las 52 oficiales del INE. Son 52 valores estables
--    desde hace décadas: caben en un CHECK y cierran «españa» para siempre.
--  · `pais` — dos letras mayúsculas (ISO 3166-1 alfa-2). No se fija a 'ES'
--    porque eso es una decisión de negocio y no de integridad.
--  · El MUNICIPIO no se comprueba en la BD: son 8.132 nombres que cambian
--    algunos cada año. Meterlos aquí obligaría a mantener el diccionario en dos
--    sitios y a una migración por cada cambio del INE. Se valida en la API,
--    que es la única que escribe en esta tabla (la 035 dejó su RLS en solo
--    lectura para los clientes).
--
-- ⚠️ A `pedidos.envio_*` NO se le pone ninguna restricción, a propósito. Esas
-- columnas las rellena `confirmar_venta` DENTRO de la transacción que confirma
-- un pago ya cobrado. Un CHECK que falle ahí no protege un dato: convierte un
-- cobro en un pedido que no existe, y el webhook reintentaría sin éxito. El
-- snapshot se copia de datos que la API ya validó; proteger un campo de texto
-- no vale el riesgo de perder una venta cobrada.
-- ============================================================

-- Las filas existentes ya cumplen (comprobado antes de aplicar: 1 dirección y
-- 1 pedido, ambos con «Mejorada del Campo», «Madrid», «28840», «ES»), así que
-- no hace falta saneado previo.

alter table direcciones_envio
  add constraint direcciones_envio_cp_valido
  check (codigo_postal ~ '^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$');

alter table direcciones_envio
  add constraint direcciones_envio_pais_iso
  check (pais ~ '^[A-Z]{2}$');

alter table direcciones_envio
  add constraint direcciones_envio_provincia_oficial
  check (provincia in (
    'Araba/Álava', 'Albacete', 'Alicante/Alacant', 'Almería', 'Ávila',
    'Badajoz', 'Balears, Illes', 'Barcelona', 'Burgos', 'Cáceres',
    'Cádiz', 'Castellón/Castelló', 'Ciudad Real', 'Córdoba', 'Coruña, A',
    'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa',
    'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida',
    'Rioja, La', 'Lugo', 'Madrid', 'Málaga', 'Murcia',
    'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Palmas, Las',
    'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Cantabria', 'Segovia',
    'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
    'Valencia/València', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza',
    'Ceuta', 'Melilla'
  ));

comment on constraint direcciones_envio_provincia_oficial on direcciones_envio is
  'Las 52 provincias del INE, escritas como las escribe el INE (artículo invertido incluido). Si alguna vez cambia una denominación oficial, se toca aquí y en PROVINCIAS_ES de @valatino/types.';
