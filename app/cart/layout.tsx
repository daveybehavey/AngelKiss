import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your AnglKiss Creations cart before secure checkout.",
  openGraph: {
    title: "Your cart | AnglKiss Creations",
    description: "Review your cart before checkout.",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Your cart | AnglKiss Creations",
    description: "Review your cart before checkout."
  }
};

export default function CartLayout({ children }: { children: ReactNode }) {
  return children;
}
