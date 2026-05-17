"use client";

import { parseSearchTags } from "@/lib/storefront/filter-studio-prints";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import { useMemo, useState } from "react";

type PickerView = "all" | "selected" | "unassigned";

type StudioPrintPickerGridProps = {
  prints: PublicStudioPrint[];
  selectedIds: string[];
  printIdsInAnyTheme?: Set<string>;
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

function printLabel(print: PublicStudioPrint): string {
  const title = print.title.trim();
  if (title.length > 0) {
    return title;
  }
  return "Untitled print";
}

export function StudioPrintPickerGrid({
  prints,
  selectedIds,
  printIdsInAnyTheme,
  onChange,
  disabled = false
}: StudioPrintPickerGridProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PickerView>("all");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const unassignedCount = useMemo(() => {
    if (!printIdsInAnyTheme) {
      return 0;
    }
    return prints.filter((p) => !printIdsInAnyTheme.has(p.id)).length;
  }, [prints, printIdsInAnyTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return prints.filter((print) => {
      if (view === "selected" && !selectedSet.has(print.id)) {
        return false;
      }
      if (view === "unassigned" && printIdsInAnyTheme?.has(print.id)) {
        return false;
      }
      if (tokens.length === 0) {
        return true;
      }
      const haystack = [
        print.title,
        print.subtitle ?? "",
        ...parseSearchTags(print.search_tags)
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [prints, query, view, selectedSet, printIdsInAnyTheme]);

  function toggle(printId: string) {
    if (disabled) {
      return;
    }
    if (selectedSet.has(printId)) {
      onChange(selectedIds.filter((id) => id !== printId));
    } else {
      onChange([...selectedIds, printId]);
    }
  }

  function selectAllShown() {
    if (disabled) {
      return;
    }
    const merged = new Set(selectedIds);
    for (const print of filtered) {
      merged.add(print.id);
    }
    onChange(Array.from(merged));
  }

  function deselectAllShown() {
    if (disabled) {
      return;
    }
    const shown = new Set(filtered.map((p) => p.id));
    onChange(selectedIds.filter((id) => !shown.has(id)));
  }

  function clearSelection() {
    if (disabled) {
      return;
    }
    onChange([]);
  }

  if (prints.length === 0) {
    return (
      <p className="admin-note-tight">
        Upload prints in Step 1 above first, then come back to assign them to this theme.
      </p>
    );
  }

  return (
    <div className="admin-print-picker">
      <div className="admin-print-picker-toolbar">
        <label className="admin-print-picker-search-label">
          Find prints
          <input
            type="search"
            className="admin-print-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or tags…"
            disabled={disabled}
          />
        </label>
        <div className="admin-print-picker-view-tabs" role="tablist" aria-label="Filter list">
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            className={`admin-print-picker-view-tab ${view === "all" ? "is-active" : ""}`}
            onClick={() => setView("all")}
            disabled={disabled}
          >
            All ({prints.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "selected"}
            className={`admin-print-picker-view-tab ${view === "selected" ? "is-active" : ""}`}
            onClick={() => setView("selected")}
            disabled={disabled}
          >
            In theme ({selectedIds.length})
          </button>
          {printIdsInAnyTheme ? (
            <button
              type="button"
              role="tab"
              aria-selected={view === "unassigned"}
              className={`admin-print-picker-view-tab ${view === "unassigned" ? "is-active" : ""}`}
              onClick={() => setView("unassigned")}
              disabled={disabled}
            >
              Not in a theme ({unassignedCount})
            </button>
          ) : null}
        </div>
      </div>

      <p className="admin-print-picker-hint">
        Click a design to add or remove it from this theme. Shoppers only see themes you mark{" "}
        <strong>Live</strong>.
      </p>

      <div className="admin-print-picker-actions">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={selectAllShown}
          disabled={disabled || filtered.length === 0}
        >
          Select all shown
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={deselectAllShown}
          disabled={disabled || filtered.length === 0}
        >
          Deselect shown
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={clearSelection}
          disabled={disabled || selectedIds.length === 0}
        >
          Clear all
        </button>
        <span className="admin-print-picker-count">
          <strong>{selectedIds.length}</strong> in this theme
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="admin-note-tight">No prints match this filter.</p>
      ) : (
        <ul className="admin-print-picker-grid" aria-label="Choose prints for theme">
          {filtered.map((print) => {
            const selected = selectedSet.has(print.id);
            const tags = parseSearchTags(print.search_tags);
            return (
              <li key={print.id}>
                <button
                  type="button"
                  className={`admin-print-picker-tile ${selected ? "is-selected" : ""}`}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => toggle(print.id)}
                >
                  <span className="admin-print-picker-thumb">
                    {print.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin signed preview
                      <img src={print.image_url} alt="" width={120} height={120} />
                    ) : (
                      <span className="admin-print-picker-thumb-fallback">No image</span>
                    )}
                    {selected ? (
                      <span className="admin-print-picker-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <span className="admin-print-picker-tile-title">{printLabel(print)}</span>
                  {print.subtitle ? (
                    <span className="admin-print-picker-tile-sub">{print.subtitle}</span>
                  ) : null}
                  {tags.length > 0 ? (
                    <span className="admin-print-picker-tile-tags">{tags.slice(0, 3).join(" · ")}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
