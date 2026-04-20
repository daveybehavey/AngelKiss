"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode
} from "react";

export type ScrollRevealVariant = "fade-up" | "none";

export type ScrollRevealProps = {
  as?: "div" | "section";
  children: ReactNode;
  className?: string;
  /** When `none`, children are always visible (no observer). */
  variant?: ScrollRevealVariant;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

/**
 * Reveals content when it enters the viewport (Intersection Observer).
 * Starts visible for SSR/no-JS; below-the-fold blocks hide before first paint via `useLayoutEffect`.
 * Respects `prefers-reduced-motion: reduce`.
 */
export function ScrollReveal({
  as = "div",
  children,
  className = "",
  variant = "fade-up",
  ...rest
}: ScrollRevealProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  /** Start true for SSR; layout effect may hide below-fold blocks before paint. */
  const [visible, setVisible] = useState(true);

  useLayoutEffect(() => {
    if (variant === "none") {
      setVisible(true);
      return;
    }

    const node = as === "section" ? sectionRef.current : divRef.current;
    if (!node) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const vh = window.innerHeight;
    const margin = Math.round(vh * 0.08);
    const rect = node.getBoundingClientRect();
    const inView = rect.top < vh - margin && rect.bottom > margin;

    if (inView) {
      setVisible(true);
      return;
    }

    setVisible(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { root: null, rootMargin: `0px 0px -${margin}px 0px`, threshold: 0.08 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [variant, as]);

  const classes = [
    "scroll-reveal",
    variant !== "none" ? `scroll-reveal--${variant}` : "",
    visible ? "scroll-reveal-is-visible" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    className: classes,
    "data-scroll-reveal": visible ? "visible" : "hidden",
    ...rest
  };

  if (as === "section") {
    return (
      <section ref={sectionRef} {...shared}>
        {children}
      </section>
    );
  }

  return (
    <div ref={divRef} {...shared}>
      {children}
    </div>
  );
}
