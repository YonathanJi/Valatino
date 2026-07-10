# Contratos de Supabase Realtime: Plataforma E-Commerce Valatino

**Protocolo**: WebSocket vía `@supabase/supabase-js` v2
**Uso**: Panel de pedidos del Back-Office (actualizaciones en tiempo real)
**Fecha**: 2026-07-02

---

## Canal: Pedidos (`pedidos-backoffice`)

Suscripción a cambios en la tabla `pedidos` para el panel del Back-Office.
Solo accesible para usuarios con rol `admin` o `asesor` (RLS garantiza el acceso).

### Patrón de suscripción

```ts
// apps/web — componente cliente del Back-Office
const channel = supabase
  .channel('pedidos-backoffice')
  .on(
    'postgres_changes',
    {
      event: '*',           // INSERT | UPDATE | DELETE
      schema: 'public',
      table: 'pedidos',
    },
    (payload) => handlePedidoChange(payload)
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') console.log('Tiempo real conectado');
  });

// Limpieza al desmontar
return () => { supabase.removeChannel(channel); };
```

### Payload de evento `INSERT` (nuevo pedido)

```json
{
  "eventType": "INSERT",
  "new": {
    "id": "uuid",
    "user_id": "uuid",
    "estado": "PENDIENTE_PAGO",
    "total": 12.50,
    "metodo_pago": "stripe",
    "referencia_pago": null,
    "created_at": "2026-07-02T10:00:00Z",
    "updated_at": "2026-07-02T10:00:00Z"
  },
  "old": {},
  "schema": "public",
  "table": "pedidos"
}
```

### Payload de evento `UPDATE` (cambio de estado)

```json
{
  "eventType": "UPDATE",
  "new": {
    "id": "uuid",
    "estado": "PROCESANDO",
    "updated_at": "2026-07-02T10:05:00Z"
  },
  "old": {
    "id": "uuid",
    "estado": "PENDIENTE_PAGO",
    "updated_at": "2026-07-02T10:00:00Z"
  },
  "schema": "public",
  "table": "pedidos"
}
```

---

## Consideraciones de Seguridad

- La suscripción solo devuelve datos si la política RLS del usuario lo permite.
- La clave `anon` de Supabase puede usarse en el cliente, ya que RLS filtra los datos.
- Los usuarios con rol `cliente` NO deben suscribirse a este canal; si lo intentan, RLS
  les devuelve un conjunto vacío de cambios.
- Se debe usar el canal `realtime:public:pedidos` con filtro adicional si se quiere limitar
  a un subset de pedidos (ej. por fecha o estado) para reducir el tráfico.

---

## Canal: Stock de Producto (opcional, fase futura)

Suscripción a cambios de `stock_disponible` en `productos` para mostrar disponibilidad
en tiempo real en el Storefront. No forma parte del alcance de v1.

```ts
// Patrón para implementación futura
supabase.channel('stock-producto')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'productos',
    filter: `id=eq.${productoId}`
  }, handleStockChange)
  .subscribe();
```
