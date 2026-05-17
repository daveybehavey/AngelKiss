"use client";

import { StudioPrintPickerGrid } from "@/components/admin/studio-print-picker-grid";
import type { useStudioPrintGroupsAdmin } from "@/components/admin/use-studio-print-groups-admin";
import type { AdminToastKind } from "@/components/admin/toast-stack";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import type { PublicStudioPrintGroup } from "@/lib/storefront/studio-print-groups";
import { useState } from "react";

const SUGGESTED_THEME_NAMES = [
  "Coastal",
  "Floral",
  "Kids",
  "Faith",
  "Sports",
  "Seasonal",
  "Mugs",
  "Tumblers"
] as const;

type GroupsAdmin = ReturnType<typeof useStudioPrintGroupsAdmin>;

type StudioPrintGroupsPanelProps = {
  prints: PublicStudioPrint[];
  callAdmin: (path: string, init?: RequestInit) => Promise<unknown>;
  groupsAdmin: GroupsAdmin;
  disabled?: boolean;
  onNotify?: (kind: AdminToastKind, message: string) => void;
};

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function StudioPrintGroupsPanel({
  prints,
  callAdmin,
  groupsAdmin,
  disabled = false,
  onNotify
}: StudioPrintGroupsPanelProps) {
  const { groups, loading, busy, setBusy, error, setError, loadGroups, printIdsInAnyTheme } =
    groupsAdmin;

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editPrintIds, setEditPrintIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editDirty, setEditDirty] = useState(false);

  const unassignedCount = prints.filter((p) => !printIdsInAnyTheme.has(p.id)).length;

  function notify(kind: AdminToastKind, message: string) {
    onNotify?.(kind, message);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) {
      setError("Theme name is required.");
      return;
    }
    const createdLabel = newName.trim();
    setBusy(true);
    setError(null);
    try {
      const slug = (newSlug.trim() || slugifyName(newName)).toLowerCase();
      const res = (await callAdmin("/api/admin/studio-print-groups", {
        method: "POST",
        body: JSON.stringify({
          name: createdLabel,
          slug,
          print_ids: [],
          is_active: true
        })
      })) as { group?: PublicStudioPrintGroup };

      const created = res.group;
      setNewName("");
      setNewSlug("");
      setSlugTouched(false);
      await loadGroups();
      notify("success", `Theme “${createdLabel}” created — pick prints below.`);
      if (created) {
        startEdit(created);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create theme");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(group: PublicStudioPrintGroup) {
    setEditId(group.id);
    setEditName(group.name);
    setEditSlug(group.slug);
    setEditPrintIds([...group.print_ids]);
    setEditActive(group.is_active);
    setEditDirty(false);
    setError(null);
  }

  function cancelEdit() {
    if (editDirty && !window.confirm("Discard unsaved changes to this theme?")) {
      return;
    }
    setEditId(null);
    setEditDirty(false);
  }

  async function saveEdit() {
    if (!editId) {
      return;
    }
    if (!editName.trim()) {
      setError("Theme name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/admin/studio-print-groups/${editId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim().toLowerCase(),
          print_ids: editPrintIds,
          is_active: editActive
        })
      });
      const savedName = editName.trim();
      setEditId(null);
      setEditDirty(false);
      await loadGroups();
      notify("success", `Theme “${savedName}” saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update theme");
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(groupId: string) {
    if (!window.confirm("Delete this theme? The prints stay in your gallery.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callAdmin(`/api/admin/studio-print-groups/${groupId}`, { method: "DELETE" });
      if (editId === groupId) {
        setEditId(null);
        setEditDirty(false);
      }
      await loadGroups();
      notify("success", "Theme deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete theme");
    } finally {
      setBusy(false);
    }
  }

  function previewThumbs(group: PublicStudioPrintGroup, limit = 4): PublicStudioPrint[] {
    return group.print_ids
      .map((id) => prints.find((p) => p.id === id))
      .filter((p): p is PublicStudioPrint => Boolean(p))
      .slice(0, limit);
  }

  function applySuggestedName(name: string) {
    setNewName(name);
    if (!slugTouched) {
      setNewSlug(slugifyName(name));
    }
  }

  const previewSlug = (editSlug.trim() || slugifyName(editName)).toLowerCase();

  return (
    <section className="sectionCard admin-studio-print-groups">
      <h2>Step 3 — Gallery themes</h2>
      <p className="admin-note-tight">
        Themes are the filter buttons shoppers see on{" "}
        <a href="/gallery" target="_blank" rel="noreferrer">
          /gallery
        </a>
        . You can also tap theme names on each print in Step 2.{" "}
        <strong>Search tags</strong> (floral, mug, mom) are set per print above—not here.
      </p>
      {prints.length > 0 && groups.length > 0 && unassignedCount > 0 ? (
        <p className="admin-print-unassigned-banner" role="status">
          <strong>{unassignedCount}</strong> print{unassignedCount === 1 ? "" : "s"} not in any
          theme yet — use <strong>Not in a theme</strong> when assigning, or theme chips on each
          print.
        </p>
      ) : null}
      <ol className="admin-steps-list admin-note-tight">
        <li>Create a theme name (e.g. Coastal, Kids).</li>
        <li>Click design thumbnails to add them—or use theme chips on each print in Step 2.</li>
        <li>Save — the theme appears on the gallery when it is Live.</li>
      </ol>
      {error ? <p className="admin-inline-error">{error}</p> : null}

      <form onSubmit={(e) => void handleCreate(e)} className="admin-theme-create-form">
        <p className="admin-subtle admin-theme-suggestions-label">Quick picks:</p>
        <ul className="admin-theme-suggestions">
          {SUGGESTED_THEME_NAMES.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="admin-theme-suggestion-chip"
                disabled={busy || disabled}
                onClick={() => applySuggestedName(name)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-theme-create-fields">
          <label>
            New theme name
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (!slugTouched) {
                  setNewSlug(slugifyName(e.target.value));
                }
              }}
              disabled={busy || disabled}
              placeholder="e.g. Coastal"
            />
          </label>
          <label>
            URL slug
            <input
              value={newSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setNewSlug(e.target.value);
              }}
              disabled={busy || disabled}
              placeholder="coastal"
            />
            <span className="admin-subtle">
              Gallery link: /gallery?group=
              {(newSlug.trim() || slugifyName(newName) || "your-theme").toLowerCase()}
            </span>
          </label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy || disabled}>
          Create theme &amp; assign prints
        </button>
      </form>

      {loading ? <p className="admin-note-tight">Loading themes…</p> : null}

      {groups.length > 0 ? (
        <ul className="admin-studio-group-list">
          {groups.map((group) => {
            const isEditing = editId === group.id;
            const thumbs = previewThumbs(group);

            return (
              <li
                key={group.id}
                className={`admin-studio-group-item panel ${isEditing ? "is-editing" : ""}`}
              >
                {isEditing ? (
                  <div className="admin-theme-editor">
                    <div className="admin-theme-editor-header">
                      <h3 className="admin-theme-editor-title">Edit theme</h3>
                      <div className="admin-theme-editor-header-actions">
                        {editActive && previewSlug ? (
                          <a
                            className="btn btn-outline btn-sm"
                            href={`/gallery?group=${encodeURIComponent(previewSlug)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview on gallery
                          </a>
                        ) : null}
                        <label className="checkbox-row admin-theme-live-toggle">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => {
                              setEditActive(e.target.checked);
                              setEditDirty(true);
                            }}
                            disabled={busy}
                          />
                          Live on gallery
                        </label>
                      </div>
                    </div>
                    <div className="formGrid admin-theme-editor-meta">
                      <label>
                        Theme name
                        <input
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            setEditDirty(true);
                          }}
                          disabled={busy}
                        />
                      </label>
                      <label>
                        URL slug
                        <input
                          value={editSlug}
                          onChange={(e) => {
                            setEditSlug(e.target.value);
                            setEditDirty(true);
                          }}
                          disabled={busy}
                        />
                      </label>
                    </div>

                    <StudioPrintPickerGrid
                      prints={prints}
                      selectedIds={editPrintIds}
                      printIdsInAnyTheme={printIdsInAnyTheme}
                      onChange={(ids) => {
                        setEditPrintIds(ids);
                        setEditDirty(true);
                      }}
                      disabled={busy || disabled}
                    />

                    <div className="button-row admin-theme-editor-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                      >
                        Save theme
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="admin-studio-group-summary-row">
                      <div className="admin-studio-group-summary-text">
                        <p className="admin-studio-group-summary">
                          <strong>{group.name}</strong>
                          <span className="admin-muted"> /{group.slug}</span>
                          {!group.is_active ? (
                            <span className="admin-studio-print-badge"> Hidden</span>
                          ) : null}
                        </p>
                        <p className="admin-subtle">
                          {group.print_ids.length} print{group.print_ids.length === 1 ? "" : "s"}{" "}
                          in this theme
                          {group.is_active ? (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={`/gallery?group=${encodeURIComponent(group.slug)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View on gallery
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {thumbs.length > 0 ? (
                        <ul className="admin-studio-group-preview" aria-hidden>
                          {thumbs.map((print) => (
                            <li key={print.id}>
                              {print.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={print.image_url} alt="" width={48} height={48} />
                              ) : null}
                            </li>
                          ))}
                          {group.print_ids.length > thumbs.length ? (
                            <li className="admin-studio-group-preview-more">
                              +{group.print_ids.length - thumbs.length}
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        onClick={() => startEdit(group)}
                      >
                        Assign prints
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        onClick={() => void removeGroup(group.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : !loading ? (
        <p className="admin-note-tight">No themes yet — create one above to organize the gallery.</p>
      ) : null}
    </section>
  );
}
