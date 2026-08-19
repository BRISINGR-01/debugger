import type { FnNode } from "./FnTree";

export function frameHasMatch(node: FnNode, q: string): boolean {
  if (!q) return false;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  if (
    node.args.some(
      (a) =>
        a.name.toLowerCase().includes(low) ||
        a.value.toLowerCase().includes(low),
    )
  )
    return true;

  return node.timeline.some((item) => {
    if ("variable" in item)
      return (
        item.variable.name.toLowerCase().includes(low) ||
        item.variable.value.toLowerCase().includes(low) ||
        item.oldValue?.toLowerCase().includes(low)
      );
  });
}
