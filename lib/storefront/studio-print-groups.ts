import type { SupabaseClient } from "@supabase/supabase-js";

export type StudioPrintGroupRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicStudioPrintGroup = StudioPrintGroupRow & {
  print_ids: string[];
};

export async function listActiveStudioPrintGroups(
  supabase: SupabaseClient
): Promise<PublicStudioPrintGroup[]> {
  const { data: groups, error: groupsError } = await supabase
    .from("studio_print_groups")
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: false })
    .order("name", { ascending: true });

  if (groupsError) {
    throw new Error(groupsError.message || "Failed to load studio print groups");
  }

  const rows = (groups ?? []) as StudioPrintGroupRow[];
  if (rows.length === 0) {
    return [];
  }

  const groupIds = rows.map((g) => g.id);
  const { data: members, error: membersError } = await supabase
    .from("studio_print_group_members")
    .select("group_id,studio_print_id,sort_order")
    .in("group_id", groupIds)
    .order("sort_order", { ascending: false });

  if (membersError) {
    throw new Error(membersError.message || "Failed to load studio print group members");
  }

  const byGroup = new Map<string, string[]>();
  for (const member of members ?? []) {
    const gid = member.group_id as string;
    const pid = member.studio_print_id as string;
    const list = byGroup.get(gid) ?? [];
    list.push(pid);
    byGroup.set(gid, list);
  }

  return rows.map((group) => ({
    ...group,
    print_ids: byGroup.get(group.id) ?? []
  }));
}

export async function listStudioPrintGroupsAdmin(
  supabase: SupabaseClient
): Promise<PublicStudioPrintGroup[]> {
  const { data: groups, error } = await supabase
    .from("studio_print_groups")
    .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
    .order("sort_order", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load studio print groups");
  }

  const rows = (groups ?? []) as StudioPrintGroupRow[];
  if (rows.length === 0) {
    return [];
  }

  const { data: members, error: membersError } = await supabase
    .from("studio_print_group_members")
    .select("group_id,studio_print_id,sort_order");

  if (membersError) {
    throw new Error(membersError.message || "Failed to load group members");
  }

  const byGroup = new Map<string, string[]>();
  for (const member of members ?? []) {
    const gid = member.group_id as string;
    const pid = member.studio_print_id as string;
    const list = byGroup.get(gid) ?? [];
    list.push(pid);
    byGroup.set(gid, list);
  }

  return rows.map((group) => ({
    ...group,
    print_ids: byGroup.get(group.id) ?? []
  }));
}

export function filterPrintsByGroupSlug<T extends { id: string }>(
  prints: T[],
  groups: PublicStudioPrintGroup[],
  groupSlug: string | null | undefined
): T[] {
  const slug = groupSlug?.trim().toLowerCase();
  if (!slug || slug === "all") {
    return prints;
  }
  const group = groups.find((g) => g.slug === slug);
  if (!group || group.print_ids.length === 0) {
    return [];
  }
  const allowed = new Set(group.print_ids);
  return prints.filter((p) => allowed.has(p.id));
}
