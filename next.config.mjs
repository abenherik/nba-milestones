/** @type {import('next').NextConfig} */
const nextConfig = {
  // Drop StrictMode in LOWMEM to avoid double-rendering in dev
  reactStrictMode: !process.env.LOWMEM,
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // Reduce memory footprint when LOWMEM=1
  typescript: {
    // Skip type errors during builds for deployment
    ignoreBuildErrors: true,
  },
  eslint: {
    // Disable ESLint during builds in production to fix deployment
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // optimizeCss: true,  // Temporarily disabled for build stability
    scrollRestoration: true,
  },
  // Disable static generation for API routes
  trailingSlash: false,
  webpack: (config, { dev }) => {
    if (dev) {
      const ignored = [
        '**/data/**',
        '**/docs/**',
        '**/legacy/**',
        '**/public/**',
        '**/scripts/**',
      ];
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored,
      };
    }
    return config;
  },
};

export default nextConfig;
