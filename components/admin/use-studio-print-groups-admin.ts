"use client";

import type { PublicStudioPrintGroup } from "@/lib/storefront/studio-print-groups";
import { useCallback, useEffect, useMemo, useState } from "react";

type GroupsResponse = { groups: PublicStudioPrintGroup[] };

type UseStudioPrintGroupsAdminOptions = {
  token: string | null;
  callAdmin: (path: string, init?: RequestInit) => Promise<unknown>;
};

export function useStudioPrintGroupsAdmin({ token, callAdmin }: UseStudioPrintGroupsAdminOptions) {
  const [groups, setGroups] = useState<PublicStudioPrintGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!token) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = (await callAdmin("/api/admin/studio-print-groups")) as GroupsResponse;
      setGroups(res.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load print themes");
    } finally {
      setLoading(false);
    }
  }, [token, callAdmin]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const printIdsInAnyTheme = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const printId of group.print_ids) {
        ids.add(printId);
      }
    }
    return ids;
  }, [groups]);

  const groupsByPrintId = useMemo(() => {
    const map = new Map<string, PublicStudioPrintGroup[]>();
    for (const group of groups) {
      for (const printId of group.print_ids) {
        const list = map.get(printId) ?? [];
        list.push(group);
        map.set(printId, list);
      }
    }
    return map;
  }, [groups]);

  const togglePrintInGroup = useCallback(
    async (groupId: string, printId: string, include: boolean) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) {
        return;
      }
      const nextIds = new Set(group.print_ids);
      if (include) {
        nextIds.add(printId);
      } else {
        nextIds.delete(printId);
      }
      setBusy(true);
      setError(null);
      try {
        await callAdmin(`/api/admin/studio-print-groups/${groupId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: group.name,
            slug: group.slug,
            print_ids: Array.from(nextIds),
            is_active: group.is_active
          })
        });
        await loadGroups();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update theme");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [groups, callAdmin, loadGroups]
  );

  return {
    groups,
    loading,
    busy,
    setBusy,
    error,
    setError,
    loadGroups,
    printIdsInAnyTheme,
    groupsByPrintId,
    togglePrintInGroup
  };
}
