export interface FunctionScope {
  id: string;
  name: string;
  args: Array<{ name: string; val: string }>;
  parent: string | null;
  loc: string;
  enterTime: number;
  exitTime?: number;
  children: FunctionScope[];
  variables: Record<
    string,
    { value: string; history: Array<{ time: number; val: string }> }
  >;
}

export type Status = "connecting" | "open" | "closed" | "error";
