import assert from "node:assert/strict";
import test from "node:test";
import {
  countActivePrintsInGroup,
  filterPrintsByGroupSlug,
  groupsWithActivePrints,
  type PublicStudioPrintGroup
} from "../lib/storefront/studio-print-groups";

const groupA: PublicStudioPrintGroup = {
  id: "g-a",
  name: "Floral",
  slug: "floral",
  description: null,
  sort_order: 1,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  print_ids: ["p1", "p2", "inactive-only"]
};

const groupB: PublicStudioPrintGroup = {
  id: "g-b",
  name: "Empty theme",
  slug: "empty",
  description: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  print_ids: ["inactive-only"]
};

const activePrints = [{ id: "p1" }, { id: "p2" }];

test("countActivePrintsInGroup counts intersection with active prints", () => {
  assert.equal(countActivePrintsInGroup(activePrints, groupA), 2);
  assert.equal(countActivePrintsInGroup(activePrints, groupB), 0);
});

test("groupsWithActivePrints omits groups with no active members", () => {
  const visible = groupsWithActivePrints(activePrints, [groupA, groupB]);
  assert.deepEqual(visible.map((g) => g.slug), ["floral"]);
});

test("filterPrintsByGroupSlug returns empty when group has only inactive members", () => {
  assert.equal(filterPrintsByGroupSlug(activePrints, [groupB], "empty").length, 0);
  assert.equal(filterPrintsByGroupSlug(activePrints, [groupA], "floral").length, 2);
});
