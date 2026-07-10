-- supabase/seed.sql
-- Datos iniciales de prueba: roles, usuario admin, productos latinoamericanos
--
-- NOTA: Los roles base (admin, asesor, cliente) se insertan automáticamente
-- desde la migración 002_schema.sql si no existen.
--
-- Para crear el primer usuario administrador, ejecuta este comando:
--   npx supabase functions new create-admin
-- O manualmente desde Supabase Dashboard:
--   1. Ve a Authentication > Users > Add user
--   2. Crea un usuario con email y contraseña
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
  'El ponqué colombiano cubierto de chocolate más famoso de Colombia. Tamaño individual.',
  2.50,
  ARRAY['https://cdn.valatino.es/productos/chocoramo.jpg'],
  'Dulces',
  150,
  'chocoramo'
),
(
  'Jugos Hit Maracuyá 250ml',
  'Jugo de maracuyá colombiano, elaborado con frutas tropicales seleccionadas.',
  1.80,
  ARRAY['https://cdn.valatino.es/productos/jugos-hit-maracuya.jpg'],
  'Bebidas',
  200,
  'jugos-hit-maracuya-250ml'
),
(
  'Jugos Hit Mora 250ml',
  'Jugo de mora colombiano, sabor intenso y natural.',
  1.80,
  ARRAY['https://cdn.valatino.es/productos/jugos-hit-mora.jpg'],
  'Bebidas',
  180,
  'jugos-hit-mora-250ml'
),
(
  'Galletas Ducales x12',
  'Las clásicas galletas de soda colombianas, crujientes y levemente saladas. Pack de 12 unidades.',
  3.20,
  ARRAY['https://cdn.valatino.es/productos/galletas-ducales.jpg'],
  'Galletas',
  120,
  'galletas-ducales-x12'
),
(
  'Chocolate Santander 70% 80g',
  'Chocolate negro colombiano premium con 70% de cacao de origen.',
  4.50,
  ARRAY['https://cdn.valatino.es/productos/chocolate-santander.jpg'],
  'Dulces',
  80,
  'chocolate-santander-70-80g'
),
(
  'Maní La Rosa 200g',
  'Maní tostado y salado, el snack favorito de Colombia.',
  2.20,
  ARRAY['https://cdn.valatino.es/productos/mani-la-rosa.jpg'],
  'Snacks',
  250,
  'mani-la-rosa-200g'
),
(
  'Café Sello Rojo 500g',
  'Café colombiano molido, sabor suave y aromático. El más vendido en Colombia.',
  8.90,
  ARRAY['https://cdn.valatino.es/productos/cafe-sello-rojo.jpg'],
  'Bebidas',
  60,
  'cafe-sello-rojo-500g'
),
(
  'Salsa de Ají Tostao 200ml',
  'Salsa picante colombiana hecha con ají dulce y especias. Perfecta para acompañar cualquier plato.',
  3.50,
  ARRAY['https://cdn.valatino.es/productos/salsa-aji.jpg'],
  'Salsas',
  90,
  'salsa-aji-tostao-200ml'
),
(
  'Bon Bon Bum Sandía x24',
  'Chupetes colombianos rellenos de chicle sabor sandía. Pack familiar de 24 unidades.',
  5.60,
  ARRAY['https://cdn.valatino.es/productos/bon-bon-bum.jpg'],
  'Dulces',
  300,
  'bon-bon-bum-sandia-x24'
),
(
  'Aguardiente Antioqueño Miniatura 50ml',
  'Aguardiente colombiano en tamaño miniatura, anisado y suave.',
  4.20,
  ARRAY['https://cdn.valatino.es/productos/aguardiente-antioqueno.jpg'],
  'Licores',
  70,
  'aguardiente-antioqueno-50ml'
);
