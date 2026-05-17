"use client";

import type { PublicStudioPrintGroup } from "@/lib/storefront/studio-print-groups";

type StudioPrintThemeChipsProps = {
  printId: string;
  groups: PublicStudioPrintGroup[];
  groupsByPrintId: Map<string, PublicStudioPrintGroup[]>;
  disabled?: boolean;
  onToggle: (groupId: string, printId: string, include: boolean) => Promise<void>;
};

export function StudioPrintThemeChips({
  printId,
  groups,
  groupsByPrintId,
  disabled = false,
  onToggle
}: StudioPrintThemeChipsProps) {
  if (groups.length === 0) {
    return null;
  }

  const memberOf = new Set((groupsByPrintId.get(printId) ?? []).map((g) => g.id));

  return (
    <div className="admin-print-theme-chips" aria-label="Gallery themes for this print">
      <span className="admin-print-theme-chips-label">Themes:</span>
      <ul className="admin-print-theme-chips-list">
        {groups.map((group) => {
          const active = memberOf.has(group.id);
          return (
            <li key={group.id}>
              <button
                type="button"
                className={`admin-print-theme-chip ${active ? "is-active" : ""}`}
                aria-pressed={active}
                disabled={disabled}
                title={
                  active
                    ? `Remove from ${group.name}`
                    : `Add to ${group.name}`
                }
                onClick={() => void onToggle(group.id, printId, !active)}
              >
                {group.name}
                {!group.is_active ? " (hidden)" : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
