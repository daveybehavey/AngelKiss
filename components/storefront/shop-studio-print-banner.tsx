"use client";

import { STUDIO_PRINT_SESSION_STORAGE_KEY } from "@/lib/storefront/studio-print-client";
import Link from "next/link";
import { useEffect, useState } from "react";

type ShopStudioPrintBannerProps = {
  studioPrintId?: string;
};

export function ShopStudioPrintBanner({ studioPrintId }: ShopStudioPrintBannerProps) {
  const [visible, setVisible] = useState(Boolean(studioPrintId?.trim()));

  useEffect(() => {
    const id = studioPrintId?.trim();
    if (!id) {
      return;
    }
    try {
      window.sessionStorage.setItem(STUDIO_PRINT_SESSION_STORAGE_KEY, id);
    } catch {
      // ignore quota / private mode
    }
  }, [studioPrintId]);

  if (!visible || !studioPrintId?.trim()) {
    return null;
  }

  return (
    <div className="shop-studio-print-banner" role="status" aria-live="polite">
      <p className="shop-studio-print-banner-lead">
        <span className="shop-studio-print-banner-badge">Studio print</span>
        You arrived with a design already picked. Choose any custom photo blank, tap{" "}
        <strong>Studio gallery</strong> on the product page, and we will use this artwork.
      </p>
      <div className="shop-studio-print-banner-actions">
        <Link href="/shop?category=custom_sublimation&sublimation_mode=customer_upload" className="btn btn-primary">
          Browse custom blanks
        </Link>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setVisible(false)}
          aria-label="Dismiss studio print reminder"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
