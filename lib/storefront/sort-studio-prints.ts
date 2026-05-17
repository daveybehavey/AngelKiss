import type { PublicStudioPrint } from "@/lib/storefront/studio-prints";

/** Pin a selected print first; preserve relative order for the rest. */
export function sortStudioPrintsWithSelectedFirst(
  prints: PublicStudioPrint[],
  selectedId: string | null | undefined
): PublicStudioPrint[] {
  if (!selectedId?.trim() || prints.length < 2) {
    return prints;
  }
  const id = selectedId.trim();
  const index = prints.findIndex((p) => p.id === id);
  if (index <= 0) {
    return prints;
  }
  const selected = prints[index];
  const rest = prints.filter((_, i) => i !== index);
  return [selected, ...rest];
}
