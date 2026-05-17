import type { PublicStudioPrintGroup } from "@/lib/storefront/studio-print-groups";
import type { SupabaseClient } from "@supabase/supabase-js";

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createStudioPrintGroup(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug?: string;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
    print_ids?: string[];
  }
): Promise<PublicStudioPrintGroup> {
  const name = input.name.trim();
  const slug = (input.slug?.trim() || slugifyName(name)).toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Invalid group slug");
  }

  const { data: group, error } = await supabase
    .from("studio_print_groups")
    .insert({
      name,
      slug,
      description: input.description ?? null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true
    })
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .single();

  if (error || !group) {
    throw new Error(error?.message || "Failed to create studio print group");
  }

  const printIds = input.print_ids ?? [];
  if (printIds.length > 0) {
    await replaceStudioPrintGroupMembers(supabase, group.id as string, printIds);
  }

  return {
    ...(group as PublicStudioPrintGroup),
    print_ids: printIds
  };
}

export async function updateStudioPrintGroup(
  supabase: SupabaseClient,
  groupId: string,
  patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
    print_ids?: string[];
  }
): Promise<PublicStudioPrintGroup> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    row.name = patch.name.trim();
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim().toLowerCase();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new Error("Invalid group slug");
    }
    row.slug = slug;
  }
  if (patch.description !== undefined) {
    row.description = patch.description;
  }
  if (patch.sort_order !== undefined) {
    row.sort_order = patch.sort_order;
  }
  if (patch.is_active !== undefined) {
    row.is_active = patch.is_active;
  }

  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("studio_print_groups").update(row).eq("id", groupId);
    if (error) {
      throw new Error(error.message || "Failed to update studio print group");
    }
  }

  if (patch.print_ids !== undefined) {
    await replaceStudioPrintGroupMembers(supabase, groupId, patch.print_ids);
  }

  const { data: group, error: loadError } = await supabase
    .from("studio_print_groups")
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .eq("id", groupId)
    .maybeSingle();

  if (loadError || !group) {
    throw new Error(loadError?.message || "Group not found after update");
  }

  const { data: members } = await supabase
    .from("studio_print_group_members")
    .select("studio_print_id")
    .eq("group_id", groupId);

  return {
    ...(group as PublicStudioPrintGroup),
    print_ids: (members ?? []).map((m) => m.studio_print_id as string)
  };
}

export async function deleteStudioPrintGroup(
  supabase: SupabaseClient,
  groupId: string
): Promise<void> {
  const { error } = await supabase.from("studio_print_groups").delete().eq("id", groupId);
  if (error) {
    throw new Error(error.message || "Failed to delete studio print group");
  }
}

export async function replaceStudioPrintGroupMembers(
  supabase: SupabaseClient,
  groupId: string,
  printIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("studio_print_group_members")
    .delete()
    .eq("group_id", groupId);

  if (deleteError) {
    throw new Error(deleteError.message || "Failed to clear group members");
  }

  if (printIds.length === 0) {
    return;
  }

  const unique = Array.from(new Set(printIds));
  const rows = unique.map((studio_print_id, index) => ({
    group_id: groupId,
    studio_print_id,
    sort_order: unique.length - index
  }));

  const { error: insertError } = await supabase.from("studio_print_group_members").insert(rows);
  if (insertError) {
    throw new Error(insertError.message || "Failed to assign prints to group");
  }
}
