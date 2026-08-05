export function frameHasMatch(node, q) {
  if (!q) return false;
  const low = q.toLowerCase();
  if (node.name.toLowerCase().includes(low)) return true;
  if (node.args.some((a) => a.name.toLowerCase().includes(low) || String(a.val).toLowerCase().includes(low)))
    return true;
  return node.timeline.some((item) => {
    if (item.kind === "call") return frameHasMatch(item.node, q);
    return (
      item.variable.toLowerCase().includes(low) ||
      String(item.newValue).toLowerCase().includes(low) ||
      String(item.oldValue).toLowerCase().includes(low)
    );
  });
}
