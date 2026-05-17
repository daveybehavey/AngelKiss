import { GalleryPrintsClient } from "@/components/storefront/gallery-prints-client";
import { loadCachedActiveStudioPrints } from "@/lib/server/storefront-data-cache";
import { listActiveStudioPrintGroups } from "@/lib/storefront/studio-print-groups";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Studio print gallery",
  description:
    "Browse every in-house studio print available for custom sublimation at AnglKiss Creations.",
  alternates: { canonical: "/gallery" }
};

export default async function GalleryPage() {
  const [prints, groups] = await Promise.all([
    loadCachedActiveStudioPrints(),
    listActiveStudioPrintGroups(getSupabaseAdminClient())
  ]);

  return (
    <main className="page-main gallery-page">
      <section className="panel page-intro">
        <p className="page-kicker">In-house designs</p>
        <h1 className="page-title">Studio print gallery</h1>
        <p className="page-lead">
          Browse by theme or search below, then pick a design for your mug, tumbler, or other
          custom blank.
        </p>
        <p className="page-link-row">
          <Link href="/">Home</Link>
          <Link href="/shop?category=custom_sublimation">Custom prints shop</Link>
        </p>
      </section>

      {prints.length === 0 ? (
        <section className="panel">
          <p>Studio prints are being updated — check back soon.</p>
        </section>
      ) : (
        <Suspense fallback={<p className="gallery-loading panel">Loading gallery…</p>}>
          <GalleryPrintsClient prints={prints} groups={groups} />
        </Suspense>
      )}
    </main>
  );
}
