// Destino del proxy de API: la URL pública de la API (Render en prod,
// localhost en dev). Se le quita la barra final para no duplicarla.
const API_TARGET = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

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
};

export default nextConfig;
