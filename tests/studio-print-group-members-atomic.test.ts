import assert from "node:assert/strict";
import test from "node:test";
import { replaceStudioPrintGroupMembers } from "../lib/admin/studio-print-groups";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

/**
 * C7 regression: replacing a gallery group's members deleted the old set
 * before inserting the new one, so an insert failure left the group
 * empty. The replacement now restores the previous members on failure.
 */

const GROUP = "99999999-9999-4999-8999-999999999999";

function member(studioPrintId: string, sortOrder: number): FakeRow {
  return { group_id: GROUP, studio_print_id: studioPrintId, sort_order: sortOrder };
}

function sortedMembers(rows: FakeRow[]): Array<[string, number]> {
  return rows
    .map((row) => [row.studio_print_id, row.sort_order] as [string, number])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

test("a failed insert restores the previous members", async () => {
  const { client, tables } = createFakeSupabase({
    studio_print_group_members: {
      rows: [member("print-1", 2), member("print-2", 1)],
      failInsertIf: (row) => row.studio_print_id === "print-bad"
    }
  });

  await assert.rejects(
    replaceStudioPrintGroupMembers(client, GROUP, ["print-3", "print-bad"]),
    /insert rejected/
  );

  assert.deepEqual(sortedMembers(tables.studio_print_group_members.rows), [
    ["print-1", 2],
    ["print-2", 1]
  ]);
});

test("a successful replace swaps the members", async () => {
  const { client, tables } = createFakeSupabase({
    studio_print_group_members: {
      rows: [member("print-1", 2), member("print-2", 1)]
    }
  });

  await replaceStudioPrintGroupMembers(client, GROUP, ["print-9"]);

  assert.deepEqual(sortedMembers(tables.studio_print_group_members.rows), [["print-9", 1]]);
});

test("replacing with an empty set still clears the group", async () => {
  const { client, tables } = createFakeSupabase({
    studio_print_group_members: {
      rows: [member("print-1", 2)]
    }
  });

  await replaceStudioPrintGroupMembers(client, GROUP, []);
  assert.equal(tables.studio_print_group_members.rows.length, 0);
});
