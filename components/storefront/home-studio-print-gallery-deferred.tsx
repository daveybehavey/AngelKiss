"use client";

import dynamic from "next/dynamic";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import { HomeStudioPrintGallerySkeleton } from "@/components/storefront/home-studio-print-gallery-skeleton";

const HomeStudioPrintGalleryClient = dynamic(
  () =>
    import("@/components/storefront/home-studio-print-gallery-client").then((mod) => ({
      default: mod.HomeStudioPrintGalleryClient
    })),
  {
    ssr: false,
    loading: () => <HomeStudioPrintGallerySkeleton />
  }
);

type Props = {
  prints: PublicStudioPrint[];
};

/** Below-the-fold carousel — client-only to keep homepage TBT lower. */
export function HomeStudioPrintGalleryDeferred({ prints }: Props) {
  return <HomeStudioPrintGalleryClient prints={prints} />;
}
