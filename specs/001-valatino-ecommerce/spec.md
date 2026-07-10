# Especificación de Funcionalidad: Plataforma E-Commerce Valatino

**Rama de Funcionalidad**: `001-valatino-ecommerce`

**Creada**: 2026-07-02

**Estado**: Borrador

**Descripción**: Plataforma de comercio electrónico especializada en la venta de productos latinoamericanos en España, con portal de cliente (Storefront) y portal de gestión interno (Back-Office) con control de acceso basado en roles.

---

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 — Compra de productos (Prioridad: P1)

Un cliente navega el catálogo de productos latinoamericanos (Chocoramos, Jugos Hit, Galletas Ducales, etc.), añade artículos al carrito y completa el pago de forma segura mediante Stripe o PayPal.

**Por qué esta prioridad**: Es el flujo central de negocio. Sin él, la plataforma no genera ingresos ni valor para el cliente.

**Prueba independiente**: Se puede probar añadiendo un producto al carrito, avanzando al checkout y completando el pago. Entrega el valor mínimo de una tienda funcional.

**Escenarios de Aceptación**:

1. **Dado** que un cliente visita el catálogo, **Cuando** selecciona un producto disponible, **Entonces** puede ver su imagen, descripción, precio y disponibilidad en tiempo real.
2. **Dado** que un producto está en el carrito, **Cuando** el cliente avanza al checkout, **Entonces** el sistema reserva el stock temporalmente (máximo 15 minutos).
3. **Dado** que el cliente se encuentra en el checkout, **Cuando** completa el pago con Stripe o PayPal, **Entonces** el sistema confirma el pedido, descuenta el stock definitivamente y muestra confirmación.
4. **Dado** que el cliente inicia el checkout pero abandona sin pagar, **Cuando** expiran los 15 minutos de reserva, **Entonces** el sistema libera automáticamente el stock para otros compradores.
5. **Dado** que dos clientes intentan comprar el último artículo simultáneamente, **Cuando** solo uno completa el pago, **Entonces** el otro recibe un aviso de producto no disponible sin que se venda en exceso.

---

### Historia de Usuario 2 — Registro y Gestión de Cuenta de Cliente (Prioridad: P2)

Un cliente puede registrarse, iniciar sesión y gestionar sus datos personales: historial de pedidos y direcciones de envío guardadas.

**Por qué esta prioridad**: Mejora la experiencia de compra repetida y genera fidelización, aunque no bloquea la venta inicial.

**Prueba independiente**: Se puede probar creando una cuenta, realizando un pedido de prueba y verificando que aparece en el historial del usuario.

**Escenarios de Aceptación**:

1. **Dado** que un visitante desea registrarse, **Cuando** proporciona sus datos (nombre, correo, contraseña), **Entonces** el sistema crea su cuenta y le permite iniciar sesión.
2. **Dado** que un cliente autenticado completa una compra, **Cuando** accede a "Mis Pedidos", **Entonces** puede ver el historial completo con estado actual de cada pedido.
3. **Dado** que un cliente autenticado llega al checkout, **Cuando** selecciona una dirección guardada, **Entonces** el formulario se completa automáticamente con sus datos.

---

### Historia de Usuario 3 — Gestión de Pedidos en el Back-Office (Prioridad: P3)

Un Asesor o Administrador visualiza los pedidos entrantes en tiempo real y actualiza su estado a lo largo del ciclo de vida (Pendiente de Pago → Procesando → Enviado → Entregado / Cancelado).

**Por qué esta prioridad**: Permite la operación logística del negocio. Depende de que los pedidos se generen (P1).

**Prueba independiente**: Se puede probar con pedidos de prueba; el asesor los visualiza y cambia su estado, verificando que el cliente puede ver el cambio en su historial.

**Escenarios de Aceptación**:

