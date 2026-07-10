/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "cdn.valatino.es",
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
