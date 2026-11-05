import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

function origin(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL);
const mediaOrigin = origin(process.env.NEXT_PUBLIC_MEDIA_URL);
// Local object storage (RustFS on localhost) only. Production media is on a public R2 domain.
const localMedia = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(mediaOrigin);

// Static CSP (no nonces) so pages can be prerendered and cached. Tightened further in Phase 10.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${mediaOrigin}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: mediaOrigin ? [new URL(`${mediaOrigin}/**`)] : [],
    // Next.js refuses to optimise images from private addresses unless allowed.
    dangerouslyAllowLocalIP: localMedia,
    formats: ['image/avif', 'image/webp'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
