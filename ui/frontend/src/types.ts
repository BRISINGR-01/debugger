// types.ts

export type LogEvent =
  | {
      id: string;
      event: "enter";
      function_name: string;
      args: Array<{ name: string; val: string }>;
      parent: string | null;
      loc: string;
      time: number;
    }
  | {
      fn_id: string;
      event: "assign";
      variable: string;
      oldValue: string | null;
      newValue: string;
      loc: string;
      time: number;
    }
  | {
      fn_id: string;
      event: "declare";
      variable: string;
      newValue: string;
      loc: string;
      time: number;
    }
  | {
      id: string;
      event: "exit";
      function_name: string;
      returnVal: string | null;
      loc: string;
      time: number;
    };

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
