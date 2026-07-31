export function shortLoc(loc) {
  if (!loc) return "";
  const parts = loc.split("/");
  return parts[parts.length - 1];
}

export function fmtArgs(args) {
  if (!args || args.length === 0) return "()";
  return "(" + args.map((a) => `${a.name}=${a.val}`).join(", ") + ")";
}
