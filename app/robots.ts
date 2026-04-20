import { getSiteOrigin } from "@/lib/site-url";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/admin/", "/checkout"]
      }
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin
  };
}
