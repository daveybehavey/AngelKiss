"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  /** IntersectionObserver rootMargin (default loads shortly before entering view). */
  rootMargin?: string;
};

/**
 * Mounts children only after the placeholder nears the viewport — keeps heavy client
 * bundles off the homepage critical path (Lighthouse TBT / LCP render delay).
 */
export function ViewportDeferredMount({
  children,
  fallback = null,
  rootMargin = "280px 0px"
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mounted) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  return <div ref={hostRef}>{mounted ? children : fallback}</div>;
}
