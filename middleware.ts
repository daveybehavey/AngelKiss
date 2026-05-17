import { LEGACY_REDIRECT_HOSTS } from "@/lib/site-domains";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function canonicalSiteUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Previous primary hostnames (comma-separated in `LEGACY_SITE_HOSTS` to override). */
function legacyHosts(): string[] {
  const raw = process.env.LEGACY_SITE_HOSTS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
  return [...LEGACY_REDIRECT_HOSTS];
}

function shouldRedirectToCanonical(host: string, canonical: URL): boolean {
  const ch = canonical.hostname.toLowerCase();
  const h = host.toLowerCase();
  if (h === ch) return false;

  if (legacyHosts().includes(h)) return true;

  if (!ch.startsWith("www.") && h === `www.${ch}`) return true;

  if (ch.startsWith("www.")) {
    const apex = ch.slice(4);
    if (h === apex) return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const canonical = canonicalSiteUrl();
  if (!canonical) return NextResponse.next();

  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!host) return NextResponse.next();

  if (!shouldRedirectToCanonical(host, canonical)) {
    return NextResponse.next();
  }

  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    canonical
  );
  return NextResponse.redirect(destination, 301);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
