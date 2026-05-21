"use client";

import { StudioPrintGalleryGrid } from "@/components/storefront/studio-print-gallery-grid";
import { filterStudioPrintsBySearch } from "@/lib/storefront/filter-studio-prints";
import { sortStudioPrintsWithSelectedFirst } from "@/lib/storefront/sort-studio-prints";
import {
  countActivePrintsInGroup,
  filterPrintsByGroupSlug,
  groupsWithActivePrints,
  type PublicStudioPrintGroup
} from "@/lib/storefront/studio-print-groups";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import { shopHrefForStudioPrint } from "@/lib/storefront/studio-print-client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SEARCH_DEBOUNCE_MS = 300;

type GalleryPrintsClientProps = {
  prints: PublicStudioPrint[];
  groups: PublicStudioPrintGroup[];
};

export function GalleryPrintsClient({ prints, groups }: GalleryPrintsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupSlug = searchParams.get("group");
  const selectedId = searchParams.get("studio_print");
  const queryFromUrl = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(queryFromUrl);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const themeGroups = useMemo(
    () => groupsWithActivePrints(prints, groups),
    [prints, groups]
  );

  const byTheme = useMemo(
    () => filterPrintsByGroupSlug(prints, groups, groupSlug),
    [prints, groups, groupSlug]
  );

  const bySearch = useMemo(
    () => filterStudioPrintsBySearch(byTheme, queryFromUrl),
    [byTheme, queryFromUrl]
  );

  const sorted = useMemo(
    () => sortStudioPrintsWithSelectedFirst(bySearch, selectedId),
    [bySearch, selectedId]
  );

  const selectedPrint = useMemo(
    () => (selectedId ? prints.find((p) => p.id === selectedId) ?? null : null),
    [prints, selectedId]
  );

  const activeTheme = useMemo(
    () => (groupSlug ? groups.find((g) => g.slug === groupSlug) ?? null : null),
    [groups, groupSlug]
  );

  const hasActiveFilters = Boolean(groupSlug || queryFromUrl.trim());

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const query = params.toString();
      router.push(query ? `/gallery?${query}` : "/gallery", { scroll: false });
    },
    [router, searchParams]
  );

  function setGroup(slug: string | null) {
    pushParams((params) => {
      if (!slug || slug === "all") {
        params.delete("group");
      } else {
        params.set("group", slug);
      }
    });
  }

  function cancelSearchDebounce() {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }

  function commitSearch(value: string) {
    const trimmed = value.trim();
    pushParams((params) => {
      if (!trimmed) {
        params.delete("q");
      } else {
        params.set("q", trimmed);
      }
    });
  }

  function commitSearchNow(value: string) {
    cancelSearchDebounce();
    commitSearch(value);
  }

  function scheduleSearchDebounced(value: string) {
    cancelSearchDebounce();
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      commitSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearFilters() {
    cancelSearchDebounce();
    setSearchInput("");
    pushParams((params) => {
      params.delete("group");
      params.delete("q");
    });
  }

  return (
    <>
      <section className="panel gallery-browse-panel" aria-labelledby="gallery-browse-heading">
        <div className="gallery-browse-header">
          <div>
            <h2 id="gallery-browse-heading" className="gallery-browse-title">
              Categories &amp; themes
            </h2>
            <p className="gallery-browse-lead">
              Pick a theme to narrow the grid, or search by name and keywords.
            </p>
          </div>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-outline btn-sm gallery-clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="gallery-themes-block" aria-label="Print themes">
          <p className="gallery-themes-label">Themes</p>
          <div className="gallery-filter-row">
            <button
              type="button"
              className={`gallery-filter-chip ${!groupSlug || groupSlug === "all" ? "is-active" : ""}`}
              onClick={() => setGroup(null)}
            >
              All prints
              <span className="gallery-filter-chip-count">{prints.length}</span>
            </button>
            {themeGroups.map((group) => {
              const activeCount = countActivePrintsInGroup(prints, group);
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`gallery-filter-chip ${groupSlug === group.slug ? "is-active" : ""}`}
                  onClick={() => setGroup(group.slug)}
                >
                  {group.name}
                  <span className="gallery-filter-chip-count">{activeCount}</span>
                </button>
              );
            })}
          </div>
          {themeGroups.length === 0 ? (
            <p className="gallery-themes-empty">
              More themes coming soon — browse all designs below for now.
            </p>
          ) : null}
        </div>

        <div className="gallery-search-block">
          <label className="gallery-search-label" htmlFor="gallery-search-input">
            Search this gallery
          </label>
          <div className="gallery-search-row">
            <input
              id="gallery-search-input"
              type="search"
              className="gallery-search-input"
              placeholder="Try floral, ocean, flower, fantasy…"
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                scheduleSearchDebounced(value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSearchNow(searchInput);
                }
              }}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button
              type="button"
              className="btn btn-primary gallery-search-btn"
              onClick={() => commitSearchNow(searchInput)}
            >
              Search
            </button>
          </div>
        </div>

        <p className="gallery-results-summary" aria-live="polite">
          Showing <strong>{sorted.length}</strong> of {prints.length} print
          {prints.length === 1 ? "" : "s"}
          {activeTheme ? (
            <>
              {" "}
              in <strong>{activeTheme.name}</strong>
            </>
          ) : null}
          {queryFromUrl.trim() ? (
            <>
              {" "}
              matching &ldquo;{queryFromUrl.trim()}&rdquo;
            </>
          ) : null}
        </p>
      </section>

      {selectedPrint ? (
        <div className="gallery-selected-banner panel" role="status">
          <p className="gallery-selected-kicker">Selected print</p>
          <p className="gallery-selected-title">{selectedPrint.title}</p>
          <div className="button-row">
            <Link href={shopHrefForStudioPrint(selectedPrint)} className="btn btn-primary">
              Use on a product
            </Link>
            <Link
              href="/gallery"
              className="btn btn-outline"
              onClick={(e) => {
                e.preventDefault();
                pushParams((params) => {
                  params.delete("studio_print");
                });
              }}
            >
              Clear selection
            </Link>
          </div>
        </div>
      ) : null}

      <section className="gallery-grid-section" aria-label="Studio print designs">
        {sorted.length === 0 && prints.length > 0 ? (
          <div className="gallery-empty-panel panel">
            <p className="gallery-empty-note">No prints match your filters.</p>
            <p className="gallery-empty-hint">
              {queryFromUrl.trim() && activeTheme
                ? "Try clearing search or picking another theme."
                : queryFromUrl.trim()
                  ? "Try a shorter search or clear it to see everything."
                  : activeTheme
                    ? "This theme has no active designs right now — browse all prints or try another theme."
                    : "Clear your filters to see the full gallery."}
            </p>
            {hasActiveFilters ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <StudioPrintGalleryGrid prints={sorted} selectedPrintId={selectedId} linkToShop />
        )}
      </section>
    </>
  );
}
