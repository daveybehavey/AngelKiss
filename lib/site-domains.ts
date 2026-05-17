/** Canonical production hostname (apex). All other domains redirect here. */
export const CANONICAL_HOST = "anglkisscreations.ca";

export const CANONICAL_SITE_URL = `https://${CANONICAL_HOST}`;

/**
 * Hostnames bound to the Cloudflare Worker (`wrangler.jsonc` custom domains).
 * Keep in sync when adding zones.
 */
export const WORKER_CUSTOM_DOMAIN_HOSTS = [
  "anglkisscreations.ca",
  "www.anglkisscreations.ca",
  "anglkisscreations.com",
  "www.anglkisscreations.com",
  "angelkisscreations.com",
  "www.angelkisscreations.com"
] as const;

/** Alternate / legacy hosts that 301 to the canonical .ca site. */
export const LEGACY_REDIRECT_HOSTS = [
  "anglkisscreations.com",
  "www.anglkisscreations.com",
  "angelkisscreations.com",
  "www.angelkisscreations.com"
] as const;
