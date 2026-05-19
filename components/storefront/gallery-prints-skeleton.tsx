const SKELETON_TILE_COUNT = 12;

const blockStyle = {
  display: "block",
  minHeight: "1rem",
  borderRadius: 6,
  background: "color-mix(in srgb, var(--border) 70%, transparent)"
} as const;

/** Reserves browse + grid space while gallery client chunk loads (reduces CLS). */
export function GalleryPrintsSkeleton() {
  return (
    <>
      <section
        className="panel gallery-browse-panel gallery-browse-panel-skeleton"
        aria-hidden="true"
      >
        <div className="gallery-browse-header">
          <span style={{ ...blockStyle, minHeight: "1.25rem", maxWidth: "14rem" }} />
          <span style={{ ...blockStyle, minHeight: "2.5rem", marginTop: "0.35rem" }} />
        </div>
      </section>
      <section className="gallery-grid-section" aria-hidden="true">
        <ul className="studio-print-gallery-grid gallery-grid-skeleton">
          {Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
            <li key={i}>
              <span className="gallery-skeleton-tile" />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
