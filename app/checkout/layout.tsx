import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Enter shipping details and pay securely with PayPal for AnglKiss Creations orders.",
  robots: {
    index: false,
    follow: true
  },
  alternates: {
    canonical: "/checkout"
  },
  openGraph: {
    title: "Checkout | AnglKiss Creations",
    description: "Secure PayPal checkout for handmade and custom-print orders.",
    type: "website",
    url: "/checkout"
  },
  twitter: {
    card: "summary",
    title: "Checkout | AnglKiss Creations",
    description: "Secure PayPal checkout for handmade and custom-print orders."
  }
};

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