1. **Dado** que llega un nuevo pedido, **Cuando** el Asesor accede al panel de pedidos, **Entonces** lo ve listado en tiempo real con todos sus detalles.
2. **Dado** que un pedido está "Procesando", **Cuando** el Asesor lo marca como "Enviado", **Entonces** el estado se actualiza y el cliente puede verlo en su historial.
3. **Dado** que un usuario sin rol de Asesor o Administrador intenta acceder al Back-Office, **Cuando** intenta entrar, **Entonces** el sistema le deniega el acceso.

---

### Historia de Usuario 4 — Gestión de Catálogo por el Administrador (Prioridad: P4)

El Administrador puede crear nuevos productos, editar sus detalles (descripción, precio, imágenes) y ajustar el inventario manualmente al registrar la entrada de nueva mercancía.

**Por qué esta prioridad**: Permite mantener el catálogo actualizado. Depende del sistema de catálogo (P1) y del Back-Office (P3).

**Prueba independiente**: Se puede probar creando un nuevo producto en el Back-Office y verificando que aparece en el catálogo público con su stock inicial.

**Escenarios de Aceptación**:

1. **Dado** que el Administrador crea un nuevo producto con imagen, descripción, precio y stock inicial, **Cuando** lo publica, **Entonces** aparece inmediatamente disponible en el catálogo público.
2. **Dado** que llega nueva mercancía, **Cuando** el Administrador suma unidades al inventario existente, **Entonces** el stock se actualiza y el producto vuelve a estar disponible si estaba agotado.
3. **Dado** que un producto se descataloga, **Cuando** el Administrador lo desactiva u oculta, **Entonces** deja de mostrarse en el catálogo público sin eliminar su historial.
4. **Dado** que un Asesor intenta gestionar el catálogo, **Cuando** intenta acceder a esa sección del Back-Office, **Entonces** el sistema le deniega el acceso por permisos insuficientes.

---

### Casos Límite

- ¿Qué ocurre si el webhook de Stripe/PayPal tarda en llegar o no llega?
- ¿Qué ocurre si un producto alcanza stock cero mientras hay reservas activas de otros clientes?
- ¿Qué ocurre si un cliente intenta añadir más unidades al carrito de las disponibles en stock?
- ¿Cómo se maneja el intento de login con credenciales incorrectas (protección contra fuerza bruta)?
- ¿Qué pasa si el pago es exitoso pero falla el registro del pedido en el sistema?

---

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Módulo del Cliente (Storefront)**

- **RF-001**: El sistema DEBE mostrar un catálogo de productos con imágenes, descripción, precio y disponibilidad de stock en tiempo real.
- **RF-002**: El sistema DEBE permitir a los clientes añadir, modificar la cantidad y eliminar artículos de un carrito de compras persistente.
- **RF-003**: El sistema DEBE ofrecer un flujo de checkout seguro con soporte nativo para Stripe (tarjeta de crédito/débito) y PayPal.
- **RF-004**: El sistema DEBE permitir el registro e inicio de sesión de clientes para acceder a funcionalidades personalizadas.
- **RF-005**: Los clientes autenticados DEBEN poder consultar su historial completo de pedidos con los estados actuales.
- **RF-006**: Los clientes autenticados DEBEN poder guardar y reutilizar múltiples direcciones de envío.

**Reglas de Negocio — Inventario y Concurrencia**

- **RF-007**: El sistema DEBE descontar el stock real ("Hard Stock") únicamente tras recibir la confirmación de pago exitoso mediante Webhook de Stripe o PayPal.
- **RF-008**: El sistema DEBE reservar temporalmente las unidades ("Soft Allocation") cuando un cliente avance hacia la pantalla de pago, registrando el ID de usuario, ID de producto y marca de tiempo.
- **RF-009**: La reserva temporal DEBE tener un tiempo de expiración de 15 minutos. Al expirar, el sistema DEBE liberar automáticamente el stock reservado.
- **RF-010**: El sistema DEBE garantizar que no se vende más stock del disponible bajo condiciones de concurrencia (sin overselling).

**Módulo de Administración (Back-Office)**

