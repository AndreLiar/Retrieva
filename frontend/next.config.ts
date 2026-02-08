import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Configure allowed image domains if needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.notion.so',
      },
    ],
  },

  // Rewrites for API proxy during development (optional)
  // This can help avoid CORS issues during development
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';
    // Only proxy in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/proxy/:path*',
          destination: `${apiUrl}/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
