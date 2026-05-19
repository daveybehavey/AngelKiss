/** CollectionPage + breadcrumb JSON-LD for `/shop` and filtered views. */
export function buildShopCollectionJsonLd(options: {
  pageTitle: string;
  description: string;
  canonicalPath: string;
  siteOrigin: string;
}): Record<string, unknown> {
  const pageUrl = new URL(options.canonicalPath, options.siteOrigin).href;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: options.pageTitle,
    description: options.description,
    url: pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "AnglKiss Creations",
      url: options.siteOrigin
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: options.siteOrigin
        },
        {
          "@type": "ListItem",
          position: 2,
          name: options.pageTitle,
          item: pageUrl
        }
      ]
    }
  };
}
