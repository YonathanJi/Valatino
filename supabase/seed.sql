-- supabase/seed.sql
-- Datos iniciales de prueba: roles, usuario admin, productos latinoamericanos
--
-- NOTA: Los roles base (admin, asesor, cliente) se insertan automÃ¡ticamente
-- desde la migraciÃ³n 002_schema.sql si no existen.
--
-- Para crear el primer usuario administrador, ejecuta este comando:
--   npx supabase functions new create-admin
-- O manualmente desde Supabase Dashboard:
--   1. Ve a Authentication > Users > Add user
--   2. Crea un usuario con email y contraseÃ±a
--   3. Ejecuta en SQL Editor:
--      SELECT id FROM roles WHERE nombre = 'admin';
--      INSERT INTO user_roles (user_id, role_id) VALUES ('<UUID-del-usuario>', '<UUID-del-rol-admin>');
--   4. Actualiza el user_metadata del usuario para incluir: {"role": "admin"}

-- ============================================================
-- PRODUCTOS LATINOAMERICANOS DE PRUEBA
-- ============================================================

INSERT INTO productos (nombre, descripcion, precio, imagenes, categoria, stock_disponible, slug) VALUES
(
  'Chocoramo',
  'El ponquÃ© colombiano cubierto de chocolate mÃ¡s famoso de Colombia. TamaÃ±o individual.',
  2.50,
  ARRAY['/productos/chocoramo.svg'],
  'Dulces',
  150,
  'chocoramo'
),
(
  'Jugos Hit MaracuyÃ¡ 250ml',
  'Jugo de maracuyÃ¡ colombiano, elaborado con frutas tropicales seleccionadas.',
  1.80,
  ARRAY['/productos/jugos-hit-maracuya.svg'],
  'Bebidas',
  200,
  'jugos-hit-maracuya-250ml'
),
(
  'Jugos Hit Mora 250ml',
  'Jugo de mora colombiano, sabor intenso y natural.',
  1.80,
  ARRAY['/productos/jugos-hit-mora.svg'],
  'Bebidas',
  180,
  'jugos-hit-mora-250ml'
),
(
  'Galletas Ducales x12',
  'Las clÃ¡sicas galletas de soda colombianas, crujientes y levemente saladas. Pack de 12 unidades.',
  3.20,
  ARRAY['/productos/galletas-ducales.svg'],
  'Galletas',
  120,
  'galletas-ducales-x12'
),
(
  'Chocolate Santander 70% 80g',
  'Chocolate negro colombiano premium con 70% de cacao de origen.',
  4.50,
  ARRAY['/productos/chocolate-santander.svg'],
  'Dulces',
  80,
  'chocolate-santander-70-80g'
),
(
  'ManÃ­ La Rosa 200g',
  'ManÃ­ tostado y salado, el snack favorito de Colombia.',
  2.20,
  ARRAY['/productos/mani-la-rosa.svg'],
  'Snacks',
  250,
  'mani-la-rosa-200g'
),
(
  'CafÃ© Sello Rojo 500g',
  'CafÃ© colombiano molido, sabor suave y aromÃ¡tico. El mÃ¡s vendido en Colombia.',
  8.90,
  ARRAY['/productos/cafe-sello-rojo.svg'],
  'Bebidas',
  60,
  'cafe-sello-rojo-500g'
),
(
  'Salsa de AjÃ­ Tostao 200ml',
  'Salsa picante colombiana hecha con ajÃ­ dulce y especias. Perfecta para acompaÃ±ar cualquier plato.',
  3.50,
  ARRAY['/productos/salsa-aji.svg'],
  'Salsas',
  90,
  'salsa-aji-tostao-200ml'
),
(
  'Bon Bon Bum SandÃ­a x24',
  'Chupetes colombianos rellenos de chicle sabor sandÃ­a. Pack familiar de 24 unidades.',
  5.60,
  ARRAY['/productos/bon-bon-bum.svg'],
  'Dulces',
  300,
  'bon-bon-bum-sandia-x24'
),
(
  'Aguardiente AntioqueÃ±o Miniatura 50ml',
  'Aguardiente colombiano en tamaÃ±o miniatura, anisado y suave.',
  4.20,
  ARRAY['/productos/aguardiente-antioqueno.svg'],
  'Licores',
  70,
  'aguardiente-antioqueno-50ml'
);
