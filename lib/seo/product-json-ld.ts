/** Product + breadcrumb JSON-LD for `/shop/[slug]` — values come from existing catalog fields. */

export type ProductJsonLdInput = {
  name: string;
  description: string;
  urlPath: string;
  siteOrigin: string;
  imageUrl: string | null;
  currency: string;
  priceCents: number;
  availability: "https://schema.org/InStock" | "https://schema.org/OutOfStock" | "https://schema.org/PreOrder";
};

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const pageUrl = new URL(input.urlPath, input.siteOrigin).href;
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: pageUrl,
    brand: {
      "@type": "Brand",
      name: "AnglKiss Creations"
    },
    offers: {
      "@type": "Offer",
      url: pageUrl,
      priceCurrency: input.currency,
      price: (input.priceCents / 100).toFixed(2),
      availability: input.availability
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: input.siteOrigin
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Shop",
          item: new URL("/shop", input.siteOrigin).href
        },
        {
          "@type": "ListItem",
          position: 3,
          name: input.name,
          item: pageUrl
        }
      ]
    }
  };

  if (input.imageUrl) {
    product.image = [input.imageUrl];
  }

  return product;
}