- **RF-011**: El acceso al Back-Office DEBE estar protegido por autenticación y control de acceso basado en roles (RBAC) con al menos dos roles: Administrador y Asesor.
- **RF-012**: El rol Administrador DEBE tener acceso total al sistema (usuarios, roles, inventario, pedidos y configuración de la tienda).
- **RF-013**: El rol Asesor DEBE tener acceso restringido: solo puede visualizar pedidos, actualizar estados de envío y brindar soporte operativo. No puede gestionar catálogo, usuarios ni finanzas.
- **RF-014**: El sistema DEBE mostrar un panel de pedidos en tiempo real con todos los pedidos entrantes.
- **RF-015**: El sistema DEBE permitir actualizar el estado de un pedido entre los siguientes valores: Pendiente de Pago, Procesando, Enviado, Entregado, Cancelado.
- **RF-016**: El Administrador DEBE poder crear, editar y desactivar/ocultar productos del catálogo (CRUD).
- **RF-017**: El Administrador DEBE poder registrar entradas de mercancía (sumar stock manualmente al inventario existente).

---

### Entidades Clave *(el sistema involucra datos)*

- **Producto**: Nombre, descripción, imágenes, precio, categoría, stock disponible, stock reservado, estado (activo/inactivo).
- **Carrito**: Cliente (registrado o sesión anónima), lista de artículos con cantidad, fecha de última modificación.
- **Reserva de Stock**: ID de usuario/sesión, ID de producto, cantidad reservada, timestamp de creación, timestamp de expiración (TTL 15 min).
- **Pedido**: Cliente, lista de productos con cantidades y precios, estado, total, método de pago, referencia de transacción, dirección de envío, fechas de creación y actualización.
- **Cliente**: Nombre, correo electrónico, contraseña (cifrada), direcciones de envío guardadas, historial de pedidos.
- **Usuario Interno**: Nombre, correo electrónico, contraseña (cifrada), rol asignado (Administrador / Asesor).
- **Rol**: Nombre del rol, lista de permisos asociados.

---

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **CE-001**: Los clientes pueden completar el proceso completo de compra (selección → pago → confirmación) en menos de 5 minutos.
- **CE-002**: El sistema soporta al menos 100 compradores simultáneos sin incidentes de venta en exceso (overselling = 0%).
- **CE-003**: Las reservas de stock expiradas se liberan automáticamente en un margen máximo de 1 minuto tras vencer el TTL de 15 minutos.
- **CE-004**: El 100% de las deducciones de stock definitivas ocurren únicamente tras la confirmación de pago del proveedor de pagos.
- **CE-005**: El acceso al Back-Office por usuarios no autorizados es bloqueado en el 100% de los intentos.
- **CE-006**: Los cambios de estado de pedidos realizados en el Back-Office son visibles para el cliente en menos de 60 segundos.
- **CE-007**: El panel de pedidos del Back-Office refleja los nuevos pedidos en tiempo real con un retraso máximo de 30 segundos.

---

## Suposiciones

- El mercado objetivo inicial es exclusivamente España; los precios se muestran en euros (EUR).
- Los productos son físicos con envío a domicilio; la logística de transporte se gestiona manualmente (sin integración con carriers externos en v1).
- Se asume que el registro de cliente es opcional durante la compra: se puede comprar como invitado, pero solo los usuarios registrados pueden ver su historial y guardar direcciones.
- Los webhooks de Stripe y PayPal son el único mecanismo de confirmación de pago; el sistema no realiza polling activo al proveedor de pagos.
- El sistema de correo electrónico estará disponible para enviar confirmaciones de pedido y notificaciones de cambio de estado.
- Un solo Administrador puede gestionar los roles de los Asesores; no existe un superadministrador separado en v1.
- Las imágenes de producto se almacenan y sirven desde el propio sistema; no se requiere CDN externo en v1.
- El proceso de liberación automática de reservas expiradas se ejecuta como proceso en segundo plano del sistema.
