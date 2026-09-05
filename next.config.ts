import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // This release branch ships only Taru Villas' approved modules.
  // Bake the same policy into server, middleware, and client bundles.
  env: {
    CLIENT_ENABLED_MODULES: 'dashboard,tasks,fleet,daily-records',
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
};

export default nextConfig;
