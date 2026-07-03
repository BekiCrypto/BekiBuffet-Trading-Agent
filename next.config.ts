import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Enforce type safety in production builds
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  // Powered-by header removal
  poweredByHeader: false,
};

export default nextConfig;
