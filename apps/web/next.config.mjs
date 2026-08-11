// Destino del proxy de API: la URL pública de la API (Render en prod,
// localhost en dev). Se le quita la barra final para no duplicarla.
const API_TARGET = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// ============================================================
// Cabeceras de seguridad
// ============================================================
//
// La API de la API no es la de aquí: esto protege lo que sirve Next.
//
// ⚠️ El origen de la API va explícito en connect-src y NO basta con 'self'.
// El navegador llama al proxy /api en casi todo, pero hay dos sitios que
// hablan con api.valatino.es directamente: la página de confirmación del
// pedido y el widget de calificar la compra. Con 'self' a secas, el cliente
// pagaría y se quedaría mirando una confirmación que no carga.
//
// Se deriva de NEXT_PUBLIC_API_URL en vez de escribirlo a mano para que el día
// que la API cambie de dominio no haya que acordarse de tocar dos sitios.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // ⚠️ 'unsafe-inline' es el punto flojo, y es de Next: el App Router inyecta
  // el payload RSC en <script> inline. Quitarlo exige nonces por middleware,
  // y eso obliga a render dinámico — adiós al revalidate: 60 de las fichas.
  // Es una decisión con precio, no un olvido.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://www.paypal.com https://www.sandbox.paypal.com https://*.paypalobjects.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://q.stripe.com https://*.paypal.com https://*.paypalobjects.com",
  "font-src 'self' data:",
  `connect-src 'self' ${API_TARGET} https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://m.stripe.network https://*.paypal.com https://www.sandbox.paypal.com`,
  // Stripe Elements y los botones de PayPal se pintan en iframes suyos.
  "frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://*.paypal.com https://www.sandbox.paypal.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const CABECERAS_SEGURIDAD = [
  // Lo único de la CSP que se APLICA hoy: que nadie meta la tienda ni el panel
  // en un iframe suyo. No puede romper nada — ni Stripe ni PayPal enmarcan
  // nuestras páginas; son ellos los que se dejan enmarcar dentro (frame-src).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // ⚠️ El resto va en Report-Only A PROPÓSITO, como pide la auditoría.
  // Aplicarla de golpe sobre main, que auto-despliega, es arriesgarse a tumbar
  // el checkout en producción, y un pago que falla no se reintenta.
  //
  // PARA APLICARLA: recorrer en el navegador con la consola abierta el login
  // por código, el catálogo, el carrito, y pagar con tarjeta, Bizum, PayPal y
  // transferencia. Si no aparece ni un aviso de CSP, mover CSP de aquí a la
  // cabecera de arriba y borrar esta línea.
  { key: "Content-Security-Policy-Report-Only", value: CSP },

  // Respaldo de frame-ancestors para navegadores viejos que no lo entienden.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // ⚠️ `payment` NO se cierra: es lo que usan Apple Pay y Google Pay a través
  // de Stripe. Cerrarlo apagaría medios de pago sin que nadie relacionara la
  // causa con este fichero.
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), payment=(self "https://js.stripe.com" "https://www.paypal.com")',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Proxy same-origin: el navegador llama a /api/* (mismo dominio que la web)
  // y Next lo reenvía a la API. Así la cookie de sesión del carrito es de
  // PRIMERA PARTE y Safari/iOS la aceptan (bloquean las cookies de terceros,
  // que es lo que sería un fetch directo web-Vercel → API-Render).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_TARGET}/:path*` }];
  },
  // Se aplican a TODO lo que sirve Next, tienda y panel. No se filtra por ruta
  // a propósito: una lista de rutas protegidas es una lista que se olvida de
  // actualizar cuando se añade una página.
  //
  // El HSTS que ya pone Vercel en el dominio propio sigue igual: esto añade
  // cabeceras, no reemplaza las suyas.
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_SEGURIDAD }];
  },
};

export default nextConfig;
