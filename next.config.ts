import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma's engine is a native binary; keep it out of the bundler.
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'razorpay'],
  async headers() {
    return [
      {
        // Health data. Lock the browser down everywhere, then re-open
        // geolocation/microphone only on the surfaces that need them.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=(self), camera=(self), payment=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
