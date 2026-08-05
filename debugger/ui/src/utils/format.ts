import type { Var } from "../../../../json-spec";

export function shortLoc(loc: string) {
  if (!loc) return "";
  const parts = loc.split("/");
  return parts[parts.length - 1];
}

export function fmtArgs(args: Var[]) {
  if (!args || args.length === 0) return "()";
  return "(" + args.map((a) => `${a.name}=${a.value}`).join(", ") + ")";
}
