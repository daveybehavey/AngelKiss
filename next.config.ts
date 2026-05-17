import type { NextConfig } from "next";
import { normalizeStorefrontImageCdnBaseUrl } from "./lib/storefront/image-cdn-env";

function supabaseStorageRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol === "https:" ? "https" : "http";
    return [
      {
        protocol,
        hostname: parsed.hostname,
        pathname: "/storage/v1/**"
      }
    ];
  } catch {
    return [];
  }
}

function storefrontImageCdnRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const base = normalizeStorefrontImageCdnBaseUrl(process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);
  if (!base) {
    return [];
  }
  const parsed = new URL(base);
  const protocol = parsed.protocol === "https:" ? "https" : "http";
  return [
    {
      protocol,
      hostname: parsed.hostname,
      pathname: "/**"
    }
  ];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [96, 128, 160, 256, 384],
    /** Long browser/CDN cache for `/_next/image` URLs (params change when source changes). */
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [...supabaseStorageRemotePatterns(), ...storefrontImageCdnRemotePatterns()]
  },
  async headers() {
    return [
      {
        source: "/marketing/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
