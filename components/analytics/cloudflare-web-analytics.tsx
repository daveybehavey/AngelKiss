/**
 * Cloudflare Web Analytics (free).
 *
 * Enable by setting `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` to your site token from
 * Cloudflare Dashboard → Analytics & Logs → Web Analytics.
 *
 * This renders the standard Cloudflare beacon snippet into the document `<head>`.
 */
export function CloudflareWebAnalyticsHead() {
  const token = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
  if (!token) {
    return null;
  }

  const beaconConfig = JSON.stringify({ token });

  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={beaconConfig}
    />
  );
}

