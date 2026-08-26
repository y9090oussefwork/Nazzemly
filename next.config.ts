import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // A merchant restore archive can legitimately contain historical orders,
    // receipts, and encrypted delivery credentials. The import action validates
    // the archive before it reaches the database.
    serverActions: {
      bodySizeLimit: '80mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
