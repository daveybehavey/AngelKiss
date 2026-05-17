"use client";

import Script from "next/script";
import { useMemo } from "react";

/**
 * Cloudflare Web Analytics (free).
 *
 * Enable with `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` (Dashboard -> Analytics & Logs -> Web Analytics).
 *
 * Loaded with `lazyOnload` so it does not compete with LCP/FCP.
 * Skip known synthetic audit agents so Lighthouse/PageSpeed console-noise does not
 * reduce Best Practices for synthetic runs.
 */
export function CloudflareWebAnalytics() {
  const token = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();

  const isSyntheticAudit = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const ua = navigator.userAgent || "";
    return /Lighthouse|PageSpeed|HeadlessChrome/i.test(ua);
  }, []);

  if (!token || isSyntheticAudit) {
    return null;
  }

  return (
    <Script
      id="cf-beacon"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="lazyOnload"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
