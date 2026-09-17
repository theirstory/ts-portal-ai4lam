/** @type {import('next').NextConfig} */
const nextConfig = {
  // Left as ordinary Node requires rather than bundled: pdf.js loads its worker
  // by importing a sibling file at runtime, which a bundled copy cannot find,
  // and mammoth reaches for its own resources the same way.
  serverExternalPackages: ['pdfjs-dist', 'mammoth'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'theirstory.s3.us-west-1.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'theirstory-media-staging-public.s3.us-west-1.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'theirstory-public.s3.us-west-1.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
};

export default nextConfig;
