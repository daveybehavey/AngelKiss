import { GalleryPrintsSkeleton } from "@/components/storefront/gallery-prints-skeleton";
import { loadCachedActiveStudioPrints } from "@/lib/server/storefront-data-cache";
import { listActiveStudioPrintGroups } from "@/lib/storefront/studio-print-groups";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";

const GalleryPrintsClient = dynamic(
  () =>
    import("@/components/storefront/gallery-prints-client").then((m) => m.GalleryPrintsClient),
  {
    loading: () => <GalleryPrintsSkeleton />
  }
);

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Studio print gallery",
  description:
    "Browse original in-house print designs for mugs, tumblers, bags, and more at AnglKiss Creations.",
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
          Every design here is original artwork created for AnglKiss Creations. Browse by theme or
          search, then use a design on your mug, tumbler, or other custom-print blank.
        </p>
        <p className="page-link-row">
          <Link href="/">Home</Link>
          <Link href="/shop?category=custom_sublimation">Shop custom prints</Link>
        </p>
      </section>

      {prints.length === 0 ? (
        <section className="panel shop-empty-panel">
          <p className="shop-empty-title">Studio prints are being updated</p>
          <p className="shop-empty-copy">Check back soon—we add new in-house designs regularly.</p>
          <Link href="/shop?category=custom_sublimation" className="btn btn-outline btn-sm">
            Shop custom prints
          </Link>
        </section>
      ) : (
        <Suspense fallback={<GalleryPrintsSkeleton />}>
          <GalleryPrintsClient prints={prints} groups={groups} />
        </Suspense>
      )}
    </main>
  );
}
