import type { NextConfig } from 'next';

/** No page may be shown inside another site's frame (clickjacking, e.g. on the MCP consent screen), and no sniffing. */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/** `standalone` builds a self-contained server (`.next/standalone/server.js`) for the container image (docs/spec/11-deploy-aws.md). */
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
