/** @type {import('next').NextConfig} */
const internalApi = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${internalApi}/api/:path*` },
      { source: "/media/:path*", destination: `${internalApi}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
