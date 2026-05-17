"use client";

import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  AdminToastStack,
  type AdminToast,
  type AdminToastKind
} from "@/components/admin/toast-stack";
import Link from "next/link";
import { StudioPrintGroupsPanel } from "@/components/admin/studio-print-groups-panel";
import { StudioPrintThemeChips } from "@/components/admin/studio-print-theme-chips";
import { useStudioPrintGroupsAdmin } from "@/components/admin/use-studio-print-groups-admin";
import { optimizeImageFileForUpload } from "@/lib/client/optimize-image-for-upload";
import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type UploadUrlResponse = {
  uploadUrl: string;
  storagePath: string;
  bucket: string;
  expiresAt: string;
  token?: string;
};

type PrintsResponse = {
  prints: PublicStudioPrint[];
};

type ProductSlugRow = { slug: string; name: string };

type ProductsResponse = {
  items: ProductSlugRow[];
};

const supabase = getSupabaseBrowserClient();

function parseSortOrder(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

async function readImageFileDimensions(file: File | Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      return { width: bmp.width, height: bmp.height };
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

export default function AdminStudioPrintsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [prints, setPrints] = useState<PublicStudioPrint[]>([]);
  const [productSlugs, setProductSlugs] = useState<ProductSlugRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const nextToastId = useRef(1);

  const [newFile, setNewFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newAlt, setNewAlt] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [newCtaSlug, setNewCtaSlug] = useState("");
  const [newSearchTags, setNewSearchTags] = useState("");
  const [newActive, setNewActive] = useState(true);

  const [edit, setEdit] = useState<{
    id: string;
    title: string;
    subtitle: string;
    alt_text: string;
    sort_order: string;
    primary_cta_slug: string;
    search_tags: string;
    is_active: boolean;
  } | null>(null);

  const pushToast = useCallback((kind: AdminToastKind, text: string) => {
    const toast: AdminToast = {
      id: nextToastId.current++,
      kind,
      message: text
    };
    setToasts((current) => [...current, toast]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  async function callAdmin(path: string, init?: RequestInit): Promise<unknown> {
    if (!token) {
      throw new Error("Not logged in");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, {
      ...init,
      headers
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new Error((json.error as string | undefined) ?? `Request failed (${response.status})`);
    }

    return json;
  }

  const groupsAdmin = useStudioPrintGroupsAdmin({ token, callAdmin });

  async function loadPrints() {
    if (!token) {
      setPrints([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = (await callAdmin("/api/admin/studio-prints")) as PrintsResponse;
      setPrints(res.prints ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load studio prints");
    } finally {
      setLoading(false);
    }
  }

  async function loadProductSlugs() {
    if (!token) {
      setProductSlugs([]);
      return;
    }
    try {
      const res = (await callAdmin("/api/admin/products?limit=100")) as ProductsResponse;
      const items = (res.items ?? []).map((p) => ({ slug: p.slug, name: p.name }));
      setProductSlugs(items);
    } catch {
      setProductSlugs([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setToken(data.session?.access_token ?? null);
    });
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadPrints();
    void loadProductSlugs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!error) {
      return;
    }
    pushToast("error", error);
    setError(null);
  }, [error, pushToast]);

  useEffect(() => {
    if (!message) {
      return;
    }
    pushToast("success", message);
    setMessage(null);
  }, [message, pushToast]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        throw signInError;
      }
      setPassword("");
      setMessage("Signed in.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign in");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    setMessage(null);
    await supabase.auth.signOut();
    setPrints([]);
    setEdit(null);
    setMessage("Signed out.");
  }

  async function handleAddPrint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newFile) {
      setError("Choose an image file first.");
      return;
    }
    if (!newTitle.trim()) {
      setError("Title is required.");
      return;
    }
    const sortParsed = parseSortOrder(newSortOrder);
    if (sortParsed === null) {
      setError("Sort order must be a whole number (e.g. 0 or 10).");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const optimized = await optimizeImageFileForUpload(newFile);
      const uploadInfo = (await callAdmin("/api/admin/studio-prints/upload-url", {
        method: "POST",
        body: JSON.stringify({
          filename: optimized.filename,
          content_type: optimized.contentType
        })
      })) as UploadUrlResponse;

      const putRes = await fetch(uploadInfo.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": optimized.contentType
        },
        body: optimized.blob
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      const pixels = await readImageFileDimensions(
        new File([optimized.blob], optimized.filename, { type: optimized.contentType })
      );

      const slugTrim = newCtaSlug.trim();
      await callAdmin("/api/admin/studio-prints", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          subtitle: newSubtitle.trim() ? newSubtitle.trim() : null,
          storage_path: uploadInfo.storagePath,
          alt_text: newAlt.trim() ? newAlt.trim() : null,
          sort_order: sortParsed,
          primary_cta_slug: slugTrim.length > 0 ? slugTrim : null,
          search_tags: newSearchTags.trim() ? newSearchTags.trim() : null,
          is_active: newActive,
          ...(pixels && pixels.width > 0 && pixels.height > 0
            ? { image_width: pixels.width, image_height: pixels.height }
            : {})
        })
      });

      setNewFile(null);
      setNewTitle("");
      setNewSubtitle("");
      setNewAlt("");
      setNewSortOrder("0");
      setNewCtaSlug("");
      setNewSearchTags("");
      setNewActive(true);
      setMessage("Studio print added.");
      await loadPrints();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add print");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) {
      return;
    }
    const sortParsed = parseSortOrder(edit.sort_order);
    if (!edit.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (sortParsed === null) {
      setError("Sort order must be a whole number.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const slugTrim = edit.primary_cta_slug.trim();
      await callAdmin(`/api/admin/studio-prints/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: edit.title.trim(),
          subtitle: edit.subtitle.trim() ? edit.subtitle.trim() : null,
          alt_text: edit.alt_text.trim() ? edit.alt_text.trim() : null,
          sort_order: sortParsed,
          primary_cta_slug: slugTrim.length > 0 ? slugTrim : null,
          search_tags: edit.search_tags.trim() ? edit.search_tags.trim() : null,
          is_active: edit.is_active
        })
      });
      setEdit(null);
      setMessage("Saved.");
      await loadPrints();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-main admin-page admin-studio-prints-page">
      <h1>Studio print gallery</h1>
      <p className="admin-lead">
        Upload ready-to-print artwork for the homepage carousel and the <strong>Studio gallery</strong>{" "}
        picker on custom products. Files stay in your product-images bucket under{" "}
        <code className="admin-code-inline">studio-gallery/</code>.
      </p>
      <AdminSubnav current="studio-prints" />

      <AdminToastStack toasts={toasts} onDismiss={dismissToast} />

      {!token ? (
        <section className="sectionCard">
          <h2>Sign In</h2>
          <p className="admin-note-tight">
            <Link href="/admin">← Back to item manager</Link>
          </p>
          <form onSubmit={handleSignIn} className="formGrid authForm">
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="sectionCard admin-sticky-tools">
            <div className="toolbar">
              <button type="button" onClick={() => void handleSignOut()}>
                Sign out
              </button>
              <button type="button" onClick={() => void loadPrints()} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </button>
              <Link href="/admin" className="toolbarLink">
                Back to items
              </Link>
            </div>
          </section>

          <section className="sectionCard">
            <h2>Step 1 — Add a new print</h2>
            <p className="admin-note-tight">
              Pick one image (JPG, PNG, or WebP). After upload, it appears in the list below—toggle{" "}
              <strong>Live</strong> off if you are not ready for shoppers to see it.
            </p>
            <form onSubmit={(e) => void handleAddPrint(e)} className="formGrid admin-studio-print-form">
              <label>
                Image file
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setNewFile(event.target.files?.[0] ?? null)}
                  disabled={busy}
                />
              </label>
              <label>
                Title <span className="admin-required">*</span>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="e.g. Coastal florals wrap"
                  disabled={busy}
                  required
                />
              </label>
              <label>
                Subtitle (optional)
                <input
                  value={newSubtitle}
                  onChange={(event) => setNewSubtitle(event.target.value)}
                  placeholder="Short line under the title"
                  disabled={busy}
                />
              </label>
              <label>
                Image alt text (optional)
                <input
                  value={newAlt}
                  onChange={(event) => setNewAlt(event.target.value)}
                  placeholder="Describe the art for screen readers"
                  disabled={busy}
                />
              </label>
              <label>
                Sort order
                <input
                  inputMode="numeric"
                  value={newSortOrder}
                  onChange={(event) => setNewSortOrder(event.target.value)}
                  disabled={busy}
                />
                <span className="admin-subtle">Higher numbers show first in the gallery.</span>
              </label>
              <label>
                Link to product (optional)
                <input
                  value={newCtaSlug}
                  onChange={(event) => setNewCtaSlug(event.target.value)}
                  placeholder="product-url-slug"
                  list="admin-studio-product-slugs"
                  disabled={busy}
                />
                <span className="admin-subtle">
                  When set, homepage &quot;Use this print&quot; opens that product with this print pre-selected.
                </span>
              </label>
              <label>
                Gallery search tags (optional)
                <input
                  value={newSearchTags}
                  onChange={(event) => setNewSearchTags(event.target.value)}
                  placeholder="floral, mug, mom, coastal"
                  disabled={busy}
                />
                <span className="admin-subtle">
                  Comma-separated keywords for /gallery search only—not shown on the design tile.
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={(event) => setNewActive(event.target.checked)}
                  disabled={busy}
                />
                Live on site (shoppers can see and pick it)
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Working…" : "Upload and add print"}
              </button>
            </form>
            <datalist id="admin-studio-product-slugs">
              {productSlugs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </datalist>
          </section>

          <section className="sectionCard">
            <h2>Step 2 — Your prints ({prints.length})</h2>
            {loading && prints.length === 0 ? (
              <p className="admin-note-tight">Loading…</p>
            ) : prints.length === 0 ? (
              <p className="admin-note-tight">No prints yet—add one above.</p>
            ) : (
              <ul className="admin-studio-print-list">
                {prints.map((print) => (
                  <li key={print.id} className="admin-studio-print-row panel">
                    <div className="admin-studio-print-thumb">
                      {print.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs; short-lived preview
                        <img src={print.image_url} alt={print.title} width={96} height={96} />
                      ) : (
                        <span className="admin-studio-print-thumb-fallback">No preview</span>
                      )}
                    </div>
                    <div className="admin-studio-print-body">
                      <p className="admin-studio-print-title">
                        <strong>{print.title}</strong>
                        {!print.is_active ? (
                          <span className="admin-studio-print-badge">Hidden</span>
                        ) : null}
                      </p>
                      {print.subtitle ? <p className="admin-note-tight">{print.subtitle}</p> : null}
                      <StudioPrintThemeChips
                        printId={print.id}
                        groups={groupsAdmin.groups}
                        groupsByPrintId={groupsAdmin.groupsByPrintId}
                        disabled={busy || loading || groupsAdmin.busy}
                        onToggle={async (groupId, printId, include) => {
                          try {
                            await groupsAdmin.togglePrintInGroup(groupId, printId, include);
                            const group = groupsAdmin.groups.find((g) => g.id === groupId);
                            pushToast(
                              "success",
                              include
                                ? `Added to “${group?.name ?? "theme"}”.`
                                : `Removed from “${group?.name ?? "theme"}”.`
                            );
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Failed to update theme");
                          }
                        }}
                      />
                      <p className="admin-subtle">
                        Sort {print.sort_order}
                        {print.primary_cta_slug ? ` · CTA slug: ${print.primary_cta_slug}` : ""}
                      </p>
                      {edit?.id === print.id ? (
                        <div className="formGrid admin-studio-print-edit">
                          <label>
                            Title
                            <input
                              value={edit.title}
                              onChange={(event) => setEdit({ ...edit, title: event.target.value })}
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Subtitle
                            <input
                              value={edit.subtitle}
                              onChange={(event) => setEdit({ ...edit, subtitle: event.target.value })}
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Alt text
                            <input
                              value={edit.alt_text}
                              onChange={(event) => setEdit({ ...edit, alt_text: event.target.value })}
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Sort order
                            <input
                              inputMode="numeric"
                              value={edit.sort_order}
                              onChange={(event) => setEdit({ ...edit, sort_order: event.target.value })}
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Product slug (optional)
                            <input
                              value={edit.primary_cta_slug}
                              onChange={(event) =>
                                setEdit({ ...edit, primary_cta_slug: event.target.value })
                              }
                              list="admin-studio-product-slugs"
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Gallery search tags
                            <input
                              value={edit.search_tags}
                              onChange={(event) =>
                                setEdit({ ...edit, search_tags: event.target.value })
                              }
                              placeholder="floral, mug, mom"
                              disabled={busy}
                            />
                          </label>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={edit.is_active}
                              onChange={(event) =>
                                setEdit({ ...edit, is_active: event.target.checked })
                              }
                              disabled={busy}
                            />
                            Live on site
                          </label>
                          <div className="admin-studio-print-edit-actions">
                            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEdit()}>
                              Save changes
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={busy}
                              onClick={() => setEdit(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline admin-studio-print-edit-btn"
                          onClick={() =>
                            setEdit({
                              id: print.id,
                              title: print.title,
                              subtitle: print.subtitle ?? "",
                              alt_text: print.alt_text ?? "",
                              sort_order: String(print.sort_order),
                              primary_cta_slug: print.primary_cta_slug ?? "",
                              search_tags: print.search_tags ?? "",
                              is_active: print.is_active
                            })
                          }
                        >
                          Edit details
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <StudioPrintGroupsPanel
            prints={prints}
            callAdmin={callAdmin}
            groupsAdmin={groupsAdmin}
            disabled={busy || loading}
            onNotify={pushToast}
          />
        </>
      )}
    </main>
  );
}
