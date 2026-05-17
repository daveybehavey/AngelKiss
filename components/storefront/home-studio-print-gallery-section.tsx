import { HomeStudioPrintGalleryDeferred } from "@/components/storefront/home-studio-print-gallery-deferred";

/** Max slides on homepage — keeps carousel JS and image decode off the critical path. */
const HOME_STUDIO_PRINT_LIMIT = 6;
import { HomeStudioPrintGalleryEmpty } from "@/components/storefront/home-studio-print-gallery-empty";
import { loadCachedActiveStudioPrints } from "@/lib/server/storefront-data-cache";

export default async function HomeStudioPrintGallerySection() {
  try {
    const prints = await loadCachedActiveStudioPrints();
    if (prints.length === 0) {
      return <HomeStudioPrintGalleryEmpty reason="no-prints" />;
    }
    return <HomeStudioPrintGalleryDeferred prints={prints.slice(0, HOME_STUDIO_PRINT_LIMIT)} />;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[HomeStudioPrintGallerySection]", error);
    }
    return <HomeStudioPrintGalleryEmpty reason="error" />;
  }
}
